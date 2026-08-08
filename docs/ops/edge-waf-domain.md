# Edge: Custom Domain, HTTPS Load Balancer & WAF (myeasysoft.com)

**Status: NOT BUILT. Decommissioned 2026-08-01.**

This edge was built on 2026-07-29 in the old `membership-project-199610` project and torn down on 2026-08-01 together with that environment.
The load balancer, url map, proxies, backend services, NEGs, Cloud Armor policy `waf-myeasysoft`, managed certificate `cert-myeasysoft` and the reserved IP `myeasysoft-lb-ip` no longer exist.

`myeasysoft.com` is **dark**: the domain is owned (GoDaddy, bought 2026-07-29) but points at nothing.
Do not reuse the old IP `136.68.18.10` anywhere - it was released with the project, and a rebuilt LB gets a **new** address that the DNS records must be repointed at.

Dev and staging deliberately have no LB.
They get same-origin `/api` from the web container's nginx reverse proxy instead (see [dev-environment.md](dev-environment.md)), which is why nothing here blocks day-to-day work.

## When this gets rebuilt

This is a **pre-launch milestone**, built once against the new prod project, bundled with the rest of the go-live work:

1. Create the prod GCP project and deploy `platform-web` + `platform-api` into it (region `asia-southeast3`, matching dev/staging).
2. Build the edge below and reserve a new global IP.
3. Repoint the GoDaddy DNS records at that IP and wait for the managed certificate.
4. Cut the app over to the domain, then run the pen test ([pen-test-scope.md](pen-test-scope.md)).

Everything from here down is the design to rebuild, not a description of anything currently running.

## Target topology

One global external HTTPS load balancer fronts both Cloud Run services on a single host, so the app and API are **same-origin** and the refresh cookie is first-party with no production CORS.
This host-split decision (path-routed single host, not `app.` + `api.` subdomains) is settled - keep it.

```
myeasysoft.com / www.myeasysoft.com
        |
   [DNS A record -> <new reserved global IP>]
        |
  Global HTTPS LB  --- managed TLS cert (www + apex)
        |  url-map
        |    default            -> be-platform-web  -> neg-platform-web  -> Cloud Run platform-web
        |    path /api/*        -> be-platform-api  -> neg-platform-api  -> Cloud Run platform-api
        |  (both backends carry the Cloud Armor policy)
        |
  Port 80 -> http proxy -> 301 redirect to https
```

Serverless NEGs are regional and must sit in the same region as the Cloud Run services (`asia-southeast3`); the LB itself is global.
Name the resources after the new service names (`platform-*`), not the retired `login-*` ones.

## DNS (GoDaddy, user action, after the IP is reserved)

| Type | Host | Value | TTL |
| --- | --- | --- | --- |
| A | `@` | *(new reserved IP)* | 600 |
| A | `www` | *(new reserved IP)* | 600 |

Remove any GoDaddy parking/forwarding records for `@` and `www` first.
The managed certificate stays in `PROVISIONING` and only goes `ACTIVE` **after** DNS resolves to the IP; allow 15-60 minutes.

## WAF (Cloud Armor)

| Priority | Rule | Action |
| --- | --- | --- |
| 1000 | Preconfigured SQLi (`sqli-v33-stable`, sensitivity 1) | **deny 403 (enforced)** |
| 1001 | Preconfigured XSS (`xss-v33-stable`, sensitivity 1) | **preview only, at first** |
| 1100 | Per-IP rate backstop, 600 req/min | throttle -> 429 |
| default | | allow |

- XSS must start in **preview**, because the email-template editor legitimately posts HTML and would otherwise be blocked.
  Watch `jsonPayload.enforcedSecurityPolicy` in the load-balancer logs for about two weeks, tune the sensitivity or add an exclusion for the template-save routes, then enforce it with `gcloud compute security-policies rules update 1001 --security-policy=<policy> --no-preview`.
- Sensitivity 1 (the lowest) is chosen to minimise false positives on a JSON API; raise it deliberately after reading the preview logs, never up front.
- The 600/min edge throttle is a coarse backstop only.
  The fine-grained per-endpoint limits stay in the app-level `rateLimits.js` factories.
- Enable 100% request logging on both backend services, otherwise the preview logs the XSS decision depends on are sampled away.

## Application cutover (after the cert is ACTIVE)

Done as one release so the app becomes same-origin cleanly:

1. **Web:** `apps/web/src/environments/environment.ts` uses `apiUrl: '/api'` (relative); `proxy.conf.json` covers local `ng serve`.
   Deploy via `deploy-web`.
2. **API:** deploy via `deploy-api`, then set the cutover env in one update:
   ```powershell
   gcloud run services update platform-api --region asia-southeast3 `
     --update-env-vars FRONTEND_BASE_URL=https://www.myeasysoft.com,COOKIE_SAMESITE=lax
   ```
   - `FRONTEND_BASE_URL` -> the domain, so email links point at it (only after DNS resolves).
   - `COOKIE_SAMESITE=lax` -> first-party refresh cookie, valid only once same-origin (cross-origin requires `none`).
   - Confirm the domain is in the CORS allow-list in `app.js`.
3. **Google SSO:** add the domain as an authorized JavaScript origin and `https://www.myeasysoft.com/login` as a redirect URI on the prod OAuth client.
   Sign-in breaks with a redirect-URI mismatch if this is skipped, and the failure only shows up on the domain, never on the run.app URL.

## Verify

```powershell
curl -I https://www.myeasysoft.com/                      # 200, app shell
curl -I http://www.myeasysoft.com/                       # 301 -> https
curl -s -o /dev/null -w "%{http_code}" https://www.myeasysoft.com/api/auth/debug-test
```
Then a real login on the domain: confirm the `rt` cookie is set first-party on `www.myeasysoft.com` with `SameSite=Lax`, and that refresh and logout both work.

## Gotchas (learned building the first one - these still apply)

- **Serverless NEG backend services must use protocol `HTTP`, not `HTTPS`.**
  Creating a backend service with `--protocol=HTTPS` sets `portName: https`, and `add-backend` then fails with `Invalid value for field 'resource.portName': 'https'. Port name is not supported for a backend service with Serverless network endpoint groups.`
  The LB-to-Cloud-Run hop is Google-managed and encrypted regardless; the client-to-LB leg is HTTPS via the cert.
  Fix: export the backend service, set `protocol: HTTP` + `portName: http`, import, then `add-backend`.
- A backend service with **no backends** returns `503` at the edge even though TLS and the url map are fine.
  Check `backend-services describe ... --format='value(backends)'` first when you see a 503.
- `/api/` (bare) is **not** a route on the API (routes are `/api/auth`, `/api/admin`, ...), so path routing must be tested with a real endpoint like `/api/auth/debug-test`.
  A 404 on the bare path is correct behaviour, not a broken url map.

## Rollback

- App-level: redeploy the previous web revision (absolute API URL) and remove `COOKIE_SAMESITE`, which reverts it to `none`.
  The run.app URLs keep working independently of the LB.
- The LB and WAF can stay up regardless; traffic only reaches them through the domain's DNS.
