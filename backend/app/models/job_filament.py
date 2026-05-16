"""Auftrags-Filament-Reservierung."""
from sqlalchemy import Column, Integer, Float, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class PrintJobFilament(Base):
    """Filament-Reservierung für einen Auftrag.
    Optional einer bestimmten Druckplatte zugeordnet (plate_id).
    Beim Anlegen wird grams_reserved vom Filament-Bestand abgezogen.
    Bei Auftragsabschluss wird grams_used als tatsächlicher Verbrauch übernommen.
    """
    __tablename__ = "print_job_filaments"

    id = Column(Integer, primary_key=True, index=True)
    job_id = Column(Integer, ForeignKey("print_jobs.id", ondelete="CASCADE"), nullable=False)
    plate_id = Column(Integer, ForeignKey("print_job_plates.id", ondelete="CASCADE"))
    filament_id = Column(Integer, ForeignKey("filaments.id", ondelete="SET NULL"))

    grams_reserved = Column(Float, nullable=False, default=0.0)
    grams_used = Column(Float)
    slot = Column(Integer)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    job = relationship("PrintJob", back_populates="reserved_filaments")
    plate = relationship("PrintJobPlate", back_populates="filaments")
    filament = relationship("Filament")
