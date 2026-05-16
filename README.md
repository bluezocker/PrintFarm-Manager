<div align="center">

# 🖨️ PrintFarm Manager

**Self-hosted Verwaltungssystem für 3D-Druckereien**

Drucker-Monitoring, Materialverwaltung, Auftragsabwicklung und Buchhaltung – alles in einer Web-App.

![Version](https://img.shields.io/badge/version-6.x-blue.svg)
![License](https://img.shields.io/badge/license-private-lightgrey.svg)
![Python](https://img.shields.io/badge/python-3.12-green.svg)
![React](https://img.shields.io/badge/react-18-61dafb.svg)
![Docker](https://img.shields.io/badge/docker-ready-2496ed.svg)
![Status](https://img.shields.io/badge/status-aktiv-success.svg)

[Features](#-features) · [Installation](#-installation) · [Screenshots](#-screenshots) · [Tech-Stack](#-tech-stack) · [Roadmap](#-roadmap)

</div>

---

## 📋 Über das Projekt

PrintFarm Manager ist eine vollständige Self-Hosted-Lösung für den Betrieb einer kleinen bis mittleren 3D-Druckerei. Das System läuft im eigenen Netzwerk via Docker Compose, bindet **Bambu Lab Drucker** über die offizielle LAN-API ein, integriert **Tuya Smart Plugs** für Stromverbrauchsmessung und kümmert sich um alles drumherum – von der Material-Reservierung über Druckkalkulation bis zum automatisierten Rechnungsversand.

Entwickelt für **Kleinunternehmer**, **Hobby-Druckereien** und **kleine Werkstätten**, die ihre Druckaufträge professionell verwalten wollen, ohne auf SaaS-Lösungen angewiesen zu sein.

---

## ✨ Features

### 🎛️ Dashboard
- Live-Übersicht mit KPIs (Drucker, Aufträge, Umsatz, Erfolgsquote)
- Aktuelle Drucke mit Live-Fortschritt
- Niedriger Bestand bei Filament und Inventar auf einen Blick
- Anstehende Wartungen und überfällige Rechnungen
- Auto-Refresh alle 30 Sekunden

### 🖨️ Druckerverwaltung
- Mehrere Bambu Lab Drucker parallel via MQTT
- Live-Status: Temperatur, Fortschritt, Restzeit, aktueller Job
- Wartungshistorie mit Erinnerungen
- RTSP-Kamera-Snapshot (P1/X1)
- Pro Drucker: Stundensatz, Strompreis, Durchschnittsverbrauch, Marge

### 🧵 Filamentverwaltung
- Bestand pro Rolle mit Restmenge, Charge, Lagerort
- **Smart Grouping**: Material + Hersteller + Farbe identisch = ein Typ
- **FIFO-Verbrauch**: Älteste Rolle wird zuerst geleert
- 25 vorgeschlagene Hersteller (Bambu Lab, Polymaker, Prusament, Sunlu, ...)
- Lagerorte (Regale, Trockenboxen)

### 📦 Inventar
- Ersatzteile, Werkzeuge, Verbrauchsmaterial
- Mindestbestand mit Warnung
- Anschaffungskosten + Gesamtwert-Berechnung
- Kategorisiert filterbar

### 👥 Kunden & Aufträge
- Privat- und Geschäftskunden mit automatischer Kundennummer (K-XXXX)
- Aufträge mit Auftragsnummer, Mengen, Lieferterminen
- **Druckplatten pro Auftrag** – jede mit eigenem Namen, Druckzeit und Filamenten
- Gesamt-Zeit und Gesamt-Material werden automatisch summiert
- Auto-Übernahme in Druckhistorie bei Abschluss

### 🧮 Druckkalkulation
- Multi-Color-Drucke mit beliebig vielen Filamenten
- Berücksichtigt Maschinenzeit, Stromkosten, Materialkosten
- Konfigurierbare Marge → Verkaufspreis
- Steh-alone-Kalkulator oder direkt im Auftrag

### 💰 Rechnungssystem
- Vollständiges Rechnungswesen mit automatischer Nummerierung
- Konfigurierbares Pattern (z.B. `RE-2026-0001`)
- PDF-Generierung mit Firmenlogo, Bankverbindung, Footer
- Lifecycle: Entwurf → Versendet → Überfällig → Mahnung → Bezahlt
- Mahnungen mit Mahngebühr
- "Rechnung aus Auftrag" mit einem Klick
- Versand per E-Mail mit PDF-Anhang
- Kleinunternehmer-Modus (0% MwSt)

### 📧 E-Mail-Benachrichtigungen
- SMTP-Konfiguration (Mailcow-kompatibel)
- Pro Mitarbeiter individuell konfigurierbar
- Events: Druck gestartet/50%/fertig/fehlgeschlagen, Drucker-Fehler, Wartung fällig
- Drucker-Filter
- Auto-Mail an Kunden bei Druckende mit Foto

### ⚡ Stromverbrauch
- Tuya Smart Plug Integration (LSC/Lidl etc.)
- Aktuelle Leistung, Tages-/Monatsverbrauch, Gesamtstand
- Eigener HTTP-Client mit HMAC-SHA256 (kein buggy SDK)

### 📊 Auswertungen
- Drucker-Auslastung, Erfolgsquote, Materialverbrauch
- Kosten-Übersicht mit Aufschlüsselung (Maschine/Strom/Material)
- Filterbar nach Zeitraum
- Charts mit Recharts

### 📥 Daten-Export
- CSV-Export für alle Daten (Aufträge, Rechnungen, Historie, Kunden, Filamente, Inventar)
- UTF-8 mit BOM (Excel-kompatibel, deutsches Format)

### 💾 Backup-System
- Automatische tägliche DB-Backups um 03:00 Uhr
- Manuelle Backups via Web-UI + Download
- CLI-Skripte für externe Sicherung via Cron
- Behält die letzten 30 Backups, ältere werden automatisch gelöscht

### 📱 Mobile-Optimierung
- Sidebar als Burger-Menü auf Smartphones
- Modals als Bottom-Sheets (wie native Apps)
- Tabellen horizontal scrollbar mit Touch-Support
- Touch-freundliche Button-Größen
- Als "Web App" zum Homescreen hinzufügbar

---

## 🛠️ Tech-Stack

| Bereich | Technologie |
|---------|-------------|
| **Backend** | Python 3.12, FastAPI, SQLAlchemy, Uvicorn |
| **Datenbank** | PostgreSQL 16 |
| **Frontend** | React 18, Vite, Tailwind CSS |
| **Charts** | Recharts |
| **Icons** | Lucide React |
| **PDF-Generierung** | ReportLab |
| **Auth** | JWT-basiert (python-jose) |
| **Drucker-API** | Bambu Lab MQTT (paho-mqtt) |
| **Smart-Plug-API** | Tuya Cloud API v2.0 (eigener HTTP-Client) |
| **Deployment** | Docker Compose |

---

## 🚀 Installation

### Voraussetzungen
- Docker und Docker Compose
- Bambu Lab Drucker im LAN-Modus
- Optional: Tuya Smart Plug
- Optional: SMTP-Server

### Quick Start

```bash
# Repository klonen
git clone https://github.com/bluezocker/PrintFarm-Manager.git
cd PrintFarm-Manager

# Umgebungsvariablen anpassen
cp .env.example .env
nano .env
# DB_PASSWORD setzen
# SECRET_KEY mit `openssl rand -hex 32` generieren
# Optional: TUYA_ACCESS_ID, TUYA_ACCESS_SECRET

# Bauen und starten
sudo docker compose up -d --build
```

### Erster Login
- **URL:** `http://<server-ip>:3000`
- **User:** `admin`
- **Passwort:** `admin` ← **SOFORT ÄNDERN!**

### Erste Schritte
1. **Firmendaten** ausfüllen (Verwaltung → Firmendaten)
2. **Standard-MwSt** setzen (Kleinunternehmer: 0%)
3. **SMTP-Server** konfigurieren (Verwaltung → E-Mail-Server)
4. **Drucker** anlegen (Drucker → Übersicht → Neu)

Detaillierte Anleitung: siehe [INSTALLATION.md](INSTALLATION.md)

---

## 📸 Screenshots

> **Hinweis:** Screenshots werden noch ergänzt. Bei Interesse: einfach selbst aufsetzen und ansehen 😊

Geplante Screenshots:
- Dashboard mit Live-Widgets
- Druckerverwaltung mit Live-Status
- Filament-Übersicht mit Gruppierung

- ![Filaments](docs/images/filaments.png)

- Auftrag mit Druckplatten
- Rechnung mit PDF-Vorschau
- Mobile-Ansicht

---

## 📂 Projektstruktur

```
printfarm/
├── backend/                    # FastAPI Backend
│   ├── app/
│   │   ├── api/                # API-Endpoints (Drucker, Filament, Aufträge, ...)
│   │   ├── models/             # SQLAlchemy-Modelle
│   │   ├── services/           # Business-Logik (Bambu, Tuya, Mail, PDF, ...)
│   │   ├── core/               # Auth, DB, Config
│   │   └── main.py
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/                   # React Frontend
│   ├── src/
│   │   ├── pages/              # Seiten (Dashboard, Drucker, Aufträge, ...)
│   │   ├── components/         # Layout, Modal, ProtectedRoute
│   │   ├── services/           # API-Client, Auth-Context
│   │   └── App.jsx
│   ├── Dockerfile
│   └── package.json
├── docker-compose.yml
├── backup.sh                   # CLI-Backup-Skript
├── restore.sh                  # CLI-Restore-Skript
├── .env.example
├── INSTALLATION.md             # Detaillierte Install-Anleitung
└── README.md
```

---

## 🗺️ Roadmap

Mögliche Erweiterungen für künftige Versionen:

- [ ] Mehrsprachigkeit (EN/DE umschaltbar)
- [ ] OctoPrint-Integration (zusätzlich zu Bambu Lab)
- [ ] Bestell-System für Endkunden (Kunden laden STL hoch + Live-Preis)
- [ ] Kalenderansicht für Aufträge mit Drag&Drop
- [ ] PWA mit Offline-Support und Push-Notifications
- [ ] 2FA für Login
- [ ] Erweiterte Statistiken (Profitabilität pro Kunde, Material-Trends)
- [ ] Etiketten-Druck (für Aufträge mit QR-Code)

---

## 🤝 Beitragen

Dies ist primär ein privates Projekt für den eigenen Bedarf. Bei Interesse an Mitarbeit oder Bug-Reports gerne ein Issue eröffnen.

---

## 📝 Hinweise zu Drittanbietern

### Bambu Lab
LAN-Modus muss am Drucker aktiv sein. Access Code unter:  
Einstellungen → WLAN → LAN Mode.

### Tuya Smart Plugs
- Tuya IoT Developer Account erforderlich (kostenlos für Eigennutzung)
- Trial-Abo läuft alle 6 Monate aus → einfach verlängern
- Cloud-Endpoint nach Region wählen (EU: `https://openapi.tuyaeu.com`)
- Aktuell genutzte API: **v2.0 cloud/thing** (mit Fallback auf v1.0)

### Mailcow / SMTP
- Eigene Mailbox erstellen
- Username = volle E-Mail-Adresse
- Port 587 mit STARTTLS
- Absender muss mit Login-User übereinstimmen

---

## ⚠️ Bekannte Einschränkungen

- **Bambu P1 Camera:** Firmware blockiert RTSP-Stream oft → Snapshots nicht zuverlässig
- **Mehrere parallele Aufträge:** Kunden-Mail-Matching über Job-Name kann mehrdeutig sein
- **Tuya Trial:** Abo muss alle 6 Monate manuell verlängert werden

---

## 📄 Lizenz

Privates Projekt – keine offene Lizenz. Eigene Anpassungen jederzeit möglich, der gesamte Quellcode ist einsehbar.

---

<div align="center">

**Made with ❤️ for 3D-Print enthusiasts**

[⬆ nach oben](#-printfarm-manager)

</div>
