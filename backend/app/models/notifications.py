from sqlalchemy import Column, Integer, String, Boolean, Text, ForeignKey
from sqlalchemy.orm import relationship
from app.core.database import Base


class SmtpSettings(Base):
    """Globale SMTP-Konfiguration (für Mailcow oder anderen Mailserver)."""
    __tablename__ = "smtp_settings"

    id = Column(Integer, primary_key=True, index=True)
    enabled = Column(Boolean, default=False)
    host = Column(String(200))                # z.B. mail.deinedomain.de
    port = Column(Integer, default=587)
    use_tls = Column(Boolean, default=True)   # STARTTLS
    use_ssl = Column(Boolean, default=False)  # SSL/TLS direkt (Port 465)
    username = Column(String(200))            # SMTP-Benutzername
    password = Column(String(500))            # SMTP-Passwort (hier in Klartext - DB-Zugang sichern!)
    from_email = Column(String(200))          # Absender-Adresse
    from_name = Column(String(200))           # Anzeigename
    reply_to = Column(String(200))


class NotificationPreference(Base):
    """Pro Mitarbeiter: welche Druck-Events soll er per E-Mail bekommen?"""
    __tablename__ = "notification_preferences"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False)

    # Events bei Druckende
    on_print_success = Column(Boolean, default=True)
    on_print_failed = Column(Boolean, default=True)
    on_print_cancelled = Column(Boolean, default=False)

    # Zwischenstatus
    on_print_started = Column(Boolean, default=False)
    on_progress_50 = Column(Boolean, default=False)
    on_filament_change = Column(Boolean, default=False)
    on_pause = Column(Boolean, default=False)

    # Wartung / sonstiges
    on_error = Column(Boolean, default=True)         # Drucker meldet Fehler
    on_maintenance_due = Column(Boolean, default=False)  # Wartungstermin fällig

    # Filter: nur für bestimmte Drucker? (kommagetrennte IDs, leer = alle)
    printer_filter = Column(String(500))

    user = relationship("User")
