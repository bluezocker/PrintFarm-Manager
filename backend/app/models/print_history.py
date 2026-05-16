from sqlalchemy import Column, Integer, String, Text, DateTime, Float, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class PrintHistory(Base):
    """Historie aller gedruckten Jobs - auch ohne Kundenauftrag."""
    __tablename__ = "print_history"

    id = Column(Integer, primary_key=True, index=True)

    printer_id = Column(Integer, ForeignKey("printers.id", ondelete="CASCADE"), nullable=False)
    job_id = Column(Integer, ForeignKey("print_jobs.id", ondelete="SET NULL"))
    # filament_id bleibt für Abwärtskompatibilität - bei Multi-Color wird es das "Haupt-Filament"
    # (das mit dem meisten Verbrauch), die Details stehen in print_history_filaments
    filament_id = Column(Integer, ForeignKey("filaments.id", ondelete="SET NULL"))

    job_name = Column(String(255), nullable=False)
    file_name = Column(String(255))

    start_time = Column(DateTime(timezone=True))
    end_time = Column(DateTime(timezone=True))
    duration_minutes = Column(Integer)

    material_used_g = Column(Float)            # Gesamt-Materialverbrauch in g (Summe aller Filamente)
    power_used_kwh = Column(Float)             # gemessener Stromverbrauch in kWh

    status = Column(String(40))                # success, failed, cancelled
    layer_count = Column(Integer)
    notes = Column(Text)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    printer = relationship("Printer", back_populates="print_history")
    job = relationship("PrintJob", back_populates="history_entries")
    filament_usage = relationship(
        "PrintHistoryFilament",
        back_populates="history",
        cascade="all, delete-orphan",
    )


class PrintHistoryFilament(Base):
    """Verbrauch eines einzelnen Filaments innerhalb eines Drucks (Multi-Color)."""
    __tablename__ = "print_history_filaments"

    id = Column(Integer, primary_key=True, index=True)
    history_id = Column(Integer, ForeignKey("print_history.id", ondelete="CASCADE"), nullable=False)
    filament_id = Column(Integer, ForeignKey("filaments.id", ondelete="SET NULL"))

    grams_used = Column(Float, nullable=False)
    slot = Column(Integer)  # AMS-Slot Nr. (optional)

    history = relationship("PrintHistory", back_populates="filament_usage")
    filament = relationship("Filament")
