#!/bin/bash
#
# PrintFarm Manager - Backup-Script
#
# Erstellt ein Komplett-Backup von:
# - PostgreSQL Datenbank (pg_dump)
# - uploads/ Verzeichnis (Logos, Rechnungs-PDFs, etc.)
#
# Verwendung:
#   ./backup.sh                  # Backup nach ./backups/
#   ./backup.sh /pfad/zu/backup  # Backup in anderen Ordner
#
# Cron-Beispiel (tägliches Backup um 3 Uhr):
#   0 3 * * * cd /opt/printfarm && ./backup.sh >> /var/log/printfarm-backup.log 2>&1
#
# Aufräumen: das Script behält die letzten 30 Backups, alte werden gelöscht.

set -euo pipefail

# Konfiguration
BACKUP_DIR="${1:-./backups}"
KEEP_BACKUPS=30
DB_NAME="printfarm"

# Farben für Ausgabe
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log() { echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
err() { echo -e "${RED}[ERROR]${NC} $1" >&2; }

# Backup-Verzeichnis sicherstellen
mkdir -p "$BACKUP_DIR"
TIMESTAMP=$(date +'%Y%m%d_%H%M%S')
BACKUP_FILE="$BACKUP_DIR/printfarm_${TIMESTAMP}.tar.gz"
TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

log "Starte Backup nach $BACKUP_FILE"

# 1. Datenbank-Dump
# Trick: erst im Container in eine Datei schreiben, dann mit "docker compose cp"
# rauskopieren. Direktes Output-Streaming "docker compose exec ... > datei.sql"
# hängt auf manchen Systemen wegen Buffering-Problemen.
log "Erstelle PostgreSQL-Dump..."
CONTAINER_TMP="/tmp/printfarm_backup_$$.sql"
if ! sudo docker compose exec -T db sh -c \
    "PGPASSWORD=\"\$POSTGRES_PASSWORD\" pg_dump -U \"\$POSTGRES_USER\" -f $CONTAINER_TMP \"\$POSTGRES_DB\""; then
    err "pg_dump im Container fehlgeschlagen"
    sudo docker compose exec -T db rm -f "$CONTAINER_TMP" 2>/dev/null || true
    exit 1
fi
if ! sudo docker compose cp "db:$CONTAINER_TMP" "$TMP_DIR/database.sql"; then
    err "Konnte Dump nicht aus Container kopieren"
    sudo docker compose exec -T db rm -f "$CONTAINER_TMP" 2>/dev/null || true
    exit 1
fi
sudo docker compose exec -T db rm -f "$CONTAINER_TMP" 2>/dev/null || true
DB_SIZE=$(du -h "$TMP_DIR/database.sql" | cut -f1)
log "  DB-Dump: $DB_SIZE"

# 2. Uploads-Verzeichnis
if [ -d "./uploads" ]; then
    log "Kopiere uploads/..."
    cp -r ./uploads "$TMP_DIR/uploads"
    UP_SIZE=$(du -sh "$TMP_DIR/uploads" | cut -f1)
    log "  Uploads: $UP_SIZE"
elif sudo docker volume inspect printfarm_uploads &>/dev/null; then
    log "Kopiere uploads aus Docker-Volume..."
    sudo docker run --rm \
        -v printfarm_uploads:/source:ro \
        -v "$TMP_DIR":/backup \
        alpine cp -r /source /backup/uploads
    UP_SIZE=$(du -sh "$TMP_DIR/uploads" | cut -f1)
    log "  Uploads: $UP_SIZE"
else
    warn "Keine uploads/ gefunden - überspringe"
fi

# 3. Metadaten
cat > "$TMP_DIR/metadata.txt" <<EOF
PrintFarm Backup
================
Erstellt am: $(date '+%Y-%m-%d %H:%M:%S')
Hostname:    $(hostname)
DB-Name:     $DB_NAME

Wiederherstellung mit ./restore.sh:
  sudo ./restore.sh $(basename "$BACKUP_FILE")
EOF

# 4. Archivieren
log "Erstelle Archiv..."
tar -czf "$BACKUP_FILE" -C "$TMP_DIR" .
SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
log "  Backup erstellt: $SIZE"

# 5. Alte Backups löschen
log "Räume alte Backups auf (behalte letzte $KEEP_BACKUPS)..."
cd "$BACKUP_DIR"
ls -1t printfarm_*.tar.gz 2>/dev/null | tail -n +$((KEEP_BACKUPS + 1)) | while read old; do
    rm -f "$old"
    log "  Gelöscht: $old"
done

log "Backup abgeschlossen ✓"
echo
echo "Backup-Datei: $BACKUP_FILE"
echo "Größe:        $SIZE"
