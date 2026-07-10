"""FTPS-Client für Bambu Lab Drucker (LAN-Modus).

Bambu Drucker haben im LAN-Modus einen FTP-Server, über den Dateien direkt
auf die SD-Karte hochgeladen werden können.

Verbindungsdetails:
- Protokoll: FTPS (implicit TLS, Port 990)
- Benutzer: bblp
- Passwort: Access Code vom Drucker-Display
- Ziel-Verzeichnis: /model/
- Selbstsigniertes Zertifikat: SSL-Verifikation deaktiviert

Nach dem Upload wird die Datei per MQTT-Print-Command gestartet:
    {
      "print": {
        "command": "project_file",
        "url": "ftp:///<filename>.3mf",
        "param": "Metadata/plate_1.gcode",
        ...
      }
    }
"""
import ftplib
import ssl
import socket
import logging
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)


class ImplicitFTP_TLS(ftplib.FTP_TLS):
    """FTP_TLS mit implicit SSL/TLS ab Sekunde eins (Port 990).

    Python's Standard-FTP_TLS-Klasse verwendet explicit TLS (AUTH TLS),
    aber Bambu Drucker erwarten implicit TLS - die Verbindung ist von
    Anfang an verschlüsselt.
    """

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._sock = None

    @property
    def sock(self):
        return self._sock

    @sock.setter
    def sock(self, value):
        # Automatisch in SSL wrappen wenn frisch verbunden
        if value is not None and not isinstance(value, ssl.SSLSocket):
            value = self.context.wrap_socket(value, server_hostname=self.host)
        self._sock = value


def _make_ssl_context() -> ssl.SSLContext:
    """SSL-Kontext für Bambu (selbstsigniertes Zertifikat akzeptieren)."""
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    # Bambu-Drucker sprechen kein modernes TLS 1.3 - älteres erlauben
    ctx.minimum_version = ssl.TLSVersion.TLSv1_2
    return ctx


def upload_to_bambu(
    host: str,
    access_code: str,
    local_path: str,
    remote_filename: Optional[str] = None,
    port: int = 990,
    timeout: int = 60,
) -> str:
    """Lädt eine Datei per FTPS auf den Bambu-Drucker hoch.

    Args:
        host: IP-Adresse des Druckers (z.B. "192.168.1.42")
        access_code: Access Code vom Drucker (Settings → WLAN → Show Detail)
        local_path: Pfad zur lokalen Datei
        remote_filename: Name auf dem Drucker (default: Dateiname von local_path)
        port: FTPS-Port (default 990)
        timeout: Timeout in Sekunden

    Returns:
        Der Dateiname auf dem Drucker (z.B. "meinmodel.3mf")

    Raises:
        FileNotFoundError: Lokale Datei existiert nicht
        ConnectionError: Verbindung zum Drucker fehlgeschlagen
        ftplib.all_errors: Andere FTP-Fehler
    """
    local = Path(local_path)
    if not local.exists():
        raise FileNotFoundError(f"Datei nicht gefunden: {local_path}")

    fname = remote_filename or local.name
    # Sicherstellen dass Dateiname keine Pfad-Anteile hat
    fname = Path(fname).name

    logger.info(f"Bambu-FTP: Upload {local.name} ({local.stat().st_size} bytes) nach {host}:{port}/model/{fname}")

    ctx = _make_ssl_context()
    ftp = ImplicitFTP_TLS(context=ctx, timeout=timeout)

    try:
        ftp.connect(host=host, port=port, timeout=timeout)
        ftp.login(user="bblp", passwd=access_code)
        # Nach dem Login PROT P für verschlüsselten Daten-Kanal
        ftp.prot_p()

        # In /model/ Verzeichnis wechseln
        try:
            ftp.cwd("/model")
        except ftplib.error_perm:
            # Manche Firmwares: /model existiert schon, andere Namespace
            try:
                ftp.mkd("/model")
                ftp.cwd("/model")
            except ftplib.error_perm:
                # Fallback: root
                logger.warning("Bambu-FTP: /model konnte nicht angelegt werden, nutze root")

        # Passive Mode - wichtig bei NAT/Router
        ftp.set_pasv(True)

        # Upload
        with local.open("rb") as fh:
            ftp.storbinary(f"STOR {fname}", fh, blocksize=8192)

        logger.info(f"Bambu-FTP: Upload {fname} erfolgreich")
        return fname
    except socket.timeout:
        raise ConnectionError(f"Timeout bei Verbindung zu {host}:{port}")
    except socket.gaierror as e:
        raise ConnectionError(f"DNS/Hostname-Fehler: {e}")
    except OSError as e:
        raise ConnectionError(f"Netzwerk-Fehler: {e}")
    finally:
        try:
            ftp.quit()
        except Exception:
            try:
                ftp.close()
            except Exception:
                pass


def test_connection(host: str, access_code: str, port: int = 990, timeout: int = 15) -> dict:
    """Testet die FTP-Verbindung ohne Upload.

    Returns:
        dict mit success (bool), message (str), file_count (Optional[int])
    """
    ctx = _make_ssl_context()
    ftp = ImplicitFTP_TLS(context=ctx, timeout=timeout)
    try:
        ftp.connect(host=host, port=port, timeout=timeout)
        ftp.login(user="bblp", passwd=access_code)
        ftp.prot_p()

        # Optional: Dateiliste holen
        file_count = None
        try:
            ftp.cwd("/model")
            files = ftp.nlst()
            file_count = len(files)
        except Exception:
            pass

        return {
            "success": True,
            "message": f"FTP-Verbindung erfolgreich (Port {port})",
            "file_count": file_count,
        }
    except ftplib.error_perm as e:
        return {"success": False, "message": f"Login-Fehler: {e}", "file_count": None}
    except socket.timeout:
        return {"success": False, "message": f"Timeout ({timeout}s) - IP oder Port falsch?", "file_count": None}
    except Exception as e:
        return {"success": False, "message": f"Fehler: {e}", "file_count": None}
    finally:
        try:
            ftp.quit()
        except Exception:
            try:
                ftp.close()
            except Exception:
                pass
