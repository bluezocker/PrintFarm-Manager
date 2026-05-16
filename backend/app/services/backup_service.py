"""
Automatischer Backup-Service.

Erstellt täglich um 03:00 Uhr nachts ein DB-Backup und räumt
Backups älter als 30 Tage automatisch auf.
"""
import logging
import os
import subprocess
import threading
import time
from datetime import datetime, timedelta
from pathlib import Path

from app.core.config import settings

logger = logging.getLogger(__name__)

BACKUP_DIR = Path(settings.UPLOAD_DIR) / "backups"
KEEP_DAYS = 30
BACKUP_HOUR = 3  # 03:00 Uhr

_stop_event = threading.Event()


def _parse_db_url():
    import re
    url = settings.DATABASE_URL
    m = re.match(r"postgresql(?:\+\w+)?://([^:]+):([^@]+)@([^:/]+)(?::(\d+))?/(.+)", url)
    if not m:
        return None
    return {
        "user": m.group(1),
        "password": m.group(2),
        "host": m.group(3),
        "port": m.group(4) or "5432",
        "dbname": m.group(5),
    }


def _create_backup() -> bool:
    """Erstellt ein DB-Backup. Returns True bei Erfolg."""
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    db_info = _parse_db_url()
    if not db_info:
        logger.error("Auto-Backup: DATABASE_URL nicht parsebar")
        return False

    filename = f"auto_{datetime.now():%Y%m%d_%H%M%S}.sql"
    filepath = BACKUP_DIR / filename
    env = os.environ.copy()
    env["PGPASSWORD"] = db_info["password"]
    cmd = [
        "pg_dump",
        "-h", db_info["host"], "-p", db_info["port"],
        "-U", db_info["user"], "-d", db_info["dbname"],
        "--no-owner", "--no-privileges",
        "-f", str(filepath),
    ]
    try:
        result = subprocess.run(
            cmd, env=env, capture_output=True, text=True, timeout=300,
        )
        if result.returncode != 0:
            logger.error(f"Auto-Backup pg_dump-Fehler: {result.stderr[:500]}")
            if filepath.exists():
                filepath.unlink()
            return False
        size_kb = filepath.stat().st_size / 1024
        logger.info(f"Auto-Backup erstellt: {filename} ({size_kb:.1f} KB)")
        return True
    except FileNotFoundError:
        logger.error("Auto-Backup: pg_dump nicht installiert (postgresql-client fehlt)")
        return False
    except Exception as e:
        logger.error(f"Auto-Backup-Fehler: {e}")
        return False


def _cleanup_old_backups():
    """Löscht Backups älter als KEEP_DAYS Tage."""
    if not BACKUP_DIR.exists():
        return
    cutoff = datetime.now() - timedelta(days=KEEP_DAYS)
    for f in BACKUP_DIR.glob("auto_*.sql"):
        try:
            mtime = datetime.fromtimestamp(f.stat().st_mtime)
            if mtime < cutoff:
                f.unlink()
                logger.info(f"Auto-Backup gelöscht (alt): {f.name}")
        except Exception as e:
            logger.warning(f"Konnte {f.name} nicht löschen: {e}")


def _worker():
    """Loop: wartet bis nächste Backup-Zeit, macht Backup, schläft."""
    logger.info(f"Auto-Backup gestartet (täglich um {BACKUP_HOUR:02d}:00 Uhr)")
    # Initial-Wartezeit: 1 Minute nach Start (damit DB sicher hochgefahren ist)
    _stop_event.wait(60)

    while not _stop_event.is_set():
        now = datetime.now()
        # Nächste Backup-Zeit berechnen
        next_run = now.replace(hour=BACKUP_HOUR, minute=0, second=0, microsecond=0)
        if next_run <= now:
            next_run += timedelta(days=1)
        wait_seconds = (next_run - now).total_seconds()
        logger.debug(f"Nächstes Auto-Backup: {next_run.isoformat()} ({wait_seconds:.0f}s)")

        if _stop_event.wait(wait_seconds):
            break

        try:
            _create_backup()
            _cleanup_old_backups()
        except Exception as e:
            logger.error(f"Auto-Backup-Loop-Fehler: {e}")


def start_auto_backup():
    """Startet den Auto-Backup-Thread."""
    thread = threading.Thread(target=_worker, daemon=True, name="auto-backup")
    thread.start()


def stop_auto_backup():
    _stop_event.set()
