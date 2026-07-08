"""Projekte: Aufträge und Dateien gruppieren.

Ein Projekt kann mehrere Aufträge und mehrere Archiv-Dateien enthalten.
Nützlich für: Kunden-Sammelbestellungen, Serien-Produktion, wiederkehrende Aufträge.

Beispiele:
- "Kunde ACME GmbH - Q3 2026"
- "Ersatzteile Roboterarm v2"
- "Voron Trident Build"
"""
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class Project(Base):
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True)
    name = Column(String(200), nullable=False)
    description = Column(Text)
    color = Column(String(20))                                 # Hex-Farbe zur visuellen Kennzeichnung
    status = Column(String(30), default="active")              # active, on_hold, completed, archived
    customer_id = Column(Integer, ForeignKey("customers.id", ondelete="SET NULL"))
    customer = relationship("Customer")

    # Cover / Präsentation
    cover_photo_path = Column(String(500))
    external_url = Column(String(500))                         # z.B. Printables / MakerWorld Link

    # Tracking
    created_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"))
    created_by = relationship("User")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
