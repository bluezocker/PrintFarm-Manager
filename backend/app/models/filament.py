from sqlalchemy import Column, Integer, String, Text, DateTime, Float, ForeignKey, Date
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class StorageLocation(Base):
    """Lagerort z.B. 'Regal A', 'Trockenbox 1'."""
    __tablename__ = "storage_locations"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(120), nullable=False, unique=True)
    description = Column(Text)
    is_dry_box = Column(Integer, default=0)   # 1 = Trockenbox
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    filaments = relationship("Filament", back_populates="storage")


class Filament(Base):
    """Filament-Rolle mit Bestand und Lagerort."""
    __tablename__ = "filaments"

    id = Column(Integer, primary_key=True, index=True)

    manufacturer = Column(String(120))         # z.B. Bambu Lab, Polymaker, Sunlu
    material = Column(String(40), nullable=False)  # PLA, PETG, ABS, ASA, TPU, PA, PC...
    color = Column(String(80))
    color_hex = Column(String(7))              # #RRGGBB für UI
    diameter = Column(Float, default=1.75)     # mm

    # Bestand
    spool_weight = Column(Float, default=1000.0)  # Gesamtgewicht der Rolle in g
    remaining_weight = Column(Float, default=1000.0)  # Aktueller Reststand in g

    # Lager
    storage_id = Column(Integer, ForeignKey("storage_locations.id"))
    storage_slot = Column(String(50))          # z.B. "Fach 3" innerhalb des Lagerorts

    # Metadaten
    purchase_date = Column(Date)
    purchase_price = Column(Float)
    batch_number = Column(String(100))         # Chargennummer (vom Hersteller)
    nozzle_temp = Column(Integer)              # empfohlene Drucktemp
    bed_temp = Column(Integer)
    rfid_uid = Column(String(80))              # Bambu RFID Spool UID
    notes = Column(Text)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    storage = relationship("StorageLocation", back_populates="filaments")
