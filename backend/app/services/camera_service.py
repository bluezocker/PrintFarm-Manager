"""
Bambu Lab Druckerkamera Snapshot via persistentem RTSP-Stream.

Da Bambu den RTSP-Server nur on-demand startet (Verbindung nur aktiv solange
ein Client lauscht), halten wir pro Drucker einen Hintergrund-ffmpeg-Prozess
am Leben, der kontinuierlich Frames in eine Datei schreibt.
'Foto aufnehmen' liefert dann einfach den jeweils aktuellsten Frame.
"""
import logging
import os
import signal
import subprocess
import tempfile
import threading
import time
from pathlib import Path
from typing import Dict, Optional

logger = logging.getLogger(__name__)


class CameraStream:
    """Hält eine ffmpeg-Verbindung zu einem Drucker aufrecht."""

    def __init__(self, printer_id: int, ip: str, access_code: str):
        self.printer_id = printer_id
        self.ip = ip
        self.access_code = access_code
        self.proc: Optional[subprocess.Popen] = None
        # Ausgabe-Dir wird beim Start angelegt
        self.out_dir = Path(tempfile.gettempdir()) / f"printfarm_cam_{printer_id}"
        self.out_dir.mkdir(parents=True, exist_ok=True)
        # ffmpeg schreibt rotierend in mehrere Dateien, wir picken die jüngste
        self.out_pattern = str(self.out_dir / "frame_%03d.jpg")
        self._stop = threading.Event()
        self._monitor_thread: Optional[threading.Thread] = None

    def _start_ffmpeg(self) -> bool:
        rtsp_url = f"rtsps://bblp:{self.access_code}@{self.ip}:322/streaming/live/1"
        cmd = [
            "ffmpeg", "-y",
            "-loglevel", "error",
            "-rtsp_transport", "tcp",
            "-i", rtsp_url,
            # Nur jeden 2. Frame, das reicht für Snapshots
            "-vf", "fps=1",
            # Rotierender Buffer von 5 JPEGs
            "-q:v", "3",
            "-update", "0",
            "-strftime", "0",
            self.out_pattern,
        ]
        try:
            # ffmpeg-Prozess in eigener Process-Group damit wir ihn sauber killen können
            self.proc = subprocess.Popen(
                cmd,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.PIPE,
                preexec_fn=os.setsid,
            )
            return True
        except Exception as e:
            logger.error(f"ffmpeg-Start Drucker {self.printer_id}: {e}")
            return False

    def _stop_ffmpeg(self):
        if self.proc and self.proc.poll() is None:
            try:
                os.killpg(os.getpgid(self.proc.pid), signal.SIGTERM)
                self.proc.wait(timeout=5)
            except Exception:
                try:
                    os.killpg(os.getpgid(self.proc.pid), signal.SIGKILL)
                except Exception:
                    pass
        self.proc = None

    def _monitor(self):
        """Loop: ffmpeg neu starten falls er stirbt."""
        backoff = 5
        while not self._stop.is_set():
            ok = self._start_ffmpeg()
            if not ok:
                self._stop.wait(backoff)
                backoff = min(backoff * 2, 120)
                continue

            backoff = 5
            # Auf Prozess warten - normalerweise läuft er bis er stirbt
            while not self._stop.is_set():
                rc = self.proc.poll()
                if rc is not None:
                    # ffmpeg ist beendet, Logs lesen
                    try:
                        stderr_data = self.proc.stderr.read(2000) if self.proc.stderr else b""
                        if stderr_data:
                            logger.debug(f"ffmpeg Drucker {self.printer_id} ended ({rc}): {stderr_data.decode(errors='ignore')[:400]}")
                    except Exception:
                        pass
                    break
                self._stop.wait(2)

            # Vor Restart kurz warten (Drucker mag keine zu schnellen Reconnects)
            if not self._stop.is_set():
                self._stop.wait(10)

        self._stop_ffmpeg()

    def start(self):
        if self._monitor_thread and self._monitor_thread.is_alive():
            return
        self._stop.clear()
        self._monitor_thread = threading.Thread(
            target=self._monitor, daemon=True, name=f"cam-{self.printer_id}",
        )
        self._monitor_thread.start()
        logger.info(f"Kamera-Stream {self.printer_id} gestartet ({self.ip})")

    def stop(self):
        self._stop.set()
        self._stop_ffmpeg()
        # Aufräumen
        try:
            for f in self.out_dir.glob("*.jpg"):
                f.unlink(missing_ok=True)
        except Exception:
            pass

    def get_latest_frame(self) -> Optional[bytes]:
        """Gibt den neuesten JPEG-Frame zurück."""
        try:
            files = sorted(
                self.out_dir.glob("frame_*.jpg"),
                key=lambda f: f.stat().st_mtime,
                reverse=True,
            )
            for f in files:
                # Mindestens 2KB Größe und nicht älter als 60s
                try:
                    st = f.stat()
                    if st.st_size < 2048:
                        continue
                    if time.time() - st.st_mtime > 60:
                        continue
                    return f.read_bytes()
                except Exception:
                    continue
        except Exception as e:
            logger.error(f"Frame lesen {self.printer_id}: {e}")
        return None


class CameraManager:
    """Verwaltet alle Kamera-Streams."""

    def __init__(self):
        self._streams: Dict[int, CameraStream] = {}
        self._lock = threading.Lock()

    def register(self, printer_id: int, ip: str, access_code: str):
        with self._lock:
            existing = self._streams.get(printer_id)
            if existing:
                if existing.ip == ip and existing.access_code == access_code:
                    return existing
                existing.stop()
            stream = CameraStream(printer_id, ip, access_code)
            stream.start()
            self._streams[printer_id] = stream
            return stream

    def unregister(self, printer_id: int):
        with self._lock:
            stream = self._streams.pop(printer_id, None)
            if stream:
                stream.stop()

    def get_snapshot(self, printer_id: int, ip: str = None, access_code: str = None) -> Optional[bytes]:
        """Schnappschuss eines Druckers - startet Stream falls noch nicht aktiv."""
        with self._lock:
            stream = self._streams.get(printer_id)
        if not stream and ip and access_code:
            stream = self.register(printer_id, ip, access_code)
            # Warten bis erster Frame da ist (max 15s)
            for _ in range(30):
                data = stream.get_latest_frame()
                if data:
                    return data
                time.sleep(0.5)
            return None
        if stream:
            return stream.get_latest_frame()
        return None

    def stop_all(self):
        with self._lock:
            for s in self._streams.values():
                s.stop()
            self._streams.clear()


camera_manager = CameraManager()


# Kompatibilität: alte Funktion bleibt verfügbar, ruft jetzt den Manager auf
def capture_snapshot(ip: str, access_code: str, printer_id: int = 0, timeout: int = 15) -> Optional[bytes]:
    """Backwards-compatible Funktion."""
    return camera_manager.get_snapshot(printer_id, ip, access_code)
