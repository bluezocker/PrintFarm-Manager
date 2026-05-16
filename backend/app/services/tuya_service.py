"""
Tuya Cloud API Integration - eigener HTTP-Client.

Wir nutzen NICHT mehr das tuya_iot SDK, da es buggy ist und sich oft mit
Tuya's API-Änderungen verschluckt. Stattdessen direkter HTTP mit HMAC-SHA256
Signatur.

Setup:
1. Account auf https://iot.tuya.com erstellen
2. Cloud Project anlegen
3. Devices -> 'Link Tuya App Account' (Smart Life App verknüpfen)
4. Access ID und Access Secret in .env
5. Region/Endpoint je nach Datacenter (EU: openapi.tuyaeu.com)
"""
import hashlib
import hmac
import json
import logging
import time
from typing import Dict, Optional
from datetime import datetime

import requests

from app.core.config import settings

logger = logging.getLogger(__name__)


class TuyaService:
    """Eigener Tuya API Client mit HMAC-SHA256 Signatur."""

    def __init__(self):
        self.endpoint = settings.TUYA_API_ENDPOINT or "https://openapi.tuyaeu.com"
        self.access_id = settings.TUYA_ACCESS_ID
        self.access_secret = settings.TUYA_ACCESS_SECRET
        self._token: Optional[str] = None
        self._token_expires_at: float = 0  # Unix-Timestamp

    # ------------------------------------------------------------------
    # Token Management
    # ------------------------------------------------------------------

    def _get_token(self) -> Optional[str]:
        """Holt einen Access-Token, gecached bis Ablauf."""
        # Token noch ~5 Min gültig? Wiederverwenden
        if self._token and time.time() < self._token_expires_at - 300:
            return self._token

        if not self.access_id or not self.access_secret:
            logger.warning("Tuya: keine Zugangsdaten konfiguriert")
            return None

        path = "/v1.0/token?grant_type=1"
        t = str(int(time.time() * 1000))

        # Body-Hash für GET ist Hash von leerem String
        content_hash = hashlib.sha256(b"").hexdigest()
        string_to_sign = f"GET\n{content_hash}\n\n{path}"
        sign_str = self.access_id + t + string_to_sign

        signature = hmac.new(
            self.access_secret.encode("utf-8"),
            sign_str.encode("utf-8"),
            hashlib.sha256,
        ).hexdigest().upper()

        headers = {
            "client_id": self.access_id,
            "sign": signature,
            "t": t,
            "sign_method": "HMAC-SHA256",
            "Content-Type": "application/json",
        }

        try:
            r = requests.get(self.endpoint + path, headers=headers, timeout=10)
            data = r.json()
            if not data.get("success"):
                logger.error(f"Tuya Token-Fehler: {data}")
                return None
            result = data.get("result", {})
            self._token = result.get("access_token")
            expire_in = result.get("expire_time", 7200)
            self._token_expires_at = time.time() + expire_in
            logger.info("Tuya: Token geholt")
            return self._token
        except Exception as e:
            logger.error(f"Tuya Token Exception: {e}")
            return None

    # ------------------------------------------------------------------
    # Signierte Request-Helfer
    # ------------------------------------------------------------------

    def _signed_request(self, method: str, path: str, body: Optional[Dict] = None) -> Optional[Dict]:
        """Macht einen signierten API-Request gegen Tuya."""
        token = self._get_token()
        if not token:
            return None

        t = str(int(time.time() * 1000))
        body_str = json.dumps(body) if body else ""
        content_hash = hashlib.sha256(body_str.encode("utf-8")).hexdigest()
        string_to_sign = f"{method}\n{content_hash}\n\n{path}"
        sign_str = self.access_id + token + t + string_to_sign

        signature = hmac.new(
            self.access_secret.encode("utf-8"),
            sign_str.encode("utf-8"),
            hashlib.sha256,
        ).hexdigest().upper()

        headers = {
            "client_id": self.access_id,
            "access_token": token,
            "sign": signature,
            "t": t,
            "sign_method": "HMAC-SHA256",
            "Content-Type": "application/json",
        }

        url = self.endpoint + path
        try:
            if method == "GET":
                r = requests.get(url, headers=headers, timeout=10)
            elif method == "POST":
                r = requests.post(url, headers=headers, data=body_str, timeout=10)
            else:
                logger.error(f"Tuya: unbekannte Methode {method}")
                return None
            data = r.json()
            if not data.get("success"):
                logger.warning(
                    f"Tuya {method} {path}: code={data.get('code')} msg={data.get('msg')}"
                )
            return data
        except Exception as e:
            logger.error(f"Tuya request {method} {path}: {e}")
            return None

    # ------------------------------------------------------------------
    # Connect-Check (für Backward-Compatibility)
    # ------------------------------------------------------------------

    def connect(self) -> bool:
        """Stellt sicher dass wir uns gegen Tuya authentifizieren können."""
        return self._get_token() is not None

    @property
    def _connected(self) -> bool:
        return self._token is not None

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def get_device_status(self, device_id: str) -> Optional[Dict]:
        """
        Holt den aktuellen Status einer Smart-Plug.

        Wichtige Datenpunkte (DPs) bei Tuya Smart-Plugs:
        - cur_power: aktuelle Leistung (0.1 W -> /10)
        - cur_voltage: Spannung (0.1 V -> /10)
        - cur_current: Strom in mA
        - add_ele: Verbrauch seit letztem Reset in 0.01 kWh
        - switch_1 / switch: An/Aus-Zustand
        """
        # Neuer v2.0-Pfad (wie im Tuya API Explorer)
        resp = self._signed_request("GET", f"/v2.0/cloud/thing/{device_id}/shadow/properties")

        # Fallback: alter v1.0-Pfad für Geräte/Regionen die noch v1 brauchen
        if not resp or not resp.get("success"):
            resp = self._signed_request("GET", f"/v1.0/devices/{device_id}/status")

        if not resp or not resp.get("success"):
            return None

        # Datenpunkt-Liste normalisieren
        result = resp.get("result", {})
        if isinstance(result, dict) and "properties" in result:
            points = result["properties"]
        else:
            points = result if isinstance(result, list) else []

        raw = {item["code"]: item["value"] for item in points if "code" in item}

        return {
            "power_w": raw.get("cur_power", 0) / 10 if "cur_power" in raw else None,
            "voltage_v": raw.get("cur_voltage", 0) / 10 if "cur_voltage" in raw else None,
            "current_ma": raw.get("cur_current") if "cur_current" in raw else None,
            "energy_kwh": raw.get("add_ele", 0) / 100 if "add_ele" in raw else None,
            "is_on": raw.get("switch_1", raw.get("switch", False)),
            "raw": raw,
            "timestamp": datetime.utcnow().isoformat(),
        }

    def get_energy_statistics(
        self, device_id: str, start_day: str, end_day: str
    ) -> Optional[Dict]:
        """
        Holt aggregierte Tagesverbrauchsdaten.
        Datumsformat: YYYYMMDD
        """
        params = f"?code=add_ele&start_day={start_day}&end_day={end_day}"

        resp = self._signed_request(
            "GET", f"/v2.0/cloud/thing/{device_id}/statistics/days{params}"
        )
        if not resp or not resp.get("success"):
            resp = self._signed_request(
                "GET", f"/v1.0/devices/{device_id}/statistics/days{params}"
            )

        return resp.get("result") if resp and resp.get("success") else None

    def switch_device(self, device_id: str, on: bool) -> bool:
        """Steckdose ein-/ausschalten."""
        # v2.0 Cloud-API
        resp = self._signed_request(
            "POST",
            f"/v2.0/cloud/thing/{device_id}/shadow/properties/issue",
            {"properties": json.dumps({"switch_1": on})},
        )
        if not resp or not resp.get("success"):
            # Fallback v1.0
            resp = self._signed_request(
                "POST",
                f"/v1.0/devices/{device_id}/commands",
                {"commands": [{"code": "switch_1", "value": on}]},
            )
        return bool(resp and resp.get("success"))


# Singleton
tuya_service = TuyaService()
