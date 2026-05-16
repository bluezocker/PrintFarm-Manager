"""Inventar-Verwaltung: Ersatzteile, Werkzeuge, Verbrauchsmaterial."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.core.database import get_db
from app.core.security import get_current_user
from app.models import InventoryItem, Printer, User
from app.schemas import InventoryItemCreate, InventoryItemUpdate, InventoryItemRead

router = APIRouter(prefix="/api/inventory", tags=["inventory"])


@router.get("", response_model=list[InventoryItemRead])
def list_items(
    category: str | None = None,
    low_stock_only: bool = False,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    q = db.query(InventoryItem)
    if category:
        q = q.filter(InventoryItem.category == category)
    if low_stock_only:
        q = q.filter(InventoryItem.quantity <= InventoryItem.minimum_stock)
    return q.order_by(InventoryItem.category, InventoryItem.name).all()


@router.post("", response_model=InventoryItemRead, status_code=201)
def create_item(
    data: InventoryItemCreate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    item = InventoryItem(**data.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.get("/stats")
def stats(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    total_items = db.query(InventoryItem).count()
    total_qty = db.query(func.sum(InventoryItem.quantity)).scalar() or 0
    total_value = db.query(
        func.sum(InventoryItem.quantity * InventoryItem.purchase_price)
    ).scalar() or 0
    low_stock = db.query(InventoryItem).filter(
        InventoryItem.quantity <= InventoryItem.minimum_stock,
        InventoryItem.minimum_stock > 0,
    ).count()
    printer_count = db.query(Printer).count()
    return {
        "total_items": total_items,
        "total_quantity": round(total_qty, 1),
        "total_value": round(total_value, 2),
        "low_stock_count": low_stock,
        "printer_count": printer_count,
    }


@router.get("/{item_id}", response_model=InventoryItemRead)
def get_item(item_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    item = db.query(InventoryItem).filter(InventoryItem.id == item_id).first()
    if not item:
        raise HTTPException(404, "Nicht gefunden")
    return item


@router.patch("/{item_id}", response_model=InventoryItemRead)
def update_item(
    item_id: int,
    data: InventoryItemUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    item = db.query(InventoryItem).filter(InventoryItem.id == item_id).first()
    if not item:
        raise HTTPException(404, "Nicht gefunden")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(item, k, v)
    db.commit()
    db.refresh(item)
    return item


@router.delete("/{item_id}", status_code=204)
def delete_item(item_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    item = db.query(InventoryItem).filter(InventoryItem.id == item_id).first()
    if not item:
        raise HTTPException(404, "Nicht gefunden")
    db.delete(item)
    db.commit()
