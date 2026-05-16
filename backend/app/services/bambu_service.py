"""
Bambu Lab Drucker-Integration über MQTT.

Funktioniert im LAN-Modus: Der Drucker muss in den 'LAN Only Mode' geschaltet sein
(Einstellungen -> Netzwerk auf dem Druckerdisplay).

Benötigt pro Drucker:
- IP-Adresse im lokalen Netzwerk
- LAN Access Code (vom Druckerdisplay: Einstellungen > WLAN > Show Detail)
- Serial Number (auch auf dem Display)

MQTT-Topic-Struktur:
- device/{serial}/report -> Status-Updates vom Drucker
- device/{serial}/request -> Befehle an den Drucker
"""
import json
import ssl
import logging
import threading
from datetime import datetime
from typing import Dict, Optional
import paho.mqtt.client as mqtt

logger = logging.getLogger(__name__)


class BambuPrinterClient:
    """Hält eine MQTT-Verbindung zu einem einzelnen Bambu-Drucker."""

    def __init__(self, ip: str, access_code: str, serial: str):
        self.ip = ip
        self.access_code = access_code
        self.serial = serial
        self.client: Optional[mqtt.Client] = None
        self.connected = False
        self.last_status: Dict = {}
        self.last_update: Optional[datetime] = None
        self._lock = threading.Lock()

    def _on_connect(self, client, userdata, flags, rc, properties=None):
        if rc == 0:
            self.connected = True
            logger.info(f"Bambu {self.serial}: verbunden")
            client.subscribe(f"device/{self.serial}/report")
            # Vollen Status anfordern (vor allem für P1-Serie wichtig - dort kommen sonst nur Deltas)
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
                # P1-Serie sendet nur Deltas - daher mergen statt überschreiben
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
        """Stellt MQTT-Verbindung zum Drucker her."""
        try:
            self.client = mqtt.Client(
                callback_api_version=mqtt.CallbackAPIVersion.VERSION2,
                client_id=f"printfarm-{self.serial}",
            )
            self.client.username_pw_set("bblp", self.access_code)
            # Bambu nutzt selbst-signiertes Zert - daher Verify aus.
            # Für produktive Sicherheit könnte das CA-Zert eingebunden werden.
            self.client.tls_set(cert_reqs=ssl.CERT_NONE, tls_version=ssl.PROTOCOL_TLS_CLIENT)
            self.client.tls_insecure_set(True)
            self.client.on_connect = self._on_connect
            self.client.on_disconnect = self._on_disconnect
            self.client.on_message = self._on_message
            self.client.connect(self.ip, 8883, 60)
            self.client.loop_start()
            return True
        except Exception as e:
            logger.error(f"Bambu {self.serial} connect-Fehler: {e}")
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

    def get_status_summary(self) -> dict:
        """Extrahiert die wichtigsten Felder aus den rohen MQTT-Daten."""
        with self._lock:
            data = self.last_status.get("print", {})
        gcode_state = data.get("gcode_state", "UNKNOWN")
        # Mappen auf einfache Status-Strings
        status_map = {
            "IDLE": "idle", "RUNNING": "printing", "PAUSE": "paused",
            "FINISH": "finish", "FAILED": "error", "PREPARE": "preparing",
        }
        return {
            "status": status_map.get(gcode_state, gcode_state.lower()),
            "current_job_name": data.get("subtask_name") or data.get("gcode_file"),
            "progress": float(data.get("mc_percent", 0)),
            "nozzle_temp": data.get("nozzle_temper"),
            "bed_temp": data.get("bed_temper"),
            "remaining_time": data.get("mc_remaining_time"),
            "layer_num": data.get("layer_num"),
            "total_layer_num": data.get("total_layer_num"),
            "last_update": self.last_update.isoformat() if self.last_update else None,
            "connected": self.connected,
        }


class BambuManager:
    """Singleton-Manager - verwaltet alle Drucker-Clients."""

    def __init__(self):
        self._clients: Dict[int, BambuPrinterClient] = {}

    def register(self, printer_id: int, ip: str, access_code: str, serial: str) -> BambuPrinterClient:
        """Registriert und verbindet einen Drucker."""
        if printer_id in self._clients:
            self._clients[printer_id].disconnect()
        client = BambuPrinterClient(ip, access_code, serial)
        client.connect()
        self._clients[printer_id] = client
        return client

    def unregister(self, printer_id: int):
        if printer_id in self._clients:
            self._clients[printer_id].disconnect()
            del self._clients[printer_id]

    def get(self, printer_id: int) -> Optional[BambuPrinterClient]:
        return self._clients.get(printer_id)


bambu_manager = BambuManager()
