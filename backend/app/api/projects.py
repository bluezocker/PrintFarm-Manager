"""API für Projekte (Aufträge und Dateien gruppieren)."""
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.core.database import get_db
from app.core.security import get_current_user
from app.models import Project, PrintJob, LibraryFile, Customer, User

router = APIRouter(prefix="/api/projects", tags=["projects"])


class ProjectRead(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    color: Optional[str] = None
    status: str = "active"
    customer_id: Optional[int] = None
    customer_name: Optional[str] = None
    external_url: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    # Statistiken
    job_count: int = 0
    file_count: int = 0
    completed_count: int = 0
    model_config = ConfigDict(from_attributes=True)


class ProjectCreate(BaseModel):
    name: str
    description: Optional[str] = None
    color: Optional[str] = None
    status: str = "active"
    customer_id: Optional[int] = None
    external_url: Optional[str] = None


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    color: Optional[str] = None
    status: Optional[str] = None
    customer_id: Optional[int] = None
    external_url: Optional[str] = None


def _project_stats(db: Session, project: Project) -> dict:
    """Statistiken für ein Projekt berechnen."""
    job_count = db.query(func.count(PrintJob.id)).filter(
        PrintJob.project_id == project.id
    ).scalar() or 0
    file_count = db.query(func.count(LibraryFile.id)).filter(
        LibraryFile.project_id == project.id
    ).scalar() or 0
    completed_count = db.query(func.count(PrintJob.id)).filter(
        PrintJob.project_id == project.id,
        PrintJob.status.in_(["completed", "paid"]),
    ).scalar() or 0
    customer_name = None
    if project.customer_id:
        customer = db.query(Customer).filter(Customer.id == project.customer_id).first()
        if customer:
            customer_name = (
                customer.company_name if customer.customer_type == "business"
                else f"{customer.first_name or ''} {customer.last_name or ''}".strip()
            )
    return {
        "job_count": job_count,
        "file_count": file_count,
        "completed_count": completed_count,
        "customer_name": customer_name,
    }


@router.get("", response_model=List[ProjectRead])
def list_projects(
    status: Optional[str] = None,
    customer_id: Optional[int] = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    q = db.query(Project)
    if status:
        q = q.filter(Project.status == status)
    if customer_id is not None:
        q = q.filter(Project.customer_id == customer_id)
    projects = q.order_by(Project.updated_at.desc().nulls_last(), Project.created_at.desc()).all()

    result = []
    for p in projects:
        data = ProjectRead.model_validate(p).model_dump()
        data.update(_project_stats(db, p))
        result.append(data)
    return result


@router.get("/{project_id}", response_model=ProjectRead)
def get_project(
    project_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    p = db.query(Project).filter(Project.id == project_id).first()
    if not p:
        raise HTTPException(404, "Projekt nicht gefunden")
    data = ProjectRead.model_validate(p).model_dump()
    data.update(_project_stats(db, p))
    return data


@router.post("", response_model=ProjectRead, status_code=201)
def create_project(
    data: ProjectCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    p = Project(**data.model_dump(exclude_unset=True), created_by_id=current_user.id)
    db.add(p)
    db.commit()
    db.refresh(p)
    result = ProjectRead.model_validate(p).model_dump()
    result.update(_project_stats(db, p))
    return result


@router.patch("/{project_id}", response_model=ProjectRead)
def update_project(
    project_id: int,
    data: ProjectUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    p = db.query(Project).filter(Project.id == project_id).first()
    if not p:
        raise HTTPException(404, "Projekt nicht gefunden")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(p, k, v)
    db.commit()
    db.refresh(p)
    result = ProjectRead.model_validate(p).model_dump()
    result.update(_project_stats(db, p))
    return result


@router.delete("/{project_id}", status_code=204)
def delete_project(
    project_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Löscht ein Projekt. Zugewiesene Aufträge/Dateien bleiben erhalten
    (project_id wird auf NULL gesetzt via ondelete=SET NULL)."""
    p = db.query(Project).filter(Project.id == project_id).first()
    if not p:
        raise HTTPException(404, "Projekt nicht gefunden")
    db.delete(p)
    db.commit()


@router.post("/{project_id}/assign-jobs")
def assign_jobs(
    project_id: int,
    job_ids: List[int],
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Weist mehrere Aufträge einem Projekt zu."""
    p = db.query(Project).filter(Project.id == project_id).first()
    if not p:
        raise HTTPException(404, "Projekt nicht gefunden")
    jobs = db.query(PrintJob).filter(PrintJob.id.in_(job_ids)).all()
    for j in jobs:
        j.project_id = project_id
    db.commit()
    return {"success": True, "count": len(jobs)}


@router.post("/{project_id}/assign-files")
def assign_files(
    project_id: int,
    file_ids: List[int],
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Weist mehrere Archiv-Dateien einem Projekt zu."""
    p = db.query(Project).filter(Project.id == project_id).first()
    if not p:
        raise HTTPException(404, "Projekt nicht gefunden")
    files = db.query(LibraryFile).filter(LibraryFile.id.in_(file_ids)).all()
    for f in files:
        f.project_id = project_id
    db.commit()
    return {"success": True, "count": len(files)}


@router.get("/{project_id}/jobs")
def get_project_jobs(
    project_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Liefert alle Aufträge im Projekt (kompaktes Format)."""
    jobs = db.query(PrintJob).filter(PrintJob.project_id == project_id).order_by(
        PrintJob.created_at.desc()
    ).all()
    result = []
    for j in jobs:
        customer = db.query(Customer).filter(Customer.id == j.customer_id).first()
        customer_name = ""
        if customer:
            customer_name = (
                customer.company_name if customer.customer_type == "business"
                else f"{customer.first_name or ''} {customer.last_name or ''}".strip()
            )
        result.append({
            "id": j.id,
            "title": j.title,
            "order_number": j.order_number,
            "status": j.status,
            "customer_id": j.customer_id,
            "customer_name": customer_name,
            "quantity": j.quantity,
            "estimated_hours": j.estimated_hours,
            "due_date": j.due_date.isoformat() if j.due_date else None,
            "price_gross": j.price_gross,
        })
    return result


@router.get("/{project_id}/files")
def get_project_files(
    project_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Liefert alle Archiv-Dateien im Projekt."""
    from pathlib import Path
    files = db.query(LibraryFile).filter(LibraryFile.project_id == project_id).order_by(
        LibraryFile.upload_date.desc()
    ).all()
    result = []
    for f in files:
        result.append({
            "id": f.id,
            "filename": f.filename,
            "display_name": f.display_name,
            "file_type": f.file_type,
            "file_size": f.file_size,
            "estimated_time_minutes": f.estimated_time_minutes,
            "estimated_material_g": f.estimated_material_g,
            "times_printed": f.times_printed,
            "has_thumbnail": bool(f.thumbnail_path and Path(f.thumbnail_path).exists()),
            "upload_date": f.upload_date.isoformat() if f.upload_date else None,
        })
    return result
