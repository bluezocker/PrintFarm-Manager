from sqlalchemy import Column, Integer, String, Text, DateTime, Float, ForeignKey, Date
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class Invoice(Base):
    """Rechnung."""
    __tablename__ = "invoices"

    id = Column(Integer, primary_key=True, index=True)
    invoice_number = Column(String(50), unique=True, nullable=False, index=True)

    customer_id = Column(Integer, ForeignKey("customers.id", ondelete="RESTRICT"), nullable=False)
    job_id = Column(Integer, ForeignKey("print_jobs.id", ondelete="SET NULL"))

    # Lifecycle
    status = Column(String(40), default="draft", index=True)
    # draft -> sent -> overdue -> reminder_1 -> reminder_2 -> reminder_3 -> paid / cancelled

    # Datumsfelder
    invoice_date = Column(Date, nullable=False)         # Rechnungsdatum
    service_date = Column(Date)                          # Leistungsdatum / Lieferdatum
    due_date = Column(Date)                              # Fälligkeit (nach Zahlungsziel)
    paid_date = Column(Date)                             # Tatsächliche Zahlung

    # Zahlungsbedingungen
    payment_terms_days = Column(Integer, default=14)     # Zahlungsziel in Tagen
    skonto_percent = Column(Float, default=0.0)          # Skonto-Prozent
    skonto_days = Column(Integer, default=7)             # innerhalb wieviel Tage gilt Skonto
    payment_method = Column(String(80))                  # Überweisung, Bar, PayPal, ...

    # Summen (werden aus Positionen berechnet, hier gecached)
    subtotal_net = Column(Float, default=0.0)
    vat_total = Column(Float, default=0.0)
    total_gross = Column(Float, default=0.0)

    # Mahnwesen
    reminder_count = Column(Integer, default=0)
    last_reminder_date = Column(Date)
    reminder_fee = Column(Float, default=0.0)             # Mahngebühr beim Status >= reminder_1

    # Texte / Anpassbar pro Rechnung
    intro_text = Column(Text)                             # Einleitung über der Tabelle
    closing_text = Column(Text)                           # Schlusstext unter der Tabelle
    notes = Column(Text)                                  # Interne Notizen (nicht im PDF)

    # PDF-Cache
    pdf_path = Column(String(500))

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    customer = relationship("Customer")
    job = relationship("PrintJob")
    items = relationship("InvoiceItem", back_populates="invoice", cascade="all, delete-orphan", order_by="InvoiceItem.position")


class InvoiceItem(Base):
    """Rechnungsposition."""
    __tablename__ = "invoice_items"

    id = Column(Integer, primary_key=True, index=True)
    invoice_id = Column(Integer, ForeignKey("invoices.id", ondelete="CASCADE"), nullable=False)

    position = Column(Integer, default=1)                 # Reihenfolge in der Tabelle
    description = Column(Text, nullable=False)
    quantity = Column(Float, default=1.0)
    unit = Column(String(20), default="Stk")              # Stk, h, kg, ...
    unit_price_net = Column(Float, default=0.0)           # Nettopreis pro Einheit
    vat_rate = Column(Float, default=19.0)                # MwSt-Satz pro Position
    discount_percent = Column(Float, default=0.0)         # Rabatt auf diese Position

    # Berechnet (im Backend gefüllt)
    line_total_net = Column(Float, default=0.0)
    line_vat = Column(Float, default=0.0)
    line_total_gross = Column(Float, default=0.0)

    invoice = relationship("Invoice", back_populates="items")
