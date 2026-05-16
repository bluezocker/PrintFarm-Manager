"""FastAPI Hauptanwendung - PrintFarm Manager."""
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.database import Base, engine, SessionLocal
from app.core.security import get_password_hash
from app.models import User, Printer
from app.services.bambu_service import bambu_manager
from app.services.tuya_service import tuya_service
from app.services.camera_service import camera_manager

from app.api import (
    auth, printers, power, filament, customers, history,
    company, calculation, invoices, notifications, camera, inventory,
    dashboard, export, backup,
)
from app.services.notifier import start_notifier, stop_notifier
from app.services.backup_service import start_auto_backup, stop_auto_backup

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


def initialize():
    """Beim Start: Tabellen anlegen, Default-Admin erzeugen, Drucker verbinden."""
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    try:
        # Default-Admin (admin / admin) wird beim ersten Start angelegt.
        # WICHTIG: Diese Zugangsdaten müssen nach dem ersten Login geändert werden!
        if not db.query(User).filter(User.username == "admin").first():
            admin = User(
                username="admin",
                email="admin@local",
                full_name="Administrator",
                hashed_password=get_password_hash("admin"),
                role="admin",
                is_active=True,
            )
            db.add(admin)
            db.commit()
            logger.warning("Default-Admin angelegt (admin/admin) - BITTE PASSWORT ÄNDERN!")

        # Bambu-Drucker mit hinterlegten Daten verbinden
        for p in db.query(Printer).all():
            if p.bambu_ip and p.bambu_access_code and p.bambu_serial:
                logger.info(f"Verbinde Drucker {p.name}...")
                bambu_manager.register(p.id, p.bambu_ip, p.bambu_access_code, p.bambu_serial)
            # Kamera-Stream für jeden Drucker mit IP + Access-Code starten
            if p.bambu_ip and p.bambu_access_code:
                camera_manager.register(p.id, p.bambu_ip, p.bambu_access_code)

        # Tuya-Verbindung versuchen
        tuya_service.connect()
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    initialize()
    start_notifier()
    start_auto_backup()
    yield
    # Cleanup
    stop_auto_backup()
    stop_notifier()
    camera_manager.stop_all()
    for printer_id in list(bambu_manager._clients.keys()):
        bambu_manager.unregister(printer_id)


app = FastAPI(
    title="PrintFarm Manager",
    description="3D-Druckerei-Verwaltung mit Bambu Lab und Tuya Integration",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # für Self-Hosted intern OK; bei Public bitte einschränken
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routen registrieren
app.include_router(auth.router)
app.include_router(company.router)
app.include_router(printers.router)
app.include_router(power.router)
app.include_router(filament.router)
app.include_router(customers.router)
app.include_router(history.router)
app.include_router(calculation.router)
app.include_router(invoices.router)
app.include_router(notifications.router)
app.include_router(camera.router)
app.include_router(inventory.router)
app.include_router(dashboard.router)
app.include_router(export.router)
app.include_router(backup.router)


@app.get("/")
def root():
    return {"name": "PrintFarm Manager", "version": "1.0.0", "docs": "/docs"}


@app.get("/api/health")
def health():
    return {"status": "ok"}
