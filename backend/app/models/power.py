from sqlalchemy import Column, Integer, DateTime, Float, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class PowerReading(Base):
    """Stromverbrauchs-Sample vom Tuya Smart Plug."""
    __tablename__ = "power_readings"

    id = Column(Integer, primary_key=True, index=True)
    printer_id = Column(Integer, ForeignKey("printers.id", ondelete="CASCADE"), nullable=False)

    timestamp = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    power_w = Column(Float)        # aktuelle Leistung in Watt
    voltage_v = Column(Float)      # Spannung in Volt
    current_ma = Column(Float)     # Strom in Milliampere
    energy_kwh = Column(Float)     # Gesamt-kWh (Zählerstand)

    printer = relationship("Printer", back_populates="power_readings")
