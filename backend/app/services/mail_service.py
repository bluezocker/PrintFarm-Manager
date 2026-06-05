"""
SMTP-Mail-Service.

Funktioniert mit jedem SMTP-Server (Mailcow, Postfix, Gmail, ...).
Konfiguration über die smtp_settings-Tabelle.

Absender-Logik:
1. Wenn in SMTP-Settings `from_name` gesetzt ist → diesen nehmen
2. Sonst: Firmenname aus Firmendaten verwenden
3. Sonst: Fallback "PrintFarm"
"""
import logging
import smtplib
import ssl
from email.message import EmailMessage
from email.utils import formataddr
from pathlib import Path
from typing import List, Optional
from sqlalchemy.orm import Session

from app.models import SmtpSettings, Company

logger = logging.getLogger(__name__)


def _get_settings(db: Session) -> Optional[SmtpSettings]:
    s = db.query(SmtpSettings).first()
    if not s or not s.enabled or not s.host:
        return None
    return s


def _resolve_sender_name(db: Session, smtp: SmtpSettings) -> str:
    """Bestimmt den Absender-Namen mit folgender Priorität:
    1. SMTP-Settings from_name (falls explizit gesetzt)
    2. Firmenname aus Company-Tabelle
    3. Fallback "PrintFarm"
    """
    if smtp.from_name and smtp.from_name.strip():
        return smtp.from_name.strip()
    company = db.query(Company).first()
    if company and company.name and company.name.strip():
        return company.name.strip()
    return "PrintFarm"


def send_mail(
    db: Session,
    to: str | List[str],
    subject: str,
    body_text: str,
    body_html: Optional[str] = None,
    attachments: Optional[List[str]] = None,
) -> bool:
    """
    Sendet eine E-Mail über den konfigurierten SMTP-Server.
    Returns True bei Erfolg, False sonst.
    """
    s = _get_settings(db)
    if not s:
        logger.info("SMTP nicht konfiguriert oder deaktiviert - überspringe Versand")
        return False

    if isinstance(to, str):
        to = [to]
    to = [addr for addr in to if addr]
    if not to:
        return False

    try:
        msg = EmailMessage()
        sender_name = _resolve_sender_name(db, s)
        msg["From"] = formataddr((sender_name, s.from_email or s.username))
        msg["To"] = ", ".join(to)
        msg["Subject"] = subject
        if s.reply_to:
            msg["Reply-To"] = s.reply_to

        msg.set_content(body_text)
        if body_html:
            msg.add_alternative(body_html, subtype="html")

        # Anhänge
        for filepath in attachments or []:
            path = Path(filepath)
            if not path.exists():
                logger.warning(f"Anhang nicht gefunden: {filepath}")
                continue
            with open(path, "rb") as f:
                data = f.read()
            # MIME-Type ableiten
            ext = path.suffix.lower()
            if ext == ".pdf":
                msg.add_attachment(data, maintype="application", subtype="pdf", filename=path.name)
            else:
                msg.add_attachment(data, maintype="application", subtype="octet-stream", filename=path.name)

        # Verbindung
        if s.use_ssl:
            context = ssl.create_default_context()
            with smtplib.SMTP_SSL(s.host, s.port or 465, context=context, timeout=20) as server:
                if s.username:
                    server.login(s.username, s.password or "")
                server.send_message(msg)
        else:
            with smtplib.SMTP(s.host, s.port or 587, timeout=20) as server:
                server.ehlo()
                if s.use_tls:
                    server.starttls(context=ssl.create_default_context())
                    server.ehlo()
                if s.username:
                    server.login(s.username, s.password or "")
                server.send_message(msg)

        logger.info(f"Mail gesendet an {to}: {subject}")
        return True

    except Exception as e:
        logger.error(f"Mail-Versand fehlgeschlagen: {e}")
        return False


def test_smtp(db: Session, test_to: str) -> tuple[bool, str]:
    """Sendet eine Testmail. Returns (success, error_message)."""
    s = _get_settings(db)
    if not s:
        return False, "SMTP nicht aktiviert oder unvollständig konfiguriert"
    sender_name = _resolve_sender_name(db, s)
    ok = send_mail(
        db, test_to,
        f"{sender_name} Testmail",
        f"Hallo!\n\nWenn du diese E-Mail liest, funktioniert der SMTP-Versand korrekt. ✓\n\n"
        f"Absender: {sender_name}",
        f"<p>Hallo!</p>"
        f"<p>Wenn du diese E-Mail liest, funktioniert der SMTP-Versand korrekt. ✓</p>"
        f"<p>Absender: <strong>{sender_name}</strong></p>",
    )
    return ok, "" if ok else "Fehler beim Versand - siehe Backend-Logs"
