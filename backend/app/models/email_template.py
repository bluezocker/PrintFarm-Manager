"""Email-Templates für Status-Benachrichtigungen.

Eine Zeile pro Status (new, in_progress, printing, completed, paid, cancelled).
Erlaubt das Anpassen der Email-Texte über die UI ohne Code-Änderung.

Unterstützte Platzhalter im body und subject:
- {customer_name}: Name des Kunden (Firma oder Vor+Nachname)
- {order_number}:  Auftragsnummer (z.B. A-2026-0042)
- {title}:         Titel des Auftrags
- {due_date}:      Liefertermin (DD.MM.YYYY) oder "-"
- {company}:       Eigener Firmenname
"""
from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime
from sqlalchemy.sql import func
from app.core.database import Base


class EmailTemplate(Base):
    __tablename__ = "email_templates"

    id = Column(Integer, primary_key=True)
    status_key = Column(String(50), unique=True, nullable=False)
    label = Column(String(120))                 # Anzeige-Name z.B. "Bei Statuswechsel: Neu"
    subject = Column(String(300), nullable=False)
    body = Column(Text, nullable=False)
    enabled = Column(Boolean, default=True)     # Mail-Versand für diesen Status aktiv?
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
