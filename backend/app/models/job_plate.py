"""Druckplatten innerhalb eines Auftrags (z.B. Bambu Studio Plate 1, Plate 2, ...)."""
from sqlalchemy import Column, Integer, String, Float, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class PrintJobPlate(Base):
    """Eine Druckplatte innerhalb eines Auftrags.
    Aufträge können mehrere Platten haben (z.B. wenn das Modell auf 3 Druckplatten
    aufgeteilt ist). Jede Platte hat eigene Druckzeit und eigene Filament-Liste.
    """
    __tablename__ = "print_job_plates"

    id = Column(Integer, primary_key=True, index=True)
    job_id = Column(Integer, ForeignKey("print_jobs.id", ondelete="CASCADE"), nullable=False)

    position = Column(Integer, default=1)              # Reihenfolge in der UI
    name = Column(String(200))                         # z.B. "Platte 1: Gehäuse + Deckel"
    duration_hours = Column(Float, default=0.0)        # geschätzte Druckzeit

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    job = relationship("PrintJob", back_populates="plates")
    filaments = relationship(
        "PrintJobFilament", back_populates="plate", cascade="all, delete-orphan",
        primaryjoin="PrintJobPlate.id == PrintJobFilament.plate_id",
    )
