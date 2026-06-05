"""API für Integration-Einstellungen (Tuya, Bambu Cloud).

Erlaubt das Konfigurieren externer Dienste via Web-UI ohne Container-Restart.
"""
from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import require_admin
from app.models import IntegrationSettings, User
from app.schemas import IntegrationSettingsRead, IntegrationSettingsUpdate

router = APIRouter(prefix="/api/integrations", tags=["integrations"])


def _get_or_create(db: Session) -> IntegrationSettings:
    """Singleton-Row in integration_settings."""
    s = db.query(IntegrationSettings).first()
    if not s:
        s = IntegrationSettings(id=1)
        db.add(s)
        db.commit()
        db.refresh(s)
    return s


def _safe_response(s: IntegrationSettings) -> IntegrationSettingsRead:
    """Erstellt ein Response-Objekt OHNE die Passwörter zu enthüllen."""
    return IntegrationSettingsRead(
        tuya_enabled=bool(s.tuya_enabled),
        tuya_access_id=s.tuya_access_id,
        tuya_access_secret_set=bool(s.tuya_access_secret),
        tuya_api_endpoint=s.tuya_api_endpoint,
        bambu_enabled=bool(s.bambu_enabled),
        bambu_cloud_email=s.bambu_cloud_email,
        bambu_cloud_password_set=bool(s.bambu_cloud_password),
    )


@router.get("", response_model=IntegrationSettingsRead)
def get_settings(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    """Holt die aktuellen Einstellungen.
    Passwörter werden im Response NICHT zurückgegeben (Sicherheit).
    """
    s = _get_or_create(db)
    return _safe_response(s)


@router.patch("", response_model=IntegrationSettingsRead)
def update_settings(
    data: IntegrationSettingsUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    """Speichert die Einstellungen.
    Leere Passwort-Felder werden ignoriert (alte Werte bleiben erhalten)."""
    s = _get_or_create(db)
    update_data = data.model_dump(exclude_unset=True)

    # Leere Strings für Passwort-Felder = nicht ändern
    if not update_data.get("tuya_access_secret"):
        update_data.pop("tuya_access_secret", None)
    if not update_data.get("bambu_cloud_password"):
        update_data.pop("bambu_cloud_password", None)

    for k, v in update_data.items():
        setattr(s, k, v)
    db.commit()
    db.refresh(s)

    # Service-Caches invalidieren damit neue Creds genutzt werden
    try:
        from app.services.tuya_service import tuya_service
        tuya_service.reload_from_db()
    except Exception:
        pass

    return _safe_response(s)


@router.post("/tuya/test")
def test_tuya(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    """Testet die Tuya-Verbindung mit den aktuell gespeicherten Daten."""
    from app.services.tuya_service import tuya_service
    tuya_service.reload_from_db()
    token = tuya_service._get_token()
    if token:
        return {"success": True, "message": "Tuya-Verbindung erfolgreich. Token wurde geholt."}
    return {
        "success": False,
        "message": "Tuya-Verbindung fehlgeschlagen. Prüfe Access ID, Access Secret und API-Endpoint.",
    }


@router.post("/bambu/test")
def test_bambu(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    """Startet den Bambu-Login. Bei Erfolg: Token cachen.
    Bei nötiger Verifizierung: Response signalisiert das, Code wurde per Email versendet.
    """
    s = _get_or_create(db)
    if not s.bambu_enabled or not s.bambu_cloud_email or not s.bambu_cloud_password:
        return {
            "success": False,
            "needs_verification": False,
            "message": "Bambu Cloud nicht konfiguriert (Email + Passwort nötig).",
        }

    from app.services.bambu_service import _bambu_cloud_login
    result = _bambu_cloud_login(s.bambu_cloud_email, s.bambu_cloud_password)

    if result and result.get("needs_verification"):
        return {
            "success": False,
            "needs_verification": True,
            "method": result.get("method"),
            "message": (
                f"Bambu hat einen Verifizierungscode an {s.bambu_cloud_email} gesendet. "
                f"Bitte den Code unten eingeben."
            ),
        }

    if result and result.get("token"):
        # Token cachen
        s.bambu_cloud_token = result["token"]
        s.bambu_cloud_user_id = result["user_id"]
        s.bambu_cloud_mqtt_host = result["mqtt_host"]
        db.commit()
        return {
            "success": True,
            "needs_verification": False,
            "message": (
                f"Bambu Cloud Login erfolgreich. "
                f"User-ID: {result['user_id']}, MQTT-Region: {result['mqtt_host']}"
            ),
        }

    return {
        "success": False,
        "needs_verification": False,
        "message": "Bambu Cloud Login fehlgeschlagen. Logs prüfen für Details.",
    }


@router.post("/bambu/verify-code")
def verify_bambu_code(
    code: str = Body(..., embed=True),
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    """Schließt die Bambu-Verifizierung mit dem per Email empfangenen Code ab.
    Bei Erfolg: Token wird für künftige Verbindungen gecached.
    """
    s = _get_or_create(db)
    if not s.bambu_cloud_email:
        raise HTTPException(400, "Bitte zuerst Email-Adresse speichern")

    from app.services.bambu_service import _bambu_login_with_code
    result = _bambu_login_with_code(s.bambu_cloud_email, code.strip())

    if not result or not result.get("token"):
        return {
            "success": False,
            "message": (
                "Code-Verifizierung fehlgeschlagen. Mögliche Ursachen: "
                "Code falsch eingegeben (Tippfehler? Achte auf 0/O), "
                "Code bereits verwendet, oder Code abgelaufen (~5-10 Min gültig). "
                "Backend-Logs zeigen die exakte Bambu-Antwort: "
                "sudo docker compose logs backend --tail=30 | grep Bambu"
            ),
        }

    s.bambu_cloud_token = result["token"]
    s.bambu_cloud_user_id = result["user_id"]
    s.bambu_cloud_mqtt_host = result["mqtt_host"]
    db.commit()

    return {
        "success": True,
        "message": (
            f"Verifizierung erfolgreich! Token gespeichert. "
            f"Drucker im Cloud-Modus sollten jetzt funktionieren."
        ),
    }


@router.post("/bambu/request-code")
def request_bambu_code(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    """Schickt einen neuen Verification-Code per Email an die hinterlegte Adresse.
    Nützlich wenn der erste Code abgelaufen oder nicht angekommen ist.
    """
    s = _get_or_create(db)
    if not s.bambu_cloud_email:
        raise HTTPException(400, "Bitte zuerst Email-Adresse speichern")

    from app.services.bambu_service import _bambu_request_email_code
    ok = _bambu_request_email_code(s.bambu_cloud_email)
    return {
        "success": ok,
        "message": (
            f"Neuer Code an {s.bambu_cloud_email} versendet."
            if ok else
            "Konnte keinen Code anfordern. Account-Daten prüfen."
        ),
    }
