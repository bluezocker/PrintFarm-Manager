from sqlalchemy import Column, Integer, String, Text, DateTime, Float, ForeignKey, Date, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class Customer(Base):
    """Kundendaten."""
    __tablename__ = "customers"

    id = Column(Integer, primary_key=True, index=True)
    customer_number = Column(String(30), unique=True, index=True)  # K-0001 o.ä.

    # Person / Firma
    customer_type = Column(String(20), default="private")  # private | business
    company_name = Column(String(200))
    first_name = Column(String(120))
    last_name = Column(String(120))

    # Adresse
    street = Column(String(200))
    zip_code = Column(String(20))
    city = Column(String(120))
    country = Column(String(80), default="Deutschland")

    # Kontakt
    email = Column(String(120))
    phone = Column(String(50))

    # Steuer (für Geschäftskunden)
    vat_id = Column(String(50))

    notes = Column(Text)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    print_jobs = relationship("PrintJob", back_populates="customer", cascade="all, delete-orphan")


class PrintJob(Base):
    """Druckauftrag - vom Kunden beauftragter Auftrag."""
    __tablename__ = "print_jobs"

    id = Column(Integer, primary_key=True, index=True)
    customer_id = Column(Integer, ForeignKey("customers.id", ondelete="CASCADE"), nullable=False)

    order_number = Column(String(50), unique=True)
    title = Column(String(200), nullable=False)
    description = Column(Text)

    # Lifecycle
    status = Column(String(40), default="new")  # new, in_progress, printing, completed, cancelled, paid
    order_date = Column(Date)
    due_date = Column(Date)
    completion_date = Column(Date)

    # Kalkulation
    quantity = Column(Integer, default=1)
    estimated_hours = Column(Float)
    estimated_material_g = Column(Float)
    # Kalkulation
    calculated_cost_net = Column(Float)              # Selbstkosten (Material + Strom + Maschinenzeit)
    calculated_price_net = Column(Float)             # Kalkulierter Verkaufspreis (mit Marge)
    cost_breakdown = Column(Text)                    # JSON mit Aufschlüsselung
    # Tatsächlicher Verkaufspreis (vom Mitarbeiter eingegeben)
    price_net = Column(Float, default=0.0)
    price_gross = Column(Float, default=0.0)
    vat_rate = Column(Float, default=19.0)

    file_path = Column(String(500))            # hochgeladene STL/3MF
    print_file_name = Column(String(300))      # Dateiname auf dem Drucker (z.B. "wuerfel.3mf")
                                                # Wird für Auto-Matching von MQTT-Events genutzt
    library_file_id = Column(Integer, ForeignKey("library_files.id", ondelete="SET NULL"))  # Verknüpfung zum Archiv
    result_photo_path = Column(String(500))    # Manuell hochgeladenes Foto vom Druckergebnis
    customer_notified_start = Column(Boolean, default=False)    # Kunde wurde über Druckstart informiert
    customer_notified_done = Column(Boolean, default=False)     # Kunde wurde über Fertigstellung informiert

    # Print Queue (Warteschlange)
    queue_position = Column(Integer)             # Position in der Warteschlange, NULL wenn nicht in Queue
    queue_printer_id = Column(Integer, ForeignKey("printers.id", ondelete="SET NULL"))  # Welchem Drucker zugewiesen

    # Projekt-Zuordnung
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="SET NULL"), index=True)

    # Zeitgesteuerter Start
    scheduled_start_at = Column(DateTime(timezone=True))    # Wann soll der Auftrag automatisch starten
    scheduled_processed = Column(Boolean, default=False)    # Wurde der Auto-Start bereits verarbeitet

    notes = Column(Text)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    customer = relationship("Customer", back_populates="print_jobs")
    history_entries = relationship("PrintHistory", back_populates="job")
    reserved_filaments = relationship(
        "PrintJobFilament", back_populates="job", cascade="all, delete-orphan"
    )
    plates = relationship(
        "PrintJobPlate", back_populates="job", cascade="all, delete-orphan",
        order_by="PrintJobPlate.position",
    )
