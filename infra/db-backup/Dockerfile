# Backup job image: Postgres 18 client tools (pg_dump must be >= server major
# version; the server runs PostgreSQL 18.x) plus curl/jq for the GCS upload.
FROM postgres:18-alpine

RUN apk add --no-cache curl jq

COPY backup.sh /backup.sh
RUN chmod +x /backup.sh

ENTRYPOINT ["/backup.sh"]
