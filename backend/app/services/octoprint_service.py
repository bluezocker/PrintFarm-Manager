"""OctoPrint REST API Integration mit Polling."""
import logging
import threading
from datetime import datetime
from typing import Dict, List, Optional, Tuple

import requests

logger = logging.getLogger(__name__)


STATE_MAP = {
    "Operational": "idle",
    "Printing": "printing",
    "Pausing": "printing",
    "Paused": "paused",
    "Resuming": "printing",
    "Cancelling": "printing",
    "Finishing": "printing",
    "Offline": "offline",
    "Error": "error",
    "Closed": "offline",
}


class OctoPrintClient:
    def __init__(self, printer_id: int, url: str, api_key: str):
        self.printer_id = printer_id
        self.url = url.rstrip("/")
        self.api_key = api_key
        self.connected = False
        self.last_status: Dict = {}
        self.last_update: Optional[datetime] = None
        self._stop = threading.Event()
        self._thread: Optional[threading.Thread] = None
        self._lock = threading.Lock()

    def _headers(self) -> Dict[str, str]:
        return {"X-Api-Key": self.api_key, "Content-Type": "application/json"}

    def _get(self, path: str, timeout: float = 8.0) -> Optional[Dict]:
        try:
            r = requests.get(f"{self.url}{path}", headers=self._headers(), timeout=timeout)
            if r.status_code == 200:
                return r.json()
            if r.status_code == 409:
                return None
            logger.warning(f"OctoPrint {self.printer_id} {path}: HTTP {r.status_code}")
            return None
        except requests.exceptions.RequestException as e:
            logger.debug(f"OctoPrint {self.printer_id} {path}: {e}")
            return None

    def _post(self, path: str, body: Optional[Dict] = None, **kwargs) -> Optional[requests.Response]:
        try:
            r = requests.post(
                f"{self.url}{path}", headers=self._headers(), json=body, timeout=15, **kwargs,
            )
            return r
        except requests.exceptions.RequestException as e:
            logger.error(f"OctoPrint {self.printer_id} POST {path}: {e}")
            return None

    def _poll_once(self):
        printer_data = self._get("/api/printer?exclude=sd,history")
        job_data = self._get("/api/job")
        if printer_data is None and job_data is None:
            self.connected = False
            return
        with self._lock:
            self.connected = True
            self.last_status = {"printer": printer_data or {}, "job": job_data or {}}
            self.last_update = datetime.utcnow()

    def start(self, interval_seconds: int = 15):
        if self._thread and self._thread.is_alive():
            return
        self._stop.clear()

        def _loop():
            logger.info(f"OctoPrint {self.printer_id} ({self.url}): Polling gestartet")
            while not self._stop.is_set():
                try:
                    self._poll_once()
                except Exception as e:
                    logger.error(f"OctoPrint {self.printer_id} poll-Fehler: {e}")
                self._stop.wait(interval_seconds)
            logger.info(f"OctoPrint {self.printer_id}: Polling beendet")

        self._thread = threading.Thread(target=_loop, daemon=True, name=f"octo-{self.printer_id}")
        self._thread.start()

    def disconnect(self):
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=5)

    def get_status(self) -> Dict:
        with self._lock:
            data = dict(self.last_status)
        printer = data.get("printer", {})
        job = data.get("job", {})
        state_text = printer.get("state", {}).get("text") or "Offline"
        status = STATE_MAP.get(state_text, state_text.lower())
        tools = printer.get("temperature", {})
        nozzle = tools.get("tool0", {}).get("actual")
        bed = tools.get("bed", {}).get("actual")
        progress = job.get("progress", {}) or {}
        job_info = job.get("job", {}) or {}
        file_info = job_info.get("file", {}) or {}
        pct = progress.get("completion") or 0
        remaining = progress.get("printTimeLeft")
        filename = file_info.get("display") or file_info.get("name")
        return {
            "status": status,
            "current_job_name": filename,
            "current_file_name": filename,
            "current_subtask_name": None,
            "progress": float(pct),
            "nozzle_temp": nozzle,
            "bed_temp": bed,
            "remaining_time": int(remaining / 60) if remaining else None,
            "layer_num": None,
            "total_layer_num": None,
            "last_update": self.last_update.isoformat() if self.last_update else None,
            "connected": self.connected,
        }

    def pause(self) -> bool:
        r = self._post("/api/job", {"command": "pause", "action": "pause"})
        return bool(r and r.status_code in (200, 204))

    def resume(self) -> bool:
        r = self._post("/api/job", {"command": "pause", "action": "resume"})
        return bool(r and r.status_code in (200, 204))

    def cancel(self) -> bool:
        r = self._post("/api/job", {"command": "cancel"})
        return bool(r and r.status_code in (200, 204))

    def start_print(self) -> bool:
        r = self._post("/api/job", {"command": "start"})
        return bool(r and r.status_code in (200, 204))

    def select_and_print(self, file_path: str, print_now: bool = True) -> bool:
        try:
            r = requests.post(
                f"{self.url}/api/files/local/{file_path}",
                headers=self._headers(),
                json={"command": "select", "print": print_now},
                timeout=15,
            )
            return r.status_code in (200, 204)
        except requests.exceptions.RequestException as e:
            logger.error(f"OctoPrint select_and_print {file_path}: {e}")
            return False

    def upload_file(self, file_bytes: bytes, filename: str, print_now: bool = False) -> Tuple[bool, str]:
        try:
            files = {"file": (filename, file_bytes, "application/octet-stream")}
            data = {}
            if print_now:
                data["print"] = "true"
            r = requests.post(
                f"{self.url}/api/files/local",
                headers={"X-Api-Key": self.api_key},
                files=files,
                data=data,
                timeout=60,
            )
            if r.status_code in (200, 201):
                resp = r.json()
                path = resp.get("files", {}).get("local", {}).get("path") or filename
                return True, path
            return False, f"HTTP {r.status_code}: {r.text[:200]}"
        except requests.exceptions.RequestException as e:
            return False, str(e)

    def list_files(self) -> List[Dict]:
        data = self._get("/api/files/local?recursive=true")
        if not data:
            return []
        return self._flatten_files(data.get("files", []))

    def _flatten_files(self, items: List[Dict], prefix: str = "") -> List[Dict]:
        result = []
        for item in items:
            name = item.get("name", "")
            full_path = f"{prefix}{name}" if not prefix else f"{prefix}/{name}"
            if item.get("type") == "folder":
                result.extend(self._flatten_files(item.get("children", []), full_path))
            else:
                result.append({
                    "name": name,
                    "path": item.get("path") or full_path,
                    "size": item.get("size"),
                    "date": item.get("date"),
                    "type": item.get("type"),
                })
        return result


class OctoPrintManager:
    def __init__(self):
        self._clients: Dict[int, OctoPrintClient] = {}

    def register(self, printer_id: int, url: str, api_key: str) -> OctoPrintClient:
        if printer_id in self._clients:
            self._clients[printer_id].disconnect()
        client = OctoPrintClient(printer_id, url, api_key)
        client.start()
        self._clients[printer_id] = client
        return client

    def unregister(self, printer_id: int):
        if printer_id in self._clients:
            self._clients[printer_id].disconnect()
            del self._clients[printer_id]

    def get(self, printer_id: int) -> Optional[OctoPrintClient]:
        return self._clients.get(printer_id)


octoprint_manager = OctoPrintManager()
