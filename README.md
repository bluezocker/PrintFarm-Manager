# PrintFarm Manager

Self-hosted Verwaltungssystem für 3D-Druckereien. Kombiniert Drucker-Monitoring,
Materialverwaltung, Auftragsabwicklung und Buchhaltung in einer Web-App.

---

## Überblick

PrintFarm Manager ist eine komplette Lösung für den Betrieb einer kleinen
bis mittleren 3D-Druckerei. Das System läuft im eigenen Netzwerk (Docker Compose),
bindet Bambu Lab Drucker über die offizielle LAN-API ein und kümmert sich um
alles drumherum: von der Material-Reservierung über Druckkalkulation bis zum
Rechnungsversand.

### Tech-Stack

- **Backend:** Python 3.12 mit FastAPI, SQLAlchemy, PostgreSQL
- **Frontend:** React 18 mit Vite, Tailwind CSS, Recharts
- **Deployment:** Docker Compose
- **Auth:** JWT-basiert mit Rollen (Administrator / Mitarbeiter)
- **Integrationen:** Bambu Lab MQTT, Tuya Smart Plugs, SMTP (Mailcow getestet)

---

## Features

### Dashboard

Übersichts-Startseite mit Live-Widgets:
- Druckerstatus auf einen Blick (laufend / idle / Fehler / offline)
- Niedriger Filamentbestand (unter 500g gesamt)
- Fällige Wartungen (überfällig + nächste 14 Tage)
- Aktive Aufträge mit Liefertermin
- Offene Rechnungen mit Mahnstatus
- Niedrige Inventarstände
- Monatsstatistik (Drucke, Materialverbrauch, Umsatz, etc.)

### Druckerverwaltung
- Mehrere Drucker parallel
- Bambu Lab Live-Status via MQTT (Temperatur, Fortschritt, Restzeit, aktueller Job)
- Pro Drucker konfigurierbar: Stundensatz, Strompreis, Durchschnittsverbrauch, Marge
- Wartungshistorie mit Erinnerungen
- Druckkammer-Kamera-Snapshot via RTSP (sofern vom Drucker freigegeben)

### Filamentverwaltung
- Bestand pro Rolle mit Restmenge, Charge, Lagerort
- **Hersteller-Auswahl** aus 25 vorgeschlagenen Marken plus eigene
- **Mehrfach-Rollen-Gruppierung:** Material + Hersteller + Farbe identisch =
  ein Typ, einzeln aufklappbar
- **FIFO-Verbrauch:** Beim Drucken wird automatisch von der Rolle mit der
  niedrigsten Restmenge zuerst abgebucht
- Lagerorte (Regale, Trockenboxen)

### Inventar
- Ersatzteile, Werkzeuge, Verbrauchsmaterial, Zubehör verwalten
- Bestand mit Mindestmenge und Warnung
- Anschaffungskosten + Gesamtwert-Berechnung
- Kategorisiert filterbar

### Kunden und Aufträge
- Privat- und Geschäftskunden mit eigenen Feldern
- **Automatische Kundennummer** (K-0001, K-0002, ...)
- Aufträge mit Auftragsnummer, Mengen, Lieferterminen
- **Druckplatten pro Auftrag:** Beliebig viele Platten pro Auftrag, jede mit
  eigenem Namen, Druckzeit und Filament-Liste
- Gesamt-Druckzeit und Gesamt-Material werden automatisch summiert
- **Filament-Reservierung** über die Gesamtsumme aller Platten
- Bei Auftragsabschluss: automatische Übernahme in die Druckhistorie

### Druckkalkulation
- Multi-Color-Drucke mit beliebig vielen Filamenten
- Pro Druck: Maschinenzeit, Stromkosten, Materialkosten
- Verkaufspreis mit konfigurierbarer Marge
- Steh-alone-Kalkulator + Kalkulation direkt im Auftrag
- MwSt-Anzeige nutzt die Firmen-Einstellung (auch 0% für Kleinunternehmer)

### Rechnungssystem
- Vollständiges Rechnungswesen mit automatischer Nummerierung
- Konfigurierbares Pattern (z.B. RE-2026-0001)
- Mehrere Positionen mit MwSt-Aufschlüsselung
- Skonto und Zahlungsziel
- PDF-Generierung mit Firmenlogo, Bankverbindung, Footer
- Lifecycle: Entwurf → Versendet → Überfällig → 1./2./3. Mahnung → Bezahlt
- Mahnungen mit Mahngebühr
- "Rechnung aus Auftrag" Direktfunktion
- Versand per E-Mail mit PDF-Anhang

### E-Mail-System
- SMTP-Konfiguration (Mailcow-kompatibel)
- Testmail-Funktion
- Automatische Benachrichtigungen bei Druck-Events
- Pro Mitarbeiter konfigurierbar (welche Events, welche Drucker)
- Auto-Mail an Kunden bei Druckende mit Foto

### Stromverbrauch
- Tuya Smart Plug Integration (LSC/Lidl etc.)
- Aktuelle Leistung, Tages-/Monatsverbrauch, Gesamtstand

### Auswertungen
- Statistik: Drucker-Auslastung, Erfolgsquote, Material, Zeit
- Kosten-Übersicht: Aufschlüsselung aller Drucke
- Filterbar nach Zeitraum
- Charts mit Recharts

### Daten-Export
- **CSV-Export** für alle wichtigen Daten:
  - Aufträge (filterbar nach Status)
  - Rechnungen (filterbar nach Status)
  - Druckhistorie (Zeitraum wählbar)
  - Kunden
  - Filamente
  - Inventar
- UTF-8 mit BOM (Excel-kompatibel)
- Semikolon-getrennt (deutsches Excel-Format)

### Backup-System
- **Automatische tägliche DB-Backups** um 03:00 Uhr
- Aufräumen alter Backups nach 30 Tagen (konfigurierbar)
- Manuelle Backups jederzeit erstellen
- Backups herunterladen für externe Sicherung
- Bash-Skripte für CLI-Backup und -Restore

### Admin-Funktionen
- Mitarbeiter-Verwaltung mit Rollen
- Firmendaten zentral pflegen (Logo, Adresse, USt-ID, Bankverbindung)
- Standard-Werte für Rechnungen (MwSt, Zahlungsziel, Skonto)
- Backup-Verwaltung
- SMTP-Konfiguration

---

## Menü-Struktur

```
Dashboard

Drucker
├── Übersicht
├── Wartung
├── Inventar
└── Stromverbrauch

Filamente
├── Übersicht
└── Lagerorte

Kunden & Aufträge
├── Kunden
├── Aufträge
└── Rechnungen

Druck-Historie
├── Übersicht
├── Kosten
└── Statistik

Kalkulator
Benachrichtigungen
Daten-Export

Verwaltung (nur Admin)
├── Firmendaten
├── E-Mail-Server
├── Mitarbeiter
└── Backups
```

---

## Voraussetzungen

- Docker und Docker Compose
- Bambu Lab Drucker im LAN-Modus (für Live-Status und Kamera)
- Optional: Tuya Smart Plug (für Stromverbrauch)
- Optional: SMTP-Server (für E-Mails)

---

## Installation

```bash
git clone <repo>
cd printfarm
sudo docker compose up -d --build
```

Default-Login: `admin / admin` (sofort ändern!)

Erreichbar unter `http://localhost:8080` (oder konfigurierte Domain).

---

## Backup-Skripte (CLI)

Zwei Skripte für manuelles Backup/Restore liegen im Repo-Root:

### Backup
```bash
./backup.sh                  # Backup nach ./backups/
./backup.sh /pfad/zu/backup  # Anderer Pfad
```

Erstellt ein `.tar.gz` mit DB-Dump + uploads/-Verzeichnis. Behält die letzten
30 Backups automatisch.

### Cron-Job für tägliches Backup
```bash
crontab -e
# Dann hinzufügen:
0 3 * * * cd /opt/printfarm && ./backup.sh >> /var/log/printfarm-backup.log 2>&1
```

### Restore
```bash
./restore.sh ./backups/printfarm_20260515_030000.tar.gz
```

**Hinweis:** Das automatische Backup über die Web-App läuft sowieso täglich um 03:00 Uhr.
Die CLI-Skripte sind als zusätzliche Option für externe Sicherung gedacht.

---

## Hinweise

### Bambu Lab
Der LAN-Modus muss aktiv sein. Access Code am Druckerdisplay unter
Einstellungen → WLAN → LAN Mode. Seriennummer am Aufkleber.

### Tuya Smart Plugs
Tuya IoT Developer Konto nötig (kostenlos für Eigennutzung). Cloud-Endpoint
nach Region wählen (EU: `https://openapi.tuyaeu.com`).

Achtung: Das Trial-Abo läuft alle 6 Monate aus, einfach im Tuya-Portal Verlängerung
beantragen.

### Mailcow / SMTP
- Eigene Mailbox in Mailcow erstellen
- Username = volle Mailadresse
- Port 587 mit STARTTLS (Standard)
- Absender muss mit Login-User übereinstimmen oder Sender-Alias konfigurieren

### Bambu Camera
RTSP-Stream läuft bei P1-Modellen oft nur on-demand. Falls Snapshots nicht
klappen: Bambu Studio einmal öffnen, dann nochmal versuchen. Bei manchen
Firmware-Versionen ist Liveview komplett blockiert.

### Druckplatten in Aufträgen
Jeder Auftrag kann in mehrere Druckplatten aufgeteilt werden. Pro Platte:
- Name (z.B. "Platte 1: Gehäuse")
- Druckzeit
- Filament-Liste mit Gramm-Mengen

Gesamt-Zeit und Gesamt-Material werden automatisch summiert.
Beispiel: Eine Vase mit 3 Platten:
- Platte 1: Boden (5h, 200g PLA Schwarz)
- Platte 2: Deckel (2h, 80g PLA Gold)
- Platte 3: Standfuß (1.5h, 80g PETG Klar)

Gesamt: 8.5h, 360g.

---

## Changelog

### Version 6.x - Komplett-Paket

- Dashboard mit Live-Widgets
- CSV-Export für alle wichtigen Daten
- Automatisches Backup-System (täglich 03:00, 30 Tage)
- CLI-Skripte für Backup/Restore
- MwSt-Default nutzt Firmen-Einstellung (0% für Kleinunternehmer möglich)
- Diverse 0%-Fixes (Auftrags-MwSt, Standard-Werte)

### Version 5.x - Druckplatten + Filament-Refactor

- **Druckplatten in Aufträgen** - jeder Auftrag kann in mehrere Platten aufgeteilt werden
- Jede Platte hat eigenen Namen, Druckzeit und Filament-Liste
- Automatische Aggregation von Zeit und Material
- Filament-Mehrfachrollen mit Gruppierung
- FIFO-Verbrauchslogik
- Hersteller-Dropdown mit 25 Marken
- Inventar-Modul
- Hierarchisches Menü mit Untergruppen
- Bambu-Kamera-Snapshot (experimentell)
- Auto-Übernahme in Druckhistorie bei Status "completed"
- Kundennummern (K-XXXX)

### Version 4.x - Rechnungen + E-Mail

- Vollständiges Rechnungssystem mit PDF
- SMTP-Konfiguration (Mailcow-kompatibel)
- Status-Lifecycle inkl. Mahnungen
- Benachrichtigungen pro Mitarbeiter
- Hintergrund-Worker für Druckerstatus-Polling

### Version 3.x - Multi-Color

- Multi-Color-Drucke mit beliebig vielen Filamenten
- Druckhistorie speichert alle verwendeten Filamente
- Auftrags-Kalkulation auch Multi-Color-fähig

### Version 2.x - Druckkalkulation

- Druckkostenrechner mit Maschinenzeit, Strom, Material
- Pro Drucker eigene Stundensätze
- Konfigurierbare Marge

### Version 1.0 - Initial Release

- User-Verwaltung mit JWT-Auth
- Druckerverwaltung mit Bambu MQTT
- Filament-Bestand mit Lagerorten
- Kunden- und Auftragsverwaltung
- Druckhistorie
- Tuya Smart Plug Integration
- Wartungshistorie
- Firmendaten

---

## Bekannte Einschränkungen

- **Bambu Camera:** Funktioniert nicht zuverlässig auf P1-Modellen wegen
  Firmware-Restriktion (RTSP läuft nur on-demand)
- **Mehrere parallele Aufträge:** Bei automatischer Kundenbenachrichtigung
  wird Auftrag über Job-Name gematched, bei mehreren gleichzeitigen Drucken
  nicht immer eindeutig
- **Tuya Trial:** Das kostenlose IoT-Core-Abo läuft alle 6 Monate aus
