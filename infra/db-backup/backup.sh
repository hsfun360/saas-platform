#!/bin/sh
# Nightly logical backup of the platform Postgres database to Google Cloud Storage.
# Runs as a Cloud Run Job. Any failure exits non-zero so the execution is marked
# failed and the monitoring alert fires.
#
# Required env:
#   DATABASE_URL  - Postgres connection string (Secret Manager)
#   BACKUP_BUCKET - target GCS bucket name (plain env var)
set -eu

TZ_REGION="${BACKUP_TZ:-Asia/Kuala_Lumpur}"
STAMP="$(TZ="$TZ_REGION" date +%Y%m%d-%H%M%S)"
DAY_OF_MONTH="$(TZ="$TZ_REGION" date +%d)"
DUMP_FILE="/tmp/loginDB-${STAMP}.dump"

echo "Starting pg_dump (custom format) at ${STAMP} ${TZ_REGION}"
pg_dump "$DATABASE_URL" -Fc -f "$DUMP_FILE"

# Sanity floor: an empty/near-empty dump means something went wrong upstream
# even if pg_dump exited 0 (e.g. wrong database). 100 KB is far below any
# real dump of this DB but far above a bare schema-less file.
SIZE=$(wc -c < "$DUMP_FILE")
echo "Dump size: ${SIZE} bytes"
if [ "$SIZE" -lt 102400 ]; then
  echo "ERROR: dump is suspiciously small (${SIZE} bytes) - aborting upload" >&2
  exit 1
fi

TOKEN=$(curl -sf -H "Metadata-Flavor: Google" \
  "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token" \
  | jq -r .access_token)

upload() {
  OBJECT_NAME="$1"
  echo "Uploading gs://${BACKUP_BUCKET}/${OBJECT_NAME}"
  HTTP_CODE=$(curl -s -o /tmp/upload-response.json -w "%{http_code}" -X POST \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "Content-Type: application/octet-stream" \
    --data-binary @"$DUMP_FILE" \
    "https://storage.googleapis.com/upload/storage/v1/b/${BACKUP_BUCKET}/o?uploadType=media&name=${OBJECT_NAME}")
  if [ "$HTTP_CODE" != "200" ]; then
    echo "ERROR: upload of ${OBJECT_NAME} failed with HTTP ${HTTP_CODE}" >&2
    cat /tmp/upload-response.json >&2
    exit 1
  fi
}

upload "daily/loginDB-${STAMP}.dump"

# First-of-month copy goes to the long-retention prefix.
if [ "$DAY_OF_MONTH" = "01" ]; then
  upload "monthly/loginDB-${STAMP}.dump"
fi

echo "Backup completed successfully."
