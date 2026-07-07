"""Print Queue (Warteschlange).

Aufträge werden pro Drucker in eine geordnete Warteschlange gesetzt.
Der User kann per Drag&Drop die Reihenfolge ändern.
"""
from typing import List, Optional
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Body
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user
from app.models import PrintJob, Customer, User

router = APIRouter(prefix="/api/queue", tags=["queue"])


class QueueItem(BaseModel):
    id: int
    title: str
    order_number: Optional[str] = None
    customer_name: str = ""
    status: str
    queue_position: int
    queue_printer_id: Optional[int] = None
    estimated_hours: Optional[float] = None
    due_date: Optional[str] = None
    print_file_name: Optional[str] = None


class EnqueueRequest(BaseModel):
    printer_id: int


class ReorderRequest(BaseModel):
    job_ids: List[int]     # Neue Reihenfolge


def _job_to_queue_item(j: PrintJob, db: Session) -> dict:
    customer = db.query(Customer).filter(Customer.id == j.customer_id).first()
    customer_name = ""
    if customer:
        customer_name = (
            customer.company_name if customer.customer_type == "business"
            else f"{customer.first_name or ''} {customer.last_name or ''}".strip()
        )
    return {
        "id": j.id,
        "title": j.title or "(ohne Titel)",
        "order_number": j.order_number,
        "customer_name": customer_name,
        "status": j.status,
        "queue_position": j.queue_position or 0,
        "queue_printer_id": j.queue_printer_id,
        "estimated_hours": j.estimated_hours,
        "due_date": j.due_date.isoformat() if j.due_date else None,
        "print_file_name": j.print_file_name,
    }


@router.get("/{printer_id}", response_model=List[QueueItem])
def get_queue(
    printer_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Warteschlange für einen bestimmten Drucker."""
    jobs = (
        db.query(PrintJob)
        .filter(
            PrintJob.queue_printer_id == printer_id,
            PrintJob.queue_position.isnot(None),
            ~PrintJob.status.in_(["completed", "paid", "cancelled"]),
        )
        .order_by(PrintJob.queue_position.asc())
        .all()
    )
    return [_job_to_queue_item(j, db) for j in jobs]


@router.post("/jobs/{job_id}/enqueue")
def enqueue_job(
    job_id: int,
    req: EnqueueRequest,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Fügt einen Auftrag ans Ende der Warteschlange eines Druckers hinzu."""
    j = db.query(PrintJob).filter(PrintJob.id == job_id).first()
    if not j:
        raise HTTPException(404, "Auftrag nicht gefunden")

    # Höchste Queue-Position für diesen Drucker + 1
    from sqlalchemy import func
    max_pos = (
        db.query(func.max(PrintJob.queue_position))
        .filter(PrintJob.queue_printer_id == req.printer_id)
        .scalar()
    ) or 0

    j.queue_printer_id = req.printer_id
    j.queue_position = max_pos + 1
    db.commit()
    return {"success": True, "queue_position": j.queue_position}


@router.delete("/jobs/{job_id}")
def dequeue_job(
    job_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Entfernt einen Auftrag aus der Warteschlange."""
    j = db.query(PrintJob).filter(PrintJob.id == job_id).first()
    if not j:
        raise HTTPException(404, "Auftrag nicht gefunden")
    j.queue_printer_id = None
    j.queue_position = None
    db.commit()
    return {"success": True}


@router.post("/{printer_id}/reorder")
def reorder_queue(
    printer_id: int,
    req: ReorderRequest,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Setzt die Reihenfolge der Warteschlange neu (Drag & Drop)."""
    for position, job_id in enumerate(req.job_ids, start=1):
        j = db.query(PrintJob).filter(
            PrintJob.id == job_id,
            PrintJob.queue_printer_id == printer_id,
        ).first()
        if j:
            j.queue_position = position
    db.commit()
    return {"success": True, "count": len(req.job_ids)}


@router.get("/{printer_id}/next", response_model=Optional[QueueItem])
def get_next(
    printer_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Nächster Auftrag in der Warteschlange."""
    j = (
        db.query(PrintJob)
        .filter(
            PrintJob.queue_printer_id == printer_id,
            PrintJob.queue_position.isnot(None),
            ~PrintJob.status.in_(["completed", "paid", "cancelled"]),
        )
        .order_by(PrintJob.queue_position.asc())
        .first()
    )
    if not j:
        return None
    return _job_to_queue_item(j, db)
