"""
Bambu Lab Drucker-Integration über MQTT.

Unterstützt zwei Verbindungsmodi:

1. LAN-MODUS (lokal, ohne Cloud):
   - Drucker muss in den 'LAN Only Mode' geschaltet sein
   - Benötigt: IP-Adresse, LAN Access Code, Serial Number
   - MQTT-Broker: der Drucker selbst (Port 8883)

2. CLOUD-MODUS (über Bambu Cloud):
   - Drucker hängt in der Bambu-Cloud (Standard, kein LAN Only nötig)
   - Benötigt: nur Serial Number (Account-Daten global)
   - Bambu-Account in Verwaltung → Integrationen pflegen
   - MQTT-Broker: us.mqtt.bambulab.com (Port 8883)
   - Vorteil: Funktioniert auch wenn man nicht im LAN ist

MQTT-Topic-Struktur (beide Modi):
- device/{serial}/report  -> Status-Updates vom Drucker
- device/{serial}/request -> Befehle an den Drucker
"""
import base64
import json
import ssl
import logging
import threading
from datetime import datetime
from typing import Dict, Optional
import paho.mqtt.client as mqtt
import requests

logger = logging.getLogger(__name__)


# Bambu Cloud API
# Bambu nutzt einen globalen Login-Endpoint, danach verbindet man sich mit
# einem regionalen MQTT-Broker. EU-Accounts müssen den EU-Broker verwenden.
BAMBU_API_BASE_GLOBAL = "https://api.bambulab.com"
BAMBU_API_BASE_CHINA = "https://api.bambulab.cn"

# Verfügbare MQTT-Broker - die richtige Region wird beim Login-Response gewählt
BAMBU_MQTT_BROKERS = {
    "default": "us.mqtt.bambulab.com",
    "us": "us.mqtt.bambulab.com",
    "eu": "eu.mqtt.bambulab.com",
    "china": "cn.mqtt.bambulab.com",
}
BAMBU_CLOUD_MQTT_PORT = 8883


def _bambu_cloud_login(email: str, password: str) -> Optional[Dict]:
    """Versucht direkten Login mit Email+Passwort.

    Returns:
    - {"token": ..., "user_id": ..., "mqtt_host": ...} bei Erfolg
    - {"needs_verification": True, "method": "email"|"tfa"} wenn Code nötig
    - None bei Fehler
    """
    headers = {
        "Content-Type": "application/json",
        "User-Agent": "bambu_network_agent/01.09.05.01",
    }
    payload = {
        "account": email,
        "password": password,
        "apiError": "",
    }
    for api_base in (BAMBU_API_BASE_GLOBAL, BAMBU_API_BASE_CHINA):
        try:
            url = f"{api_base}/v1/user-service/user/login"
            r = requests.post(url, json=payload, headers=headers, timeout=15)

            if r.status_code != 200:
                logger.warning(
                    f"Bambu Cloud Login ({api_base}): HTTP {r.status_code} - {r.text[:200]}"
                )
                continue

            data = r.json()
            login_type = data.get("loginType")
            token = data.get("accessToken")

            # Verifizierungscode nötig - Code-Mail anfordern
            if login_type in ("verifyCode", "tfa") and not token:
                logger.info(f"Bambu Cloud: Verifizierung nötig (loginType={login_type})")
                # Code per Email anfordern (außer bei TFA, das wäre die Authenticator-App)
                if login_type == "verifyCode":
                    _bambu_request_email_code(email)
                return {"needs_verification": True, "method": login_type}

            if not token:
                logger.error(f"Bambu Cloud Login: kein Token. Response: {str(data)[:300]}")
                continue

            return _parse_token_response(data)
        except Exception as e:
            logger.warning(f"Bambu Cloud Login ({api_base}) Exception: {e}")
            continue

    return None


def _bambu_login_with_code(email: str, code: str) -> Optional[Dict]:
    """Zweiter Login-Schritt: mit Email + Code statt Email + Passwort.

    Bambu's API ist hier inkonsistent - wir probieren mehrere Payload-Varianten.
    Returns: {"token": ..., "user_id": ..., "mqtt_host": ...} oder None.
    """
    headers = {
        "Content-Type": "application/json",
        "User-Agent": "bambu_network_agent/01.09.05.01",
    }

    # Mehrere Payload-Varianten probieren - Bambu hat das schon mal geändert
    payloads = [
        # Variante 1: code als eigenes Feld (häufigste)
        {"account": email, "code": code, "apiError": ""},
        # Variante 2: verifyCode statt code
        {"account": email, "verifyCode": code, "apiError": ""},
        # Variante 3: explicit loginType
        {"account": email, "code": code, "loginType": "verifyCode", "apiError": ""},
        # Variante 4: password-Feld mit dem Code (manche Clients tun das so)
        {"account": email, "password": code, "loginType": "verifyCode", "apiError": ""},
    ]

    for api_base in (BAMBU_API_BASE_GLOBAL, BAMBU_API_BASE_CHINA):
        url = f"{api_base}/v1/user-service/user/login"
        for i, payload in enumerate(payloads, 1):
            try:
                logger.info(
                    f"Bambu Code-Login Versuch {i} ({api_base}): "
                    f"keys={list(payload.keys())}"
                )
                r = requests.post(url, json=payload, headers=headers, timeout=15)
                if r.status_code != 200:
                    logger.warning(
                        f"Bambu Code-Login V{i}: HTTP {r.status_code} - {r.text[:200]}"
                    )
                    continue
                data = r.json()
                logger.info(
                    f"Bambu Code-Login V{i} Response: "
                    f"keys={list(data.keys())}, "
                    f"loginType={data.get('loginType')}, "
                    f"hasToken={bool(data.get('accessToken'))}, "
                    f"code={data.get('code')}, "
                    f"error={data.get('error')}"
                )
                if data.get("accessToken"):
                    return _parse_token_response(data)
            except Exception as e:
                logger.warning(f"Bambu Code-Login V{i} Exception: {e}")
                continue

    logger.error(f"Bambu Code-Login: alle Varianten fehlgeschlagen")
    return None


def _bambu_request_email_code(email: str) -> bool:
    """Fordert von Bambu einen Verification-Code per Email an.

    Probiert mehrere Type-Varianten weil Bambu hier auch inkonsistent ist.
    """
    headers = {
        "Content-Type": "application/json",
        "User-Agent": "bambu_network_agent/01.09.05.01",
    }
    type_variants = ["codeLogin", "code_login", "login"]

    for type_val in type_variants:
        try:
            url = f"{BAMBU_API_BASE_GLOBAL}/v1/user-service/user/sendemail/code"
            r = requests.post(
                url,
                json={"email": email, "type": type_val},
                headers=headers,
                timeout=15,
            )
            if r.status_code == 200:
                logger.info(
                    f"Bambu Cloud: Code-Mail an {email} (type={type_val})"
                )
                return True
            logger.warning(
                f"Bambu Code-Mail (type={type_val}): HTTP {r.status_code} - {r.text[:200]}"
            )
        except Exception as e:
            logger.error(f"Bambu Code-Mail (type={type_val}) Exception: {e}")
    return False


def _parse_token_response(data: dict) -> Optional[Dict]:
    """Extrahiert User-ID und Region aus dem Login-Response.

    Bambu liefert die User-ID auf 3 verschiedene Weisen, je nach API-Version:
    1. Im JWT-Token als Claim
    2. Direkt im Response-Body
    3. Garnicht - dann muss /my/profile abgefragt werden
    """
    token = data.get("accessToken")
    if not token:
        logger.error("Bambu _parse_token_response: kein accessToken im Response")
        return None

    user_id = None

    # Strategie 1: JWT parsen
    try:
        parts = token.split(".")
        logger.info(f"Bambu JWT parts count: {len(parts)}, token len: {len(token)}")
        if len(parts) >= 2:
            payload_b64 = parts[1] + "=" * (-len(parts[1]) % 4)
            decoded = base64.urlsafe_b64decode(payload_b64)
            logger.info(f"Bambu JWT decoded bytes: {len(decoded)}, sample: {decoded[:100]}")
            jwt_payload = json.loads(decoded)
            logger.info(
                f"Bambu JWT-Payload-Keys: {list(jwt_payload.keys())}, "
                f"alle Values: {jwt_payload}"
            )
            user_id = (
                jwt_payload.get("username")
                or jwt_payload.get("uid")
                or jwt_payload.get("sub")
                or jwt_payload.get("userId")
                or jwt_payload.get("id")
                or jwt_payload.get("preUid")
                or jwt_payload.get("preUsername")
            )
            if user_id:
                logger.info(f"Bambu User-ID aus JWT: {user_id}")
    except Exception as e:
        logger.error(f"JWT-Parse-Exception: {type(e).__name__}: {e}", exc_info=True)

    # Strategie 2: User-ID aus Response-Body
    if not user_id:
        user_id = data.get("uid") or data.get("userId") or data.get("id")
        if user_id:
            logger.info(f"Bambu User-ID aus Response-Body: {user_id}")

    # Strategie 3: /my/profile API anfragen
    if not user_id:
        logger.info("Bambu: User-ID weder im JWT noch im Body - frage /my/profile ab")
        try:
            for api_base in (BAMBU_API_BASE_GLOBAL, BAMBU_API_BASE_CHINA):
                r = requests.get(
                    f"{api_base}/v1/user-service/my/profile",
                    headers={
                        "Authorization": f"Bearer {token}",
                        "User-Agent": "bambu_network_agent/01.09.05.01",
                    },
                    timeout=10,
                )
                logger.info(
                    f"Bambu /my/profile ({api_base}): "
                    f"HTTP {r.status_code}, body: {r.text[:300]}"
                )
                if r.status_code == 200:
                    profile = r.json()
                    user_id = (
                        profile.get("uid")
                        or profile.get("userId")
                        or profile.get("id")
                        or profile.get("username")
                    )
                    if user_id:
                        logger.info(f"Bambu User-ID aus /my/profile: {user_id}")
                        break
        except Exception as e:
            logger.error(f"Bambu /my/profile Exception: {e}")

    if not user_id:
        logger.error(
            f"Bambu _parse_token_response: keine User-ID gefunden. "
            f"Response keys: {list(data.keys())}, "
            f"accessMethod={data.get('accessMethod')}, "
            f"firstAppLogin={data.get('firstAppLogin')}"
        )
        return None

    region = (data.get("region") or data.get("homeRegion") or "default").lower()
    mqtt_host = BAMBU_MQTT_BROKERS.get(region, BAMBU_MQTT_BROKERS["default"])

    logger.info(f"Bambu Cloud Login erfolgreich (user={user_id}, region={region})")
    return {"token": token, "user_id": str(user_id), "mqtt_host": mqtt_host}


def _bambu_get_cached_token(db) -> Optional[Dict]:
    """Liefert cached Token aus IntegrationSettings (falls vorhanden + noch gültig)."""
    from app.models import IntegrationSettings
    s = db.query(IntegrationSettings).first()
    if s and s.bambu_cloud_token and s.bambu_cloud_user_id:
        return {
            "token": s.bambu_cloud_token,
            "user_id": s.bambu_cloud_user_id,
            "mqtt_host": s.bambu_cloud_mqtt_host or BAMBU_MQTT_BROKERS["default"],
        }
    return None


class BambuPrinterClient:
    """Hält eine MQTT-Verbindung zu einem einzelnen Bambu-Drucker.

    Modi:
    - LAN:   ip, access_code, serial werden benötigt
    - CLOUD: serial + cloud_email + cloud_password werden benötigt
    """

    def __init__(self, serial: str, mode: str = "lan",
                 ip: Optional[str] = None, access_code: Optional[str] = None,
                 cloud_email: Optional[str] = None, cloud_password: Optional[str] = None):
        self.serial = serial
        self.mode = mode  # "lan" oder "cloud"
        self.ip = ip
        self.access_code = access_code
        self.cloud_email = cloud_email
        self.cloud_password = cloud_password
        self.client: Optional[mqtt.Client] = None
        self.connected = False
        self.last_status: Dict = {}
        self.last_update: Optional[datetime] = None
        self._lock = threading.Lock()

    def _on_connect(self, client, userdata, flags, rc, properties=None):
        if rc == 0:
            self.connected = True
            logger.info(f"Bambu {self.serial}: verbunden ({self.mode})")
            client.subscribe(f"device/{self.serial}/report")
            self.request_full_status()
        else:
            logger.error(f"Bambu {self.serial}: connect rc={rc}")

    def _on_disconnect(self, client, userdata, *args):
        self.connected = False
        logger.warning(f"Bambu {self.serial}: getrennt")

    def _on_message(self, client, userdata, msg):
        try:
            payload = json.loads(msg.payload.decode("utf-8"))
            with self._lock:
                if "print" in payload:
                    if "print" not in self.last_status:
                        self.last_status["print"] = {}
                    self.last_status["print"].update(payload["print"])
                else:
                    self.last_status.update(payload)
                self.last_update = datetime.utcnow()
        except Exception as e:
            logger.error(f"Parse-Fehler {self.serial}: {e}")

    def connect(self) -> bool:
        """Stellt MQTT-Verbindung zum Drucker her - je nach Modus LAN oder Cloud."""
        if self.mode == "cloud":
            return self._connect_cloud()
        return self._connect_lan()

    def _connect_lan(self) -> bool:
        """MQTT direkt zum Drucker via LAN (Port 8883, selbst-signiertes Zert)."""
        try:
            if not self.ip or not self.access_code:
                logger.error(f"Bambu {self.serial}: IP/Access-Code fehlen für LAN-Modus")
                return False
            self.client = mqtt.Client(
                callback_api_version=mqtt.CallbackAPIVersion.VERSION2,
                client_id=f"printfarm-{self.serial}",
            )
            self.client.username_pw_set("bblp", self.access_code)
            self.client.tls_set(cert_reqs=ssl.CERT_NONE, tls_version=ssl.PROTOCOL_TLS_CLIENT)
            self.client.tls_insecure_set(True)
            self.client.on_connect = self._on_connect
            self.client.on_disconnect = self._on_disconnect
            self.client.on_message = self._on_message
            self.client.connect(self.ip, 8883, 60)
            self.client.loop_start()
            return True
        except Exception as e:
            logger.error(f"Bambu {self.serial} LAN-connect-Fehler: {e}")
            return False

    def _connect_cloud(self) -> bool:
        """MQTT zu Bambu Cloud. Nutzt cached Token wenn vorhanden, sonst Login."""
        try:
            from app.core.database import SessionLocal
            db = SessionLocal()
            try:
                auth = _bambu_get_cached_token(db)
            finally:
                db.close()

            # Kein gültiger Cache? Dann frischer Login (nur ohne 2FA möglich)
            if not auth:
                if not self.cloud_email or not self.cloud_password:
                    logger.error(
                        f"Bambu {self.serial}: Kein Cloud-Token. "
                        f"Bitte in Verwaltung → Integrationen einmal verifizieren."
                    )
                    return False
                result = _bambu_cloud_login(self.cloud_email, self.cloud_password)
                if not result or result.get("needs_verification"):
                    logger.error(
                        f"Bambu {self.serial}: Cloud-Login benötigt Verifizierung. "
                        f"Bitte in Verwaltung → Integrationen den Code eingeben."
                    )
                    return False
                auth = result

            mqtt_host = auth.get("mqtt_host", BAMBU_MQTT_BROKERS["default"])

            self.client = mqtt.Client(
                callback_api_version=mqtt.CallbackAPIVersion.VERSION2,
                client_id=f"printfarm-{self.serial}",
            )
            self.client.username_pw_set(f"u_{auth['user_id']}", auth["token"])
            self.client.tls_set(tls_version=ssl.PROTOCOL_TLS_CLIENT)
            self.client.on_connect = self._on_connect
            self.client.on_disconnect = self._on_disconnect
            self.client.on_message = self._on_message

            logger.info(f"Bambu {self.serial}: verbinde mit Cloud-MQTT {mqtt_host}...")
            self.client.connect(mqtt_host, BAMBU_CLOUD_MQTT_PORT, 60)
            self.client.loop_start()
            return True
        except Exception as e:
            logger.error(f"Bambu {self.serial} Cloud-connect-Fehler: {e}")
            return False

    def disconnect(self):
        if self.client:
            self.client.loop_stop()
            self.client.disconnect()
            self.connected = False

    def _publish(self, payload: dict):
        if not self.client or not self.connected:
            return False
        self.client.publish(f"device/{self.serial}/request", json.dumps(payload), qos=1)
        return True

    def request_full_status(self):
        """Fordert kompletten Status-Snapshot an (besonders für P1)."""
        self._publish({"pushing": {"sequence_id": "1", "command": "pushall"}})

    def pause_print(self):
        return self._publish({"print": {"sequence_id": "0", "command": "pause"}})

    def resume_print(self):
        return self._publish({"print": {"sequence_id": "0", "command": "resume"}})

    def stop_print(self):
        return self._publish({"print": {"sequence_id": "0", "command": "stop"}})

    def set_led(self, on: bool):
        """Chamber-LED an/aus."""
        return self._publish({
            "system": {
                "sequence_id": "0",
                "command": "ledctrl",
                "led_node": "chamber_light",
                "led_mode": "on" if on else "off",
                "led_on_time": 500,
                "led_off_time": 500,
                "loop_times": 0,
                "interval_time": 0,
            }
        })

    def home_printer(self):
        """Homing (Achsen anfahren)."""
        return self._publish({
            "print": {"sequence_id": "0", "command": "gcode_line", "param": "G28\n"}
        })

    def set_print_speed(self, level: int):
        """Druckgeschwindigkeit setzen (1=Silent, 2=Standard, 3=Sport, 4=Ludicrous)."""
        return self._publish({
            "print": {"sequence_id": "0", "command": "print_speed", "param": str(level)}
        })

    def unload_filament(self):
        """Filament aus AMS entladen."""
        return self._publish({
            "print": {"sequence_id": "0", "command": "gcode_line", "param": "M702\n"}
        })

    def move_axis(self, axis: str, distance: float):
        """Manuell einen Achse bewegen (X, Y, Z)."""
        axis = axis.upper()
        if axis not in ("X", "Y", "Z"):
            return False
        # Relative Bewegung
        return self._publish({
            "print": {
                "sequence_id": "0",
                "command": "gcode_line",
                "param": f"G91\nG1 {axis}{distance} F3000\nG90\n",
            }
        })

    def send_print_job(
        self,
        filename: str,
        plate: int = 1,
        use_ams: bool = False,
        ams_mapping: list = None,
        bed_leveling: bool = True,
        flow_cali: bool = False,
        vibration_cali: bool = False,
        layer_inspect: bool = True,
        timelapse: bool = False,
        job_name: str = None,
    ):
        """Startet einen Druck einer bereits hochgeladenen 3MF-Datei.

        Die Datei muss vorher per FTP nach /model/<filename> hochgeladen werden.

        Args:
            filename: Nur der Dateiname (z.B. "meinmodel.3mf")
            plate: Welche Plate im 3MF drucken (1-basiert)
            use_ams: AMS verwenden?
            ams_mapping: Liste welcher Filament-Slot zu welchem Farbindex kommt (z.B. [0,1,2,3])
            bed_leveling: Bett-Leveling vor Druck
            flow_cali: Flow-Kalibrierung vor Druck (bei P1 meist False)
            vibration_cali: Vibrations-Kalibrierung (bei X1/P1 meist False)
            layer_inspect: KI-Layerinspektion (X1 only)
            timelapse: Timelapse aufnehmen
            job_name: Optionaler Job-Name für Anzeige am Drucker
        """
        # Ohne AMS Slot 0 = external spool
        if ams_mapping is None:
            ams_mapping = [0] if not use_ams else [0, 1, 2, 3]

        payload = {
            "print": {
                "sequence_id": "0",
                "command": "project_file",
                "param": f"Metadata/plate_{plate}.gcode",
                "project_id": "0",
                "profile_id": "0",
                "task_id": "0",
                "subtask_id": "0",
                "subtask_name": job_name or filename,
                "file": filename,
                # url: leerer Host = SD-Karte des Druckers (nach FTP-Upload)
                "url": f"ftp:///{filename}",
                "md5": "",
                "timelapse": timelapse,
                "bed_type": "auto",
                "bed_leveling": bed_leveling,
                "flow_cali": flow_cali,
                "vibration_cali": vibration_cali,
                "layer_inspect": layer_inspect,
                "ams_mapping": ams_mapping,
                "use_ams": use_ams,
            }
        }
        return self._publish(payload)

    def get_status_summary(self) -> dict:
        """Extrahiert die wichtigsten Felder aus den rohen MQTT-Daten."""
        with self._lock:
            data = self.last_status.get("print", {})
        gcode_state = data.get("gcode_state", "UNKNOWN")
        status_map = {
            "IDLE": "idle", "RUNNING": "printing", "PAUSE": "paused",
            "FINISH": "finish", "FAILED": "error", "PREPARE": "preparing",
        }

        # AMS-Slots extrahieren
        ams_units = []
        ams_data = data.get("ams", {})
        for unit in ams_data.get("ams", []):
            trays = []
            for tray in unit.get("tray", []):
                tray_info = {
                    "id": tray.get("id"),                          # "0" bis "3"
                    "color": tray.get("tray_color"),                # z.B. "FFFFFF"
                    "material": tray.get("tray_type"),              # "PLA", "PETG", ...
                    "sub_brand": tray.get("tray_sub_brands"),
                    "remain": tray.get("remain"),                    # 0-100 (Prozent)
                    "nozzle_temp_max": tray.get("nozzle_temp_max"),
                    "nozzle_temp_min": tray.get("nozzle_temp_min"),
                    "empty": not tray.get("tray_type"),              # leerer Slot?
                }
                trays.append(tray_info)
            ams_units.append({
                "id": unit.get("id"),
                "humidity": unit.get("humidity"),                    # "1"-"5" (0=trocken, 5=feucht)
                "temp": unit.get("temp"),
                "trays": trays,
            })

        # Externer Spool (vt_tray = "virtual tray")
        vt_tray = data.get("vt_tray", {})
        external_tray = None
        if vt_tray:
            external_tray = {
                "id": vt_tray.get("id"),
                "color": vt_tray.get("tray_color"),
                "material": vt_tray.get("tray_type"),
                "remain": vt_tray.get("remain"),
                "empty": not vt_tray.get("tray_type"),
            }

        # Aktueller AMS-Slot in Verwendung
        tray_now = ams_data.get("tray_now")

        return {
            "status": status_map.get(gcode_state, gcode_state.lower()),
            "current_job_name": data.get("subtask_name") or data.get("gcode_file"),
            "current_file_name": data.get("gcode_file"),
            "current_subtask_name": data.get("subtask_name"),
            "progress": float(data.get("mc_percent", 0)),
            "nozzle_temp": data.get("nozzle_temper"),
            "nozzle_target_temp": data.get("nozzle_target_temper"),
            "bed_temp": data.get("bed_temper"),
            "bed_target_temp": data.get("bed_target_temper"),
            "chamber_temp": data.get("chamber_temper"),
            "remaining_time": data.get("mc_remaining_time"),
            "layer_num": data.get("layer_num"),
            "total_layer_num": data.get("total_layer_num"),
            # Neu: Detaillierte Infos für Dashboard-Widgets
            "wifi_signal": data.get("wifi_signal"),                  # "-44dBm" oder "-44"
            "cooling_fan_speed": data.get("cooling_fan_speed"),      # Part Cooling (0-100 in %)
            "big_fan1_speed": data.get("big_fan1_speed"),            # Aux Fan
            "big_fan2_speed": data.get("big_fan2_speed"),            # Chamber Fan
            "spd_lvl": data.get("spd_lvl"),                          # Druckgeschwindigkeit-Level (1=silent, 2=normal, 3=sport, 4=ludicrous)
            "light_status": self._get_light_status(data),            # LED an/aus
            "hms": data.get("hms"),                                  # HMS-Fehler-Codes
            "ams": ams_units,
            "external_tray": external_tray,
            "tray_now": tray_now,
            "last_update": self.last_update.isoformat() if self.last_update else None,
            "connected": self.connected,
        }

    def _get_light_status(self, data: dict) -> Optional[str]:
        """LED-Status aus den MQTT-Daten extrahieren."""
        lights = data.get("lights_report", [])
        for light in lights:
            if light.get("node") == "chamber_light":
                return light.get("mode")   # "on" oder "off"
        return None


class BambuManager:
    """Singleton-Manager - verwaltet alle Drucker-Clients (LAN und Cloud)."""

    def __init__(self):
        self._clients: Dict[int, BambuPrinterClient] = {}

    def register_lan(self, printer_id: int, ip: str, access_code: str, serial: str) -> BambuPrinterClient:
        """Registriert einen LAN-Drucker."""
        if printer_id in self._clients:
            self._clients[printer_id].disconnect()
        client = BambuPrinterClient(
            serial=serial, mode="lan", ip=ip, access_code=access_code,
        )
        client.connect()
        self._clients[printer_id] = client
        return client

    def register_cloud(self, printer_id: int, serial: str, email: str, password: str) -> BambuPrinterClient:
        """Registriert einen Cloud-Drucker mit globalen Account-Daten."""
        if printer_id in self._clients:
            self._clients[printer_id].disconnect()
        client = BambuPrinterClient(
            serial=serial, mode="cloud",
            cloud_email=email, cloud_password=password,
        )
        client.connect()
        self._clients[printer_id] = client
        return client

    # Backward-Compat
    def register(self, printer_id: int, ip: str, access_code: str, serial: str) -> BambuPrinterClient:
        """Alias für register_lan (Backward-Compatibility)."""
        return self.register_lan(printer_id, ip, access_code, serial)

    def unregister(self, printer_id: int):
        if printer_id in self._clients:
            self._clients[printer_id].disconnect()
            del self._clients[printer_id]

    def get(self, printer_id: int) -> Optional[BambuPrinterClient]:
        return self._clients.get(printer_id)


bambu_manager = BambuManager()
