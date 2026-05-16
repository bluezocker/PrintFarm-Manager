"""Firmendaten - typischerweise ein Datensatz."""
import os
import uuid
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user, require_admin
from app.core.config import settings
from app.models import Company, User
from app.schemas import CompanyUpdate, CompanyRead

router = APIRouter(prefix="/api/company", tags=["company"])


def get_or_create_company(db: Session) -> Company:
    company = db.query(Company).first()
    if not company:
        company = Company(name="Meine Firma")
        db.add(company)
        db.commit()
        db.refresh(company)
    return company


@router.get("", response_model=CompanyRead)
def get_company(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return get_or_create_company(db)


@router.put("", response_model=CompanyRead)
def update_company(
    data: CompanyUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    company = get_or_create_company(db)
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(company, k, v)
    db.commit()
    db.refresh(company)
    return company


@router.post("/logo", response_model=CompanyRead)
async def upload_logo(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(400, "Nur Bilddateien erlaubt")

    logo_dir = Path(settings.UPLOAD_DIR) / "logos"
    logo_dir.mkdir(parents=True, exist_ok=True)

    ext = Path(file.filename or "logo.png").suffix or ".png"
    filename = f"logo_{uuid.uuid4().hex[:8]}{ext}"
    filepath = logo_dir / filename

    content = await file.read()
    with open(filepath, "wb") as f:
        f.write(content)

    company = get_or_create_company(db)
    # Alte Logo-Datei aufräumen
    if company.logo_path:
        old = Path(settings.UPLOAD_DIR) / company.logo_path
        if old.exists():
            try:
                old.unlink()
            except Exception:
                pass

    company.logo_path = f"logos/{filename}"
    db.commit()
    db.refresh(company)
    return company


@router.get("/logo")
def get_logo(db: Session = Depends(get_db)):
    """Logo öffentlich abrufbar - kein Auth-Schutz, da Anzeige im Login etc. möglich sein soll."""
    company = db.query(Company).first()
    if not company or not company.logo_path:
        raise HTTPException(404, "Kein Logo")
    path = Path(settings.UPLOAD_DIR) / company.logo_path
    if not path.exists():
        raise HTTPException(404, "Datei nicht gefunden")
    return FileResponse(path)
