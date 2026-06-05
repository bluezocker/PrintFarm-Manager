from sqlalchemy import Column, Integer, String, Text, DateTime, Float, ForeignKey, Date
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class Printer(Base):
    """3D-Drucker mit Bambu/Tuya Anbindung."""
    __tablename__ = "printers"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(120), nullable=False)
    model = Column(String(80))                 # z.B. X1 Carbon, P1S, A1
    brand = Column(String(80), default="Bambu Lab")
    serial_number = Column(String(120), unique=True)
    purchase_date = Column(Date)
    notes = Column(Text)

    # Bambu Lab Spezifika
    bambu_device_id = Column(String(120))      # Device ID aus Bambu Cloud
    bambu_access_code = Column(String(50))     # LAN Access Code vom Drucker-Display
    bambu_ip = Column(String(50))              # Lokale IP für LAN-Modus
    bambu_serial = Column(String(120))         # MQTT Serial

    # Verbindungsmodus: "lan" (Drucker im LAN Only Mode) oder "cloud" (über Bambu Cloud)
    connection_mode = Column(String(20), default="lan")

    # Tuya Smart Plug für Stromverbrauch
    tuya_device_id = Column(String(120))       # Tuya Device ID der Steckdose

    # Kalkulationsdaten
    hourly_rate = Column(Float, default=0.0)        # Maschinen-Stundensatz in €/h
    power_price_kwh = Column(Float, default=0.30)   # Strompreis in €/kWh
    avg_power_w = Column(Float, default=120.0)      # Ø Leistungsaufnahme während Druck in Watt
    margin_percent = Column(Float, default=20.0)    # Aufschlag/Marge in %

    # Aktueller Status (wird vom Service aktualisiert)
    status = Column(String(40), default="unknown")  # idle, printing, paused, finish, error
    current_job_name = Column(String(255))
    progress = Column(Float, default=0.0)
    nozzle_temp = Column(Float)
    bed_temp = Column(Float)
    remaining_time = Column(Integer)           # in Minuten
    last_seen = Column(DateTime(timezone=True))

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    maintenances = relationship("Maintenance", back_populates="printer", cascade="all, delete-orphan")
    power_readings = relationship("PowerReading", back_populates="printer", cascade="all, delete-orphan")
    print_history = relationship("PrintHistory", back_populates="printer", cascade="all, delete-orphan")


class Maintenance(Base):
    """Wartungseintrag pro Drucker."""
    __tablename__ = "maintenances"

    id = Column(Integer, primary_key=True, index=True)
    printer_id = Column(Integer, ForeignKey("printers.id", ondelete="CASCADE"), nullable=False)

    date = Column(Date, nullable=False)
    maintenance_type = Column(String(80))      # z.B. Düsenwechsel, Reinigung, Kalibrierung
    description = Column(Text, nullable=False)
    technician = Column(String(120))
    cost = Column(Float, default=0.0)
    next_due_date = Column(Date)               # Wann ist die nächste fällig

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    printer = relationship("Printer", back_populates="maintenances")
