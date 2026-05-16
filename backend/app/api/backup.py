"""Backup-Verwaltung: DB-Dump und Restore."""
import os
import subprocess
from datetime import datetime
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.security import require_admin
from app.models import User

router = APIRouter(prefix="/api/backup", tags=["backup"])

BACKUP_DIR = Path(settings.UPLOAD_DIR) / "backups"
BACKUP_DIR.mkdir(parents=True, exist_ok=True)


def _parse_db_url():
    """Postgres-Connection-Parameter aus DATABASE_URL extrahieren."""
    url = settings.DATABASE_URL
    # postgresql://user:pass@host:port/dbname
    import re
    m = re.match(r"postgresql(?:\+\w+)?://([^:]+):([^@]+)@([^:/]+)(?::(\d+))?/(.+)", url)
    if not m:
        raise ValueError(f"Konnte DATABASE_URL nicht parsen: {url}")
    return {
        "user": m.group(1),
        "password": m.group(2),
        "host": m.group(3),
        "port": m.group(4) or "5432",
        "dbname": m.group(5),
    }


@router.get("")
def list_backups(_: User = Depends(require_admin)):
    """Listet alle vorhandenen Backup-Dateien."""
    backups = []
    for f in sorted(BACKUP_DIR.glob("*.sql"), reverse=True):
        stat = f.stat()
        backups.append({
            "filename": f.name,
            "size_bytes": stat.st_size,
            "size_kb": round(stat.st_size / 1024, 1),
            "created_at": datetime.fromtimestamp(stat.st_mtime).isoformat(),
        })
    return backups


@router.post("/create")
def create_backup(current_user: User = Depends(require_admin)):
    """Erzeugt sofort ein DB-Backup."""
    db_info = _parse_db_url()
    filename = f"printfarm_{datetime.now():%Y%m%d_%H%M%S}.sql"
    filepath = BACKUP_DIR / filename

    env = os.environ.copy()
    env["PGPASSWORD"] = db_info["password"]
    cmd = [
        "pg_dump",
        "-h", db_info["host"],
        "-p", db_info["port"],
        "-U", db_info["user"],
        "-d", db_info["dbname"],
        "--no-owner", "--no-privileges",
        "-f", str(filepath),
    ]
    try:
        result = subprocess.run(
            cmd, env=env, capture_output=True, text=True, timeout=300,
        )
        if result.returncode != 0:
            if filepath.exists():
                filepath.unlink()
            raise HTTPException(
                500,
                f"pg_dump fehlgeschlagen: {result.stderr[:500]}"
            )
    except subprocess.TimeoutExpired:
        raise HTTPException(500, "Backup-Timeout (>5min)")
    except FileNotFoundError:
        raise HTTPException(
            500,
            "pg_dump ist nicht installiert. Bitte 'postgresql-client' im Backend-Image installieren.",
        )

    return {
        "filename": filename,
        "size_kb": round(filepath.stat().st_size / 1024, 1),
        "path": str(filepath),
    }


@router.get("/download/{filename}")
def download_backup(filename: str, _: User = Depends(require_admin)):
    # Sicherheit: keine Path-Traversal
    if "/" in filename or "\\" in filename or ".." in filename:
        raise HTTPException(400, "Ungültiger Dateiname")
    filepath = BACKUP_DIR / filename
    if not filepath.exists():
        raise HTTPException(404, "Backup nicht gefunden")
    return FileResponse(
        filepath, media_type="application/sql", filename=filename
    )


@router.delete("/{filename}", status_code=204)
def delete_backup(filename: str, _: User = Depends(require_admin)):
    if "/" in filename or "\\" in filename or ".." in filename:
        raise HTTPException(400, "Ungültiger Dateiname")
    filepath = BACKUP_DIR / filename
    if not filepath.exists():
        raise HTTPException(404, "Backup nicht gefunden")
    filepath.unlink()


@router.post("/cleanup")
def cleanup_old_backups(
    keep_days: int = 30,
    _: User = Depends(require_admin),
):
    """Löscht Backups älter als keep_days Tage."""
    from datetime import timedelta
    cutoff = datetime.now() - timedelta(days=keep_days)
    deleted = []
    for f in BACKUP_DIR.glob("*.sql"):
        if datetime.fromtimestamp(f.stat().st_mtime) < cutoff:
            f.unlink()
            deleted.append(f.name)
    return {"deleted_count": len(deleted), "deleted": deleted}
