"""Inventar-System: Ersatzteile, Werkzeuge, Verbrauchsmaterial."""
from sqlalchemy import Column, Integer, String, Text, DateTime, Float, Date
from sqlalchemy.sql import func
from app.core.database import Base


class InventoryItem(Base):
    """Ein Artikel im Inventar."""
    __tablename__ = "inventory_items"

    id = Column(Integer, primary_key=True, index=True)

    name = Column(String(200), nullable=False)
    category = Column(String(50), nullable=False, default="spare_part")
    # Kategorien: spare_part, tool, consumable, accessory

    description = Column(Text)
    manufacturer = Column(String(120))
    part_number = Column(String(100))           # Artikelnummer Hersteller

    # Bestand
    quantity = Column(Float, default=0.0)
    unit = Column(String(20), default="Stk")    # Stk, ml, g, l, m, ...
    minimum_stock = Column(Float, default=0.0)  # Warnung wenn darunter

    # Kosten
    purchase_price = Column(Float, default=0.0)  # Pro Einheit
    supplier = Column(String(200))
    purchase_date = Column(Date)

    # Lagerort
    location = Column(String(200))

    # Verknüpfung zu Drucker (optional - nur bestimmte Drucker?)
    printer_compat = Column(String(500))        # Drucker-IDs kommagetrennt oder "all"

    notes = Column(Text)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
