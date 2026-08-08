#!/bin/sh
# Fail fast when API_HOST is not set.
#
# nginx.conf reverse-proxies /api/ to https://${API_HOST} so the SPA is
# same-origin with the API. There is deliberately NO default: every value we
# could pick belongs to some other environment, and proxying one environment's
# API to another's database is far worse than not starting. (The image used to
# default to the old prod API host, which was deleted with that project on
# 2026-08-01 - dev and staging only worked because they override it.)
#
# The nginx entrypoint runs /docker-entrypoint.d/*.sh under `set -e` in lexical
# order, so this aborts startup before 20-envsubst-on-templates.sh renders the
# config. Without it, the unsubstituted ${API_HOST} reaches nginx as an unknown
# variable and the container dies with a cryptic parse error instead.
set -e

if [ -z "$API_HOST" ]; then
    echo "FATAL: API_HOST is not set." >&2
    echo "       Set it to the API service host for THIS environment, without a scheme:" >&2
    echo "         gcloud run services update platform-web --region <region> --project <project> \\" >&2
    echo "           --update-env-vars API_HOST=platform-api-<project-number>.<region>.run.app" >&2
    echo "       Behind a load balancer that answers /api/* itself, set it anyway - the" >&2
    echo "       location stays dormant, but nginx still has to render a valid config." >&2
    exit 1
fi

echo "api-host: proxying /api/ to https://$API_HOST"
