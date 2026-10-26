#!/usr/bin/env bash
# Nightly database backup (docs/OPERATIONS.md). Writes a compressed custom-
# format dump to $BACKUP_DIR, keeps $BACKUP_KEEP_DAYS days of them, and, if
# $BACKUP_UPLOAD_CMD is set, runs it with the file name to copy it off the
# server (e.g. to object storage in the same jurisdiction).
#
#   DATABASE_URL=postgresql://... BACKUP_DIR=/var/backups/registry ./scripts/backup-db.sh
#
# The "Backup check" job (POST /api/jobs/backup-check) fails if the newest
# file here is missing, empty or more than 26 hours old.
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is not set}"
: "${BACKUP_DIR:?BACKUP_DIR is not set}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-30}"

mkdir -p "$BACKUP_DIR"
stamp="$(date -u +%Y%m%dT%H%MZ)"
file="$BACKUP_DIR/registry-$stamp.dump"
tmp="$file.partial"

# --format=custom is compressed and restores with pg_restore (any order, -j).
pg_dump --format=custom --no-owner --no-privileges --file="$tmp" "$DATABASE_URL"
# Only a complete dump gets the .dump name the check looks for.
mv "$tmp" "$file"
echo "Backup written: $file ($(du -h "$file" | cut -f1))"

if [ -n "${BACKUP_UPLOAD_CMD:-}" ]; then
  # e.g. BACKUP_UPLOAD_CMD='aws s3 cp --only-show-errors {} s3://ogserc-registry-backups/'
  ${BACKUP_UPLOAD_CMD//\{\}/$file}
  echo "Copied off the server."
fi

find "$BACKUP_DIR" -name 'registry-*.dump' -type f -mtime +"$KEEP_DAYS" -print -delete
