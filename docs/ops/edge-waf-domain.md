# Edge: Custom Domain, HTTPS Load Balancer & WAF (myeasysoft.com)

The production edge for the platform: a global external HTTPS load balancer fronting the two Cloud Run services, with a Google-managed TLS certificate, Cloud Armor WAF, and HTTP-to-HTTPS redirect.
Single-host design: one domain serves the Angular app, and `/api/*` is path-routed to the API, so the app and API are **same-origin** (the refresh cookie is first-party).

## Topology

```
myeasysoft.com / www.myeasysoft.com
        |
   [DNS A record -> 136.68.18.10]      (reserved global IP: myeasysoft-lb-ip)
        |
  Global HTTPS LB  --- cert-myeasysoft (managed TLS: www + apex)
        |  url-map: lb-myeasysoft
        |    default            -> be-login-web  -> neg-login-web  -> Cloud Run login-web
        |    path /api/*        -> be-login-api  -> neg-login-api  -> Cloud Run login-api
        |  (both backends carry Cloud Armor policy waf-myeasysoft)
        |
  Port 80 -> proxy-myeasysoft-http -> lb-myeasysoft-http-redirect (301 -> https)
```

All resources are in project `membership-project-199610`, region `asia-southeast1` (NEGs) / global (LB).

## DNS (done once, on GoDaddy)

Point the domain at the load balancer's reserved IP **136.68.18.10**:

| Type | Host | Value | TTL |
| --- | --- | --- | --- |
| A | `@` | `136.68.18.10` | 600 |
| A | `www` | `136.68.18.10` | 600 |

Remove any GoDaddy parking/forwarding records for `@` and `www` first.
The managed certificate only finishes provisioning **after** DNS resolves to this IP; allow 15-60 minutes.

## WAF (Cloud Armor policy `waf-myeasysoft`)

| Priority | Rule | Action |
| --- | --- | --- |
| 1000 | Preconfigured SQLi (`sqli-v33-stable`, sensitivity 1) | **deny 403 (enforced)** |
| 1001 | Preconfigured XSS (`xss-v33-stable`, sensitivity 1) | **preview only** |
| 1100 | Per-IP rate backstop, 600 req/min | throttle -> 429 |
| default | | allow |

- XSS starts in **preview** because the email-template editor legitimately posts HTML; watch `jsonPayload.enforcedSecurityPolicy` in the load-balancer logs, tune sensitivity or add an exclusion for the template-save routes, then flip to enforced with `gcloud compute security-policies rules update 1001 --security-policy=waf-myeasysoft --no-preview`.
- The 600/min edge throttle is a coarse backstop; the fine-grained per-endpoint limits remain the app-level `rateLimits.js` factories.
- Sensitivity 1 (lowest) is chosen to minimise false positives on a JSON API; raise deliberately after observing preview logs.

## Application cutover (after cert is ACTIVE)

Done together as one release so the app becomes same-origin cleanly:

1. **Web:** `apps/web/src/environments/environment.ts` uses `apiUrl: '/api'` (relative); `proxy.conf.json` covers local `ng serve`. Deploy via `deploy-web`.
2. **API:** deploy via `deploy-api`, then set the cutover env in one update:
   ```powershell
   gcloud run services update login-api --region asia-southeast1 `
     --update-env-vars FRONTEND_BASE_URL=https://www.myeasysoft.com,COOKIE_SAMESITE=lax
   ```
   - `FRONTEND_BASE_URL` -> the domain so email links use it (only after DNS resolves).
   - `COOKIE_SAMESITE=lax` -> first-party refresh cookie (valid only once same-origin; cross-origin requires `none`).
   - CORS already allows the domain (`app.js`).

## Verify

```powershell
curl -I https://www.myeasysoft.com/                      # 200, app shell
curl -I http://www.myeasysoft.com/                       # 301 -> https
curl -s -o /dev/null -w "%{http_code}" https://www.myeasysoft.com/api/   # API reachable via /api
```
Then a real login on the domain: confirm the `rt` cookie is set first-party on `www.myeasysoft.com` with `SameSite=Lax`, and that refresh/logout work.

## Rollback

- App-level: redeploy the previous `login-web` revision (absolute API URL) and remove `COOKIE_SAMESITE` (reverts to `none`); the run.app URLs keep working independently of the LB.
- The LB and WAF can stay up regardless; traffic only reaches them via the domain DNS.
