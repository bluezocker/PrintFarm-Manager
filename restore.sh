#!/bin/bash
#
# PrintFarm Manager - Restore-Script
#
# Stellt ein Backup wieder her, das mit ./backup.sh erstellt wurde.
#
# Verwendung:
#   ./restore.sh ./backups/printfarm_20260515_030000.tar.gz
#
# ACHTUNG: Überschreibt die aktuelle Datenbank und uploads!

set -euo pipefail

if [ $# -lt 1 ]; then
    echo "Verwendung: $0 <pfad/zum/backup.tar.gz>"
    exit 1
fi

BACKUP_FILE="$1"
DB_NAME="printfarm"

if [ ! -f "$BACKUP_FILE" ]; then
    echo "Backup-Datei nicht gefunden: $BACKUP_FILE" >&2
    exit 1
fi

echo "ACHTUNG: Diese Aktion wird die aktuelle Datenbank und uploads/ ÜBERSCHREIBEN."
echo "Backup-Datei: $BACKUP_FILE"
read -p "Wirklich fortfahren? (yes/nein) " confirm
if [ "$confirm" != "yes" ]; then
    echo "Abgebrochen."
    exit 0
fi

TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

echo "Entpacke Backup..."
tar -xzf "$BACKUP_FILE" -C "$TMP_DIR"

if [ -f "$TMP_DIR/metadata.txt" ]; then
    echo
    echo "Backup-Info:"
    cat "$TMP_DIR/metadata.txt" | head -10
    echo
fi

# 1. Datenbank
if [ -f "$TMP_DIR/database.sql" ]; then
    echo "Stelle Datenbank wieder her..."
    # Trick: erst SQL-Datei in Container kopieren, dann dort ausführen.
    # Direktes "psql ... < datei.sql" hängt auf manchen Systemen.

    # DB leeren
    sudo docker compose exec -T db sh -c \
        'PGPASSWORD="$POSTGRES_PASSWORD" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"'

    # SQL-Datei in Container kopieren und ausführen
    CONTAINER_TMP="/tmp/printfarm_restore_$$.sql"
    sudo docker compose cp "$TMP_DIR/database.sql" "db:$CONTAINER_TMP"
    sudo docker compose exec -T db sh -c \
        "PGPASSWORD=\"\$POSTGRES_PASSWORD\" psql -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -f $CONTAINER_TMP"
    sudo docker compose exec -T db rm -f "$CONTAINER_TMP" 2>/dev/null || true

    echo "  Datenbank wiederhergestellt ✓"
fi

# 2. Uploads
if [ -d "$TMP_DIR/uploads" ]; then
    echo "Stelle uploads wieder her..."
    if [ -d "./uploads" ]; then
        # Lokales Volume
        rm -rf ./uploads/*
        cp -r "$TMP_DIR/uploads/"* ./uploads/
    else
        # Docker-Volume
        sudo docker run --rm \
            -v printfarm_uploads:/target \
            -v "$TMP_DIR/uploads":/source:ro \
            alpine sh -c "rm -rf /target/* && cp -r /source/* /target/"
    fi
    echo "  Uploads wiederhergestellt ✓"
fi

echo
echo "Restore abgeschlossen. Container neu starten:"
echo "  sudo docker compose restart backend"
