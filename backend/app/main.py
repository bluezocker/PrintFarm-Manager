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
    dashboard, export, backup, integrations, email_templates,
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
        from app.models import IntegrationSettings
        integ_for_bambu = db.query(IntegrationSettings).first()

        for p in db.query(Printer).all():
            if not p.bambu_serial:
                continue
            if p.connection_mode == "cloud":
                if (integ_for_bambu and integ_for_bambu.bambu_enabled
                        and integ_for_bambu.bambu_cloud_email
                        and integ_for_bambu.bambu_cloud_password):
                    logger.info(f"Verbinde Drucker {p.name} (Cloud)...")
                    bambu_manager.register_cloud(
                        p.id, p.bambu_serial,
                        integ_for_bambu.bambu_cloud_email,
                        integ_for_bambu.bambu_cloud_password,
                    )
            else:
                # LAN-Modus
                if p.bambu_ip and p.bambu_access_code:
                    logger.info(f"Verbinde Drucker {p.name} (LAN)...")
                    bambu_manager.register_lan(p.id, p.bambu_ip, p.bambu_access_code, p.bambu_serial)
                    camera_manager.register(p.id, p.bambu_ip, p.bambu_access_code)

        # IntegrationSettings: Beim ersten Start aus .env importieren
        from app.models import IntegrationSettings
        from app.core.config import settings as app_settings
        integ = db.query(IntegrationSettings).first()
        if not integ:
            integ = IntegrationSettings(id=1)
            # Falls .env-Werte vorhanden sind, übernehmen
            if app_settings.TUYA_ACCESS_ID and app_settings.TUYA_ACCESS_SECRET:
                integ.tuya_enabled = True
                integ.tuya_access_id = app_settings.TUYA_ACCESS_ID
                integ.tuya_access_secret = app_settings.TUYA_ACCESS_SECRET
                integ.tuya_api_endpoint = app_settings.TUYA_API_ENDPOINT
                logger.info("Tuya-Zugangsdaten aus .env in DB importiert")
            db.add(integ)
            db.commit()

        # Tuya-Verbindung versuchen (liest jetzt DB-Werte)
        tuya_service.connect()

        # Email-Templates: Defaults seeden falls noch nicht vorhanden
        from app.services.notifier import seed_default_email_templates
        seed_default_email_templates(db)
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
app.include_router(integrations.router)
app.include_router(email_templates.router)


@app.get("/")
def root():
    return {"name": "PrintFarm Manager", "version": "1.0.0", "docs": "/docs"}


@app.get("/api/health")
def health():
    return {"status": "ok"}
