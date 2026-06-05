"""Integration-Settings für externe Dienste (Tuya, Bambu Cloud).

Speichert globale Zugangsdaten die früher in der .env-Datei standen.
Vorteil: Konfiguration via Web-UI ohne Container-Restart.
"""
from sqlalchemy import Column, Integer, String, Boolean, DateTime
from sqlalchemy.sql import func
from app.core.database import Base


class IntegrationSettings(Base):
    """Globale Einstellungen für Cloud-Integrationen.
    Es gibt genau EINE Zeile in dieser Tabelle (id=1).
    """
    __tablename__ = "integration_settings"

    id = Column(Integer, primary_key=True, default=1)

    # Tuya Cloud
    tuya_enabled = Column(Boolean, default=False)
    tuya_access_id = Column(String(200))
    tuya_access_secret = Column(String(500))
    tuya_api_endpoint = Column(String(200), default="https://openapi.tuyaeu.com")

    # Bambu Cloud (optional, für Cloud-Mode statt LAN)
    bambu_enabled = Column(Boolean, default=False)
    bambu_cloud_email = Column(String(200))
    bambu_cloud_password = Column(String(500))
    bambu_cloud_token = Column(String(2000))           # Cached accessToken nach Verifizierung
    bambu_cloud_user_id = Column(String(100))          # User-ID aus JWT
    bambu_cloud_mqtt_host = Column(String(200))        # Region-MQTT-Host nach Login

    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
