"""3MF/G-Code Datei-Bibliothek (Archiv).

Ermöglicht Upload, Verwaltung und Direkt-Druck von 3MF/G-Code Dateien.
"""
import io
import re
import zipfile
import logging
from datetime import datetime
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.config import settings
from app.core.security import get_current_user
from app.models import LibraryFile, User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/library", tags=["library"])


ALLOWED_EXTENSIONS = {".3mf", ".gcode", ".gco", ".stl", ".bgcode"}
MAX_FILE_SIZE = 200 * 1024 * 1024   # 200 MB


class LibraryFileRead(BaseModel):
    id: int
    filename: str
    display_name: Optional[str] = None
    file_size: Optional[int] = None
    file_type: Optional[str] = None
    tags: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    estimated_time_minutes: Optional[int] = None
    estimated_material_g: Optional[float] = None
    layer_height: Optional[float] = None
    nozzle_diameter: Optional[float] = None
    times_printed: int = 0
    upload_date: Optional[datetime] = None
    last_used_date: Optional[datetime] = None
    has_thumbnail: bool = False
    uploaded_by_id: Optional[int] = None
    model_config = ConfigDict(from_attributes=True)


class LibraryFileUpdate(BaseModel):
    display_name: Optional[str] = None
    tags: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None


def _library_dir() -> Path:
    d = Path(settings.UPLOAD_DIR) / "library"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _thumbnail_dir() -> Path:
    d = Path(settings.UPLOAD_DIR) / "library_thumbs"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _find_thumbnail_in_3mf(z: zipfile.ZipFile) -> Optional[bytes]:
    """Findet das Thumbnail im 3MF (ZIP).

    Bambu Studio, OrcaSlicer, Prusa Slicer, Cura und weitere verwenden
    unterschiedliche Konventionen. Wir gehen die häufigsten Pfade
    priorisiert durch und fallen dann auf jede beliebige .png zurück.
    """
    all_names = z.namelist()
    # Case-insensitive lookup
    lower_map = {n.lower(): n for n in all_names}

    # Priorisierte Kandidaten - erste Wahl: großes Plate-Thumbnail
    priority = [
        "metadata/plate_1.png",
        "metadata/plate_1_small.png",
        "metadata/plate_no_light_1.png",
        "metadata/top_1.png",
        "metadata/pick_1.png",
        "metadata/thumbnail.png",
        "3d/thumbnail.png",
        "thumbnail.png",
        # Prusa Slicer
        "metadata/thumbnail_1.png",
        # Cura
        "thumbnails/thumbnail.png",
    ]
    for candidate in priority:
        if candidate in lower_map:
            try:
                data = z.read(lower_map[candidate])
                if data and len(data) > 100:  # Muss zumindest ein bisschen was sein
                    logger.info(f"3MF thumbnail gefunden: {lower_map[candidate]} ({len(data)} bytes)")
                    return data
            except Exception as e:
                logger.warning(f"Kann {candidate} nicht lesen: {e}")

    # Fallback 1: Jede PNG mit "thumb", "plate" oder "preview" im Namen
    for name in all_names:
        low = name.lower()
        if not low.endswith(".png"):
            continue
        if any(kw in low for kw in ["thumb", "plate", "preview", "top", "pick"]):
            try:
                data = z.read(name)
                if data and len(data) > 100:
                    logger.info(f"3MF thumbnail (fallback keyword): {name} ({len(data)} bytes)")
                    return data
            except Exception:
                continue

    # Fallback 2: Erste beliebige PNG im Archiv
    for name in all_names:
        if name.lower().endswith(".png"):
            try:
                data = z.read(name)
                if data and len(data) > 100:
                    logger.info(f"3MF thumbnail (fallback any png): {name} ({len(data)} bytes)")
                    return data
            except Exception:
                continue

    logger.info(f"Kein Thumbnail in 3MF gefunden. Vorhandene Dateien: {all_names[:20]}")
    return None


def _extract_3mf_metadata(file_bytes: bytes) -> dict:
    """Extrahiert Metadaten und Thumbnail aus einer 3MF-Datei.

    3MF ist ein ZIP-Container mit verschiedenen Metadata-Dateien.
    """
    result = {
        "thumbnail_bytes": None,
        "estimated_time_minutes": None,
        "estimated_material_g": None,
        "layer_height": None,
        "nozzle_diameter": None,
    }
    try:
        with zipfile.ZipFile(io.BytesIO(file_bytes)) as z:
            names = z.namelist()

            # Thumbnail suchen
            result["thumbnail_bytes"] = _find_thumbnail_in_3mf(z)

            # slice_info.config - XML mit Slice-Metadaten (Bambu Studio / OrcaSlicer)
            slice_config_names = [n for n in names if n.lower().endswith("slice_info.config")]
            if slice_config_names:
                try:
                    content = z.read(slice_config_names[0]).decode("utf-8", errors="ignore")
                    # Druckzeit in Sekunden (mehrere mögliche Keys)
                    m = re.search(r'(?:prediction|estimated_time)[^0-9]*(\d+)', content)
                    if m:
                        result["estimated_time_minutes"] = int(int(m.group(1)) / 60)
                    # Material in Gramm
                    m = re.search(r'(?:weight|filament_weight)[^0-9]*([\d.]+)', content)
                    if m:
                        result["estimated_material_g"] = float(m.group(1))
                    # Layer height
                    m = re.search(r'layer_height[^\d]*([\d.]+)', content)
                    if m:
                        result["layer_height"] = float(m.group(1))
                    # Nozzle diameter
                    m = re.search(r'nozzle_diameter[^\d]*([\d.]+)', content)
                    if m:
                        result["nozzle_diameter"] = float(m.group(1))
                except Exception as e:
                    logger.warning(f"slice_info.config parse fehler: {e}")

            # Alternative: project_settings.config (auch Bambu)
            if not result["estimated_time_minutes"]:
                proj_names = [n for n in names if n.lower().endswith("project_settings.config")]
                if proj_names:
                    try:
                        content = z.read(proj_names[0]).decode("utf-8", errors="ignore")
                        m = re.search(r'"?prediction"?\s*:\s*"?(\d+)', content)
                        if m:
                            result["estimated_time_minutes"] = int(int(m.group(1)) / 60)
                    except Exception:
                        pass
    except zipfile.BadZipFile:
        logger.warning("Datei ist keine gültige ZIP-Datei (3MF)")
    except Exception as e:
        logger.warning(f"3MF-Extraktion fehlgeschlagen: {e}")
    return result


@router.get("", response_model=List[LibraryFileRead])
def list_files(
    category: Optional[str] = None,
    tag: Optional[str] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    q = db.query(LibraryFile)
    if category:
        q = q.filter(LibraryFile.category == category)
    if tag:
        q = q.filter(LibraryFile.tags.contains(tag))
    if search:
        s = f"%{search}%"
        q = q.filter(
            (LibraryFile.filename.ilike(s)) |
            (LibraryFile.display_name.ilike(s)) |
            (LibraryFile.description.ilike(s))
        )
    files = q.order_by(LibraryFile.upload_date.desc()).all()
    # has_thumbnail Feld setzen
    result = []
    for f in files:
        data = LibraryFileRead.model_validate(f).model_dump()
        data["has_thumbnail"] = bool(f.thumbnail_path and Path(f.thumbnail_path).exists())
        result.append(data)
    return result


@router.post("/upload", response_model=LibraryFileRead)
async def upload_file(
    file: UploadFile = File(...),
    display_name: Optional[str] = Form(None),
    category: Optional[str] = Form("general"),
    tags: Optional[str] = Form(None),
    description: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Lädt eine 3MF/G-Code Datei in die Bibliothek hoch."""
    filename = file.filename or "unnamed"
    ext = Path(filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            400,
            f"Dateityp nicht erlaubt. Erlaubt: {', '.join(sorted(ALLOWED_EXTENSIONS))}"
        )

    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(400, f"Datei zu groß (max. {MAX_FILE_SIZE // 1024 // 1024} MB)")

    # Speichern
    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    safe_name = "".join(c for c in Path(filename).stem if c.isalnum() or c in "._-")[:100]
    stored_filename = f"{timestamp}_{safe_name}{ext}"
    target = _library_dir() / stored_filename
    target.write_bytes(content)
    logger.info(f"Library: gespeichert {stored_filename} ({len(content)} bytes)")

    # Metadaten aus 3MF extrahieren
    thumbnail_path = None
    metadata = {}
    if ext == ".3mf":
        metadata = _extract_3mf_metadata(content)
        if metadata.get("thumbnail_bytes"):
            thumb_path = _thumbnail_dir() / f"{timestamp}_{safe_name}.png"
            thumb_path.write_bytes(metadata["thumbnail_bytes"])
            thumbnail_path = str(thumb_path)
            logger.info(f"Library: Thumbnail gespeichert unter {thumb_path}")
        else:
            logger.warning(f"Library: Kein Thumbnail in {filename} gefunden")

    entry = LibraryFile(
        filename=filename,
        display_name=display_name or Path(filename).stem,
        stored_path=str(target),
        file_size=len(content),
        file_type=ext.lstrip("."),
        thumbnail_path=thumbnail_path,
        estimated_time_minutes=metadata.get("estimated_time_minutes"),
        estimated_material_g=metadata.get("estimated_material_g"),
        layer_height=metadata.get("layer_height"),
        nozzle_diameter=metadata.get("nozzle_diameter"),
        tags=tags,
        description=description,
        category=category or "general",
        uploaded_by_id=current_user.id,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)

    data = LibraryFileRead.model_validate(entry).model_dump()
    data["has_thumbnail"] = bool(thumbnail_path)
    return data


@router.patch("/{file_id}", response_model=LibraryFileRead)
def update_file(
    file_id: int,
    data: LibraryFileUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    f = db.query(LibraryFile).filter(LibraryFile.id == file_id).first()
    if not f:
        raise HTTPException(404, "Datei nicht gefunden")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(f, k, v)
    db.commit()
    db.refresh(f)
    result = LibraryFileRead.model_validate(f).model_dump()
    result["has_thumbnail"] = bool(f.thumbnail_path and Path(f.thumbnail_path).exists())
    return result


@router.delete("/{file_id}", status_code=204)
def delete_file(
    file_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    f = db.query(LibraryFile).filter(LibraryFile.id == file_id).first()
    if not f:
        raise HTTPException(404, "Datei nicht gefunden")
    for p in [f.stored_path, f.thumbnail_path]:
        if p and Path(p).exists():
            try:
                Path(p).unlink()
            except Exception:
                pass
    db.delete(f)
    db.commit()


@router.get("/{file_id}/download")
def download_file(
    file_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    f = db.query(LibraryFile).filter(LibraryFile.id == file_id).first()
    if not f:
        raise HTTPException(404, "Datei nicht gefunden")
    p = Path(f.stored_path)
    if not p.exists():
        raise HTTPException(404, "Datei nicht auf Server")
    return FileResponse(p, filename=f.filename)


@router.get("/{file_id}/thumbnail")
def get_thumbnail(
    file_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    f = db.query(LibraryFile).filter(LibraryFile.id == file_id).first()
    if not f or not f.thumbnail_path:
        raise HTTPException(404, "Kein Thumbnail vorhanden")
    p = Path(f.thumbnail_path)
    if not p.exists():
        raise HTTPException(404, "Thumbnail nicht auf Server")
    return FileResponse(p, media_type="image/png")


@router.post("/{file_id}/regenerate-thumbnail")
def regenerate_thumbnail(
    file_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Extrahiert das Thumbnail nochmal aus der Original-Datei.

    Nützlich für Dateien die vor einer Verbesserung des Extraktors hochgeladen wurden.
    """
    f = db.query(LibraryFile).filter(LibraryFile.id == file_id).first()
    if not f:
        raise HTTPException(404, "Datei nicht gefunden")
    if f.file_type != "3mf":
        raise HTTPException(400, "Nur für 3MF-Dateien verfügbar")

    p = Path(f.stored_path)
    if not p.exists():
        raise HTTPException(404, "Original-Datei nicht auf Server")

    metadata = _extract_3mf_metadata(p.read_bytes())
    if not metadata.get("thumbnail_bytes"):
        raise HTTPException(400, "Kein Thumbnail in der Datei gefunden")

    # Neuen Thumbnail-Pfad
    stem = Path(f.stored_path).stem
    thumb_path = _thumbnail_dir() / f"{stem}.png"
    thumb_path.write_bytes(metadata["thumbnail_bytes"])

    # Alten löschen wenn anderer Pfad
    if f.thumbnail_path and f.thumbnail_path != str(thumb_path):
        old = Path(f.thumbnail_path)
        if old.exists():
            try:
                old.unlink()
            except Exception:
                pass

    f.thumbnail_path = str(thumb_path)
    # Metadaten auch aktualisieren
    if metadata.get("estimated_time_minutes"):
        f.estimated_time_minutes = metadata["estimated_time_minutes"]
    if metadata.get("estimated_material_g"):
        f.estimated_material_g = metadata["estimated_material_g"]
    db.commit()
    return {"success": True, "thumbnail_path": str(thumb_path)}


@router.post("/{file_id}/mark-used")
def mark_used(
    file_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    f = db.query(LibraryFile).filter(LibraryFile.id == file_id).first()
    if not f:
        raise HTTPException(404, "Datei nicht gefunden")
    f.times_printed = (f.times_printed or 0) + 1
    f.last_used_date = datetime.utcnow()
    db.commit()
    return {"success": True, "times_printed": f.times_printed}
