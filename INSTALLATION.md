# PrintFarm Manager - Installation & Update

Dieses Paket enthält die **komplette Anwendung** in Version 7.0 mit allen Features, Updates und Bugfixes.

## Was ist in v7.0 neu vs. v6.x

### Große Features
- 🐙 **OctoPrint-Integration**: Beliebige Drucker via OctoPrint anbinden
  - Live-Status (Polling 15s)
  - Pause / Resume / Cancel
  - Datei-Upload zum OctoPrint
  - Druck aus Datei-Liste starten
- 📅 **Kalenderansicht mit Drag & Drop**: Auftrags-Termine visuell planen
  - Monats- und Wochenansicht
  - Aufträge per Drag&Drop verschieben
  - Sidebar für unterminierte Aufträge
  - Klick öffnet Edit-Modal

### Bugfixes
- `?edit=ID` URL-Parameter in Jobs.jsx nutzt jetzt korrekt `jobs` statt `items`
- Notifier hat OctoPrint-Support im Polling-Loop
- Startup-Prozess connectet OctoPrint-Drucker automatisch

---

## Option A: Komplett-Neuinstallation

```bash
# 1. Paket entpacken oder Git-Clone
git clone https://github.com/bluezocker/PrintFarm-Manager.git printfarm
cd printfarm

# 2. Umgebungsvariablen
cp .env.example .env
nano .env
# DB_PASSWORD setzen
# SECRET_KEY mit `openssl rand -hex 32` generieren

# 3. Bauen und starten
sudo docker compose up -d --build

# 4. Login
# URL: http://<server-ip>:3000
# User: admin
# Passwort: admin (SOFORT ÄNDERN!)
```

### Erste Schritte
1. **Firmendaten** ausfüllen
2. **Standard-MwSt** setzen (Kleinunternehmer: 0%)
3. **SMTP-Server** konfigurieren
4. **Integrationen** für Tuya / Bambu Cloud
5. **E-Mail-Texte** anpassen
6. **Drucker** anlegen (LAN/Cloud/OctoPrint)
7. **Admin-Passwort ändern**

---

## Option B: Update einer bestehenden Installation

### 1. Backup vorher!

```bash
cd ~/Dokumente/printfarm

sudo docker compose exec -T db sh -c \
    'PGPASSWORD="$POSTGRES_PASSWORD" pg_dump -U "$POSTGRES_USER" -f /tmp/dump.sql "$POSTGRES_DB"'
sudo docker compose cp db:/tmp/dump.sql ./backup_pre_v7.sql
ls -lh backup_pre_v7.sql
```

### 2. Code überschreiben

```bash
git pull
# oder Komplett-Paket entpacken und kopieren
```

### 3. Datenbank-Migration (alle kumulativ)

```bash
sudo docker compose exec -T db sh -c \
    'PGPASSWORD="$POSTGRES_PASSWORD" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"' << 'SQL'

-- ============ Filament: batch_number ============
ALTER TABLE filaments ADD COLUMN IF NOT EXISTS batch_number VARCHAR(100);

-- ============ Kunden: customer_number ============
ALTER TABLE customers ADD COLUMN IF NOT EXISTS customer_number VARCHAR(30) UNIQUE;
CREATE INDEX IF NOT EXISTS idx_customers_number ON customers(customer_number);
DO $$
DECLARE r RECORD; n INTEGER := 1;
BEGIN
  FOR r IN SELECT id FROM customers WHERE customer_number IS NULL ORDER BY id LOOP
    UPDATE customers SET customer_number = 'K-' || LPAD(n::text, 4, '0') WHERE id = r.id;
    n := n + 1;
  END LOOP;
END $$;

-- ============ Druckplatten ============
CREATE TABLE IF NOT EXISTS print_job_plates (
  id SERIAL PRIMARY KEY,
  job_id INTEGER NOT NULL REFERENCES print_jobs(id) ON DELETE CASCADE,
  position INTEGER DEFAULT 1,
  name VARCHAR(200),
  duration_hours FLOAT DEFAULT 0.0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pjp_job ON print_job_plates(job_id);

-- ============ Filament-Reservierung ============
CREATE TABLE IF NOT EXISTS print_job_filaments (
  id SERIAL PRIMARY KEY,
  job_id INTEGER NOT NULL REFERENCES print_jobs(id) ON DELETE CASCADE,
  plate_id INTEGER REFERENCES print_job_plates(id) ON DELETE CASCADE,
  filament_id INTEGER REFERENCES filaments(id) ON DELETE SET NULL,
  grams_reserved FLOAT NOT NULL DEFAULT 0.0,
  grams_used FLOAT,
  slot INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pjf_job ON print_job_filaments(job_id);
ALTER TABLE print_job_filaments
  ADD COLUMN IF NOT EXISTS plate_id INTEGER REFERENCES print_job_plates(id) ON DELETE CASCADE;

-- ============ Inventar ============
CREATE TABLE IF NOT EXISTS inventory_items (
  id SERIAL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  category VARCHAR(50) NOT NULL DEFAULT 'spare_part',
  description TEXT,
  manufacturer VARCHAR(120),
  part_number VARCHAR(100),
  quantity FLOAT DEFAULT 0.0,
  unit VARCHAR(20) DEFAULT 'Stk',
  minimum_stock FLOAT DEFAULT 0.0,
  purchase_price FLOAT DEFAULT 0.0,
  supplier VARCHAR(200),
  purchase_date DATE,
  location VARCHAR(200),
  printer_compat VARCHAR(500),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE
);

-- ============ Druck-Historie: Multi-Filament ============
CREATE TABLE IF NOT EXISTS print_history_filaments (
  id SERIAL PRIMARY KEY,
  history_id INTEGER NOT NULL REFERENCES print_history(id) ON DELETE CASCADE,
  filament_id INTEGER REFERENCES filaments(id) ON DELETE SET NULL,
  grams_used FLOAT NOT NULL,
  slot INTEGER
);
CREATE INDEX IF NOT EXISTS idx_phf_history ON print_history_filaments(history_id);

-- ============ Rechnungen ============
ALTER TABLE company ADD COLUMN IF NOT EXISTS invoice_number_prefix VARCHAR(20) DEFAULT 'RE-';
ALTER TABLE company ADD COLUMN IF NOT EXISTS invoice_number_pattern VARCHAR(50) DEFAULT '{prefix}{year}-{seq:04d}';
ALTER TABLE company ADD COLUMN IF NOT EXISTS invoice_next_seq INTEGER DEFAULT 1;
ALTER TABLE company ADD COLUMN IF NOT EXISTS invoice_seq_year INTEGER;
ALTER TABLE company ADD COLUMN IF NOT EXISTS default_payment_terms_days INTEGER DEFAULT 14;
ALTER TABLE company ADD COLUMN IF NOT EXISTS default_skonto_percent FLOAT DEFAULT 0.0;
ALTER TABLE company ADD COLUMN IF NOT EXISTS default_skonto_days INTEGER DEFAULT 7;
ALTER TABLE company ADD COLUMN IF NOT EXISTS default_vat_rate FLOAT DEFAULT 19.0;
ALTER TABLE company ADD COLUMN IF NOT EXISTS invoice_footer_text TEXT;

CREATE TABLE IF NOT EXISTS invoices (
  id SERIAL PRIMARY KEY,
  invoice_number VARCHAR(50) UNIQUE NOT NULL,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  job_id INTEGER REFERENCES print_jobs(id) ON DELETE SET NULL,
  status VARCHAR(40) DEFAULT 'draft',
  invoice_date DATE NOT NULL,
  service_date DATE,
  due_date DATE,
  paid_date DATE,
  payment_terms_days INTEGER DEFAULT 14,
  skonto_percent FLOAT DEFAULT 0.0,
  skonto_days INTEGER DEFAULT 7,
  payment_method VARCHAR(80),
  subtotal_net FLOAT DEFAULT 0.0,
  vat_total FLOAT DEFAULT 0.0,
  total_gross FLOAT DEFAULT 0.0,
  reminder_count INTEGER DEFAULT 0,
  last_reminder_date DATE,
  reminder_fee FLOAT DEFAULT 0.0,
  intro_text TEXT,
  closing_text TEXT,
  notes TEXT,
  pdf_path VARCHAR(500),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE
);
CREATE INDEX IF NOT EXISTS idx_invoices_number ON invoices(invoice_number);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);

CREATE TABLE IF NOT EXISTS invoice_items (
  id SERIAL PRIMARY KEY,
  invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  position INTEGER DEFAULT 1,
  description TEXT NOT NULL,
  quantity FLOAT DEFAULT 1.0,
  unit VARCHAR(20) DEFAULT 'Stk',
  unit_price_net FLOAT DEFAULT 0.0,
  vat_rate FLOAT DEFAULT 19.0,
  discount_percent FLOAT DEFAULT 0.0,
  line_total_net FLOAT DEFAULT 0.0,
  line_vat FLOAT DEFAULT 0.0,
  line_total_gross FLOAT DEFAULT 0.0
);
CREATE INDEX IF NOT EXISTS idx_invoice_items_inv ON invoice_items(invoice_id);

-- ============ SMTP + Notifications ============
CREATE TABLE IF NOT EXISTS smtp_settings (
  id SERIAL PRIMARY KEY,
  enabled BOOLEAN DEFAULT FALSE,
  host VARCHAR(200),
  port INTEGER DEFAULT 587,
  use_tls BOOLEAN DEFAULT TRUE,
  use_ssl BOOLEAN DEFAULT FALSE,
  username VARCHAR(200),
  password VARCHAR(500),
  from_email VARCHAR(200),
  from_name VARCHAR(200),
  reply_to VARCHAR(200)
);

CREATE TABLE IF NOT EXISTS notification_preferences (
  id SERIAL PRIMARY KEY,
  user_id INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  on_print_success BOOLEAN DEFAULT TRUE,
  on_print_failed BOOLEAN DEFAULT TRUE,
  on_print_cancelled BOOLEAN DEFAULT FALSE,
  on_print_started BOOLEAN DEFAULT FALSE,
  on_progress_50 BOOLEAN DEFAULT FALSE,
  on_filament_change BOOLEAN DEFAULT FALSE,
  on_pause BOOLEAN DEFAULT FALSE,
  on_error BOOLEAN DEFAULT TRUE,
  on_maintenance_due BOOLEAN DEFAULT FALSE,
  printer_filter VARCHAR(500)
);

-- ============ Integration-Settings (Tuya + Bambu Cloud) ============
CREATE TABLE IF NOT EXISTS integration_settings (
  id INTEGER PRIMARY KEY DEFAULT 1,
  tuya_enabled BOOLEAN DEFAULT FALSE,
  tuya_access_id VARCHAR(200),
  tuya_access_secret VARCHAR(500),
  tuya_api_endpoint VARCHAR(200) DEFAULT 'https://openapi.tuyaeu.com',
  bambu_enabled BOOLEAN DEFAULT FALSE,
  bambu_cloud_email VARCHAR(200),
  bambu_cloud_password VARCHAR(500),
  bambu_cloud_token VARCHAR(2000),
  bambu_cloud_user_id VARCHAR(100),
  bambu_cloud_mqtt_host VARCHAR(200),
  updated_at TIMESTAMP WITH TIME ZONE
);

ALTER TABLE integration_settings ADD COLUMN IF NOT EXISTS bambu_cloud_token VARCHAR(2000);
ALTER TABLE integration_settings ADD COLUMN IF NOT EXISTS bambu_cloud_user_id VARCHAR(100);
ALTER TABLE integration_settings ADD COLUMN IF NOT EXISTS bambu_cloud_mqtt_host VARCHAR(200);

-- ============ Email-Templates (editierbar) ============
CREATE TABLE IF NOT EXISTS email_templates (
  id SERIAL PRIMARY KEY,
  status_key VARCHAR(50) UNIQUE NOT NULL,
  label VARCHAR(120),
  subject VARCHAR(300) NOT NULL,
  body TEXT NOT NULL,
  enabled BOOLEAN DEFAULT TRUE,
  updated_at TIMESTAMP WITH TIME ZONE
);

-- ============ PrintJob: Kalkulation, Auto-Mail, Foto ============
ALTER TABLE print_jobs ADD COLUMN IF NOT EXISTS calculated_cost_net FLOAT;
ALTER TABLE print_jobs ADD COLUMN IF NOT EXISTS calculated_price_net FLOAT;
ALTER TABLE print_jobs ADD COLUMN IF NOT EXISTS cost_breakdown TEXT;
ALTER TABLE print_jobs ADD COLUMN IF NOT EXISTS print_file_name VARCHAR(300);
ALTER TABLE print_jobs ADD COLUMN IF NOT EXISTS customer_notified_start BOOLEAN DEFAULT FALSE;
ALTER TABLE print_jobs ADD COLUMN IF NOT EXISTS customer_notified_done BOOLEAN DEFAULT FALSE;
ALTER TABLE print_jobs ADD COLUMN IF NOT EXISTS result_photo_path VARCHAR(500);

-- ============ Printer: Kalkulations- & Cloud- & OctoPrint-Werte ============
ALTER TABLE printers ADD COLUMN IF NOT EXISTS hourly_rate FLOAT DEFAULT 0.0;
ALTER TABLE printers ADD COLUMN IF NOT EXISTS power_price_kwh FLOAT DEFAULT 0.30;
ALTER TABLE printers ADD COLUMN IF NOT EXISTS avg_power_w FLOAT DEFAULT 120.0;
ALTER TABLE printers ADD COLUMN IF NOT EXISTS margin_percent FLOAT DEFAULT 0.0;
ALTER TABLE printers ADD COLUMN IF NOT EXISTS connection_mode VARCHAR(20) DEFAULT 'lan';
ALTER TABLE printers ADD COLUMN IF NOT EXISTS octo_url VARCHAR(300);
ALTER TABLE printers ADD COLUMN IF NOT EXISTS octo_api_key VARCHAR(120);
SQL
```

### 4. Container neu bauen

```bash
sudo docker compose down
sudo docker compose up -d --build
```

### 5. Browser-Cache leeren

Strg+Shift+R (Hard Reload).

---

## Feature-Übersicht

### Customer Journey
- **Status-Mails an Kunden** bei jedem Statuswechsel
- **Email-Templates editierbar** in der UI mit Platzhaltern und Live-Vorschau
- **Druck-Dateiname** für automatisches MQTT-Matching
- **Druckergebnis-Foto** manuell hochladbar

### Kalender
- Monats-/Wochenansicht
- Drag & Drop für Terminplanung
- Sidebar für ungeplante Aufträge

### Drucker-Verbindungen
- Bambu LAN / Bambu Cloud / OctoPrint - jeweils separater Modus
- OctoPrint: Live-Status, Steuerung, Datei-Upload, Druck-Start

### Kalkulation
- Inline-Kalkulator im Auftrag-Modal
- Verkaufspreis mit einem Klick übernehmen

### Tuya v2.0
- Konfiguration via Web-UI (kein Container-Restart nötig)
- Auto-Migration aus .env beim ersten Start

---

## Backup-System nutzen

### Manuelles Backup
```bash
sudo ./backup.sh
# Erstellt: ./backups/printfarm_YYYYMMDD_HHMMSS.tar.gz
```

### Tägliches Backup via Cron
```bash
crontab -e
# Zeile hinzufügen:
0 3 * * * cd /home/USER/Dokumente/printfarm && sudo ./backup.sh >> /var/log/printfarm-backup.log 2>&1
```

### Restore
```bash
sudo ./restore.sh ./backups/printfarm_20260605_030000.tar.gz
```

---

## Troubleshooting

### Frontend zeigt alte Version
```bash
sudo docker compose up -d --build frontend
# Browser hart neu laden: Strg+Shift+R
```

### "no such column" / "table doesn't exist"
Datenbank-Migration aus Schritt 3 wurde nicht ausgeführt.

### OctoPrint zeigt "nicht verbunden"
- URL richtig? Test: `curl -H "X-Api-Key: DEIN_KEY" http://DEINE_URL/api/version`
- API-Key gültig?
- Firewall zwischen Server und OctoPrint offen?

### Tuya: Code 501 oder "unknown error"
Tuya-Pfade prüfen. Aktuell (Stand 2026):
- Status: `/v2.0/cloud/thing/{id}/shadow/properties`
- Statistik: `/v2.0/cloud/thing/{id}/statistics/days`
- Schalten: `/v2.0/cloud/thing/{id}/shadow/properties/issue`

### Bambu Cloud Verifizierungscode geht nicht
- Code ist nur ~5 Minuten gültig → immer den NEUESTEN nutzen
- Account-Region prüfen (EU/US/CN)

### Bambu LAN: "Not authorized"
Access Code am Drucker neu ablesen (Einstellungen → WLAN → Show Detail).

### Bambu Camera funktioniert nicht
P1-Modelle blockieren RTSP oft → **Druckergebnis-Foto manuell hochladen**.

### Kalender leer trotz Aufträgen
- Aufträge mit Status `completed`, `paid` oder `cancelled` werden nicht angezeigt (historisch)
- Aufträge ohne `due_date` erscheinen in der rechten Sidebar

### Aufträge-Seite weiß nach Update
Browser hart neu laden (Strg+Shift+R). Falls das nicht hilft: Container neu bauen.
