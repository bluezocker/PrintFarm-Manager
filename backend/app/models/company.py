from sqlalchemy import Column, Integer, String, Text, DateTime, Float
from sqlalchemy.sql import func
from app.core.database import Base


class Company(Base):
    """Firmendaten - üblicherweise ein einzelner Datensatz."""
    __tablename__ = "company"

    id = Column(Integer, primary_key=True, index=True)

    # Stammdaten
    name = Column(String(200), nullable=False)
    owner = Column(String(200))                # Inhaber
    managing_director = Column(String(200))    # Geschäftsführer
    business_type = Column(String(120))        # Gewerbeart
    logo_path = Column(String(500))            # Pfad zum Logo

    # Adresse
    street = Column(String(200))
    zip_code = Column(String(20))
    city = Column(String(120))
    country = Column(String(80), default="Deutschland")

    # Kontakt
    phone = Column(String(50))
    website = Column(String(200))
    email = Column(String(120))

    # Steuerdaten
    tax_number = Column(String(50))            # Steuernummer
    vat_id = Column(String(50))                # USt-IdNr.
    trade_register = Column(String(80))        # Handelsregister
    iban = Column(String(50))
    bic = Column(String(20))
    bank_name = Column(String(120))

    # Rechnungs-Einstellungen
    invoice_number_prefix = Column(String(20), default="RE-")     # z.B. RE-, RNG-
    invoice_number_pattern = Column(String(50), default="{prefix}{year}-{seq:04d}")
    invoice_next_seq = Column(Integer, default=1)                 # Nächste laufende Nummer
    invoice_seq_year = Column(Integer)                            # Jahr, in dem Zähler zuletzt verwendet wurde (für Reset)
    default_payment_terms_days = Column(Integer, default=14)
    default_skonto_percent = Column(Float, default=0.0)
    default_skonto_days = Column(Integer, default=7)
    default_vat_rate = Column(Float, default=19.0)
    invoice_footer_text = Column(Text)                            # Erscheint unten auf jeder Rechnung

    notes = Column(Text)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
