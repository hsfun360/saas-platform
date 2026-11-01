#!/bin/sh
# Render the proxy-token include for the /api/ reverse proxy.
#
# nginx forwards the real browser IP to the API in X-Client-IP (the LAST entry
# of the X-Forwarded-For that Cloud Run's front end appends - see the map in
# nginx.conf). The API must only believe that header from THIS proxy, never
# from a direct caller, so the proxy also sends X-Proxy-Token with a shared
# secret (PROXY_TOKEN here = PROXY_SHARED_TOKEN on platform-api, one Secret
# Manager secret per environment).
#
# The header line lives in an include file written at startup so the config
# renders either way: with the token the API attributes requests to the real
# client; without it the include is empty and the API falls back to seeing this
# proxy's egress IP (every user pools in one per-IP rate-limit bucket - the
# 2026-10-30 finding). The envsubst step cannot express "omit the line", hence
# this script. Runs under `set -e` in lexical order, before 20-envsubst.
set -e

F=/etc/nginx/proxy-token.conf
if [ -n "$PROXY_TOKEN" ]; then
    printf 'proxy_set_header X-Proxy-Token "%s";\n' "$PROXY_TOKEN" > "$F"
    echo "proxy-token: forwarding the client IP to the API with the shared token"
else
    : > "$F"
    echo "proxy-token: PROXY_TOKEN not set - the API will see this proxy's IP as every client's (per-IP limits pool); attach the PROXY_SHARED_TOKEN secret as PROXY_TOKEN" >&2
fi
