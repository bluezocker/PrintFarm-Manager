"""Dashboard-Widgets: aggregierte Daten für die Übersichtsseite."""
from datetime import datetime, timedelta, date as Date
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.core.database import get_db
from app.core.security import get_current_user
from app.models import (
    Printer, Filament, PrintJob, PrintHistory, Invoice, InventoryItem,
    Maintenance, Customer, User,
)

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("/overview")
def overview(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    """Liefert alle Daten für die Dashboard-Widgets in einem Aufruf."""

    today = Date.today()
    soon_14d = today + timedelta(days=14)
    soon_30d = today + timedelta(days=30)
    month_ago = datetime.utcnow() - timedelta(days=30)

    # ====================== DRUCKER ======================
    printers = db.query(Printer).all()
    active_jobs = []
    for p in printers:
        if p.status == "printing":
            active_jobs.append({
                "id": p.id,
                "name": p.name,
                "current_job_name": p.current_job_name,
                "progress": p.progress or 0,
                "remaining_time": p.remaining_time,
                "nozzle_temp": p.nozzle_temp,
                "bed_temp": p.bed_temp,
            })

    printers_data = {
        "total": len(printers),
        "printing": sum(1 for p in printers if p.status == "printing"),
        "idle": sum(1 for p in printers if p.status == "idle"),
        "error": sum(1 for p in printers if p.status == "error"),
        "offline": sum(1 for p in printers if p.status not in ("printing", "idle", "error")),
        "active_jobs": active_jobs,
    }

    # ====================== AUFTRÄGE ======================
    open_jobs = db.query(PrintJob).filter(
        PrintJob.status.in_(["new", "in_progress", "printing"])
    ).all()
    overdue_jobs = sum(
        1 for j in open_jobs
        if j.due_date and j.due_date < today
    )
    due_soon = sum(
        1 for j in open_jobs
        if j.due_date and today <= j.due_date <= soon_14d
    )
    completed_30d = db.query(PrintJob).filter(
        PrintJob.status == "completed",
        PrintJob.completion_date >= (today - timedelta(days=30)),
    ).count()

    jobs_data = {
        "total_open": len(open_jobs),
        "overdue": overdue_jobs,
        "due_soon": due_soon,
        "completed_30d": completed_30d,
    }

    # ====================== RECHNUNGEN ======================
    sent_open = db.query(Invoice).filter(
        Invoice.status.in_(["sent", "overdue", "reminder_1", "reminder_2", "reminder_3"])
    ).all()

    overdue_inv_count = sum(
        1 for inv in sent_open
        if inv.due_date and inv.due_date < today
    )
    outstanding_amount = sum(inv.total_gross or 0 for inv in sent_open)

    paid_30d = db.query(Invoice).filter(
        Invoice.paid_date.isnot(None),
        Invoice.paid_date >= (today - timedelta(days=30)),
    ).all()
    revenue_30d = sum(inv.total_gross or 0 for inv in paid_30d)

    invoices_data = {
        "sent_open": len([inv for inv in sent_open if inv.status == "sent"]),
        "overdue": overdue_inv_count,
        "outstanding": round(outstanding_amount, 2),
        "paid_30d_revenue": round(revenue_30d, 2),
    }

    # ====================== FILAMENTE ======================
    all_filaments = db.query(Filament).all()
    total_remaining_g = sum(f.remaining_weight or 0 for f in all_filaments)

    # Niedriger Bestand (gruppiert nach Typ)
    fil_groups = {}
    for f in all_filaments:
        key = f"{f.material}|{f.manufacturer}|{f.color}".lower()
        if key not in fil_groups:
            fil_groups[key] = {
                "id": key,
                "material": f.material,
                "manufacturer": f.manufacturer,
                "color": f.color,
                "color_hex": f.color_hex,
                "remaining_weight": 0,
            }
        fil_groups[key]["remaining_weight"] += f.remaining_weight or 0

    low_spools = []
    for g in fil_groups.values():
        if g["remaining_weight"] < 500:
            g["remaining_weight"] = round(g["remaining_weight"], 0)
            low_spools.append(g)
    low_spools.sort(key=lambda x: x["remaining_weight"])

    filaments_data = {
        "total_spools": len(all_filaments),
        "total_remaining_kg": round(total_remaining_g / 1000, 2),
        "low_spools": low_spools,
    }

    # ====================== INVENTAR ======================
    low_inv = db.query(InventoryItem).filter(
        InventoryItem.minimum_stock > 0,
        InventoryItem.quantity <= InventoryItem.minimum_stock,
    ).order_by(InventoryItem.quantity).all()

    inventory_data = {
        "low_stock_count": len(low_inv),
        "items": [
            {
                "id": i.id,
                "name": i.name,
                "category": i.category,
                "quantity": i.quantity or 0,
                "minimum_stock": i.minimum_stock or 0,
                "unit": i.unit or "Stk",
            }
            for i in low_inv
        ],
    }

    # ====================== WARTUNGEN ======================
    upcoming = db.query(Maintenance).filter(
        Maintenance.next_due_date.isnot(None),
        Maintenance.next_due_date <= soon_30d,
    ).order_by(Maintenance.next_due_date).all()

    overdue_count = sum(
        1 for m in upcoming if m.next_due_date and m.next_due_date < today
    )

    maint_items = []
    for m in upcoming:
        p = db.query(Printer).filter(Printer.id == m.printer_id).first()
        days = (m.next_due_date - today).days if m.next_due_date else None
        maint_items.append({
            "id": m.id,
            "printer_id": m.printer_id,
            "printer_name": p.name if p else "?",
            "type": m.maintenance_type or "Wartung",
            "next_due_date": m.next_due_date.isoformat() if m.next_due_date else None,
            "days_remaining": days,
            "overdue": days is not None and days < 0,
        })

    maintenance_data = {
        "upcoming_count": len(upcoming),
        "overdue_count": overdue_count,
        "items": maint_items,
    }

    # ====================== HISTORIE (30 Tage) ======================
    history_30d = db.query(PrintHistory).filter(
        PrintHistory.created_at >= month_ago
    ).all()
    total = len(history_30d)
    success = sum(1 for h in history_30d if h.status == "success")
    failed = sum(1 for h in history_30d if h.status == "failed")
    total_hours = sum((h.duration_minutes or 0) for h in history_30d) / 60
    total_material = sum((h.material_used_g or 0) for h in history_30d)

    history_data = {
        "success_count": success,
        "failed_count": failed,
        "success_rate": round((success / total * 100), 1) if total else 100,
        "total_hours": round(total_hours, 1),
        "total_material_kg": round(total_material / 1000, 2),
    }

    return {
        "printers": printers_data,
        "jobs": jobs_data,
        "invoices": invoices_data,
        "filaments": filaments_data,
        "inventory": inventory_data,
        "maintenance": maintenance_data,
        "history": history_data,
    }


@router.get("/recent-activity")
def recent_activity(
    limit: int = Query(default=8, ge=1, le=50),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Letzte Aktivitäten: Druckhistorie, neue Aufträge, bezahlte Rechnungen."""
    activities = []

    # Letzte Druckhistorie
    recent_prints = db.query(PrintHistory).order_by(
        PrintHistory.created_at.desc()
    ).limit(limit).all()
    for h in recent_prints:
        printer = db.query(Printer).filter(Printer.id == h.printer_id).first()
        activities.append({
            "type": "print",
            "status": h.status,
            "title": h.job_name or "Unbekannter Druck",
            "subtitle": printer.name if printer else "?",
            "timestamp": h.created_at.isoformat() if h.created_at else None,
        })

    # Letzte Aufträge
    recent_jobs = db.query(PrintJob).order_by(
        PrintJob.created_at.desc()
    ).limit(limit).all()
    for j in recent_jobs:
        c = j.customer
        cname = ""
        if c:
            cname = c.company_name if c.customer_type == "business" else \
                f"{c.first_name or ''} {c.last_name or ''}".strip()
        activities.append({
            "type": "job",
            "status": j.status,
            "title": j.title,
            "subtitle": cname or "—",
            "timestamp": j.created_at.isoformat() if j.created_at else None,
        })

    # Letzte bezahlte Rechnungen
    recent_paid = db.query(Invoice).filter(
        Invoice.paid_date.isnot(None)
    ).order_by(Invoice.paid_date.desc()).limit(limit).all()
    for inv in recent_paid:
        activities.append({
            "type": "invoice_paid",
            "status": "success",
            "title": f"Rechnung {inv.invoice_number} bezahlt",
            "subtitle": f"{inv.total_gross:.2f} €" if inv.total_gross else "",
            "timestamp": inv.paid_date.isoformat() if inv.paid_date else None,
        })

    # Nach Timestamp sortieren, neueste zuerst
    activities = [a for a in activities if a["timestamp"]]
    activities.sort(key=lambda a: a["timestamp"], reverse=True)
    return activities[:limit]
