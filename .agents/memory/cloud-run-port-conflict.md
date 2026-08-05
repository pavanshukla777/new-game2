---
name: Cloud Run port conflict in multi-artifact Replit deployments
description: pid1 (Replit's routing binary) binds to Cloud Run's injected PORT=8080; api-server must use a different internal port or publish hangs for 20 minutes.
---

# Cloud Run PORT conflict — multi-artifact deployments

## The rule
In a Replit multi-artifact (web + api) autoscale deployment, **do not use PORT=8080 for any api-server service**. Replit's `pid1` routing binary claims PORT=8080 (the port Cloud Run injects). If the api-server also tries to bind to 8080, `EADDRINUSE` → crash loop → startup probe times out for ~20 minutes per attempt → publish fails with no useful error message.

## Why
Cloud Run always injects `PORT=8080` into the container. Replit's `pid1` binary is the container entrypoint; it reads that PORT and binds to it externally. `pid1` then starts each service subprocess with the port from `localPort` in `artifact.toml`. If `localPort` == 8080 == Cloud Run's PORT, both try to bind to 8080.

## How to apply
- Set `localPort` to any non-8080 port (e.g. **3001**) in the api-server's `[[services]]` block in `artifact.toml`.
- Set the matching `PORT = "3001"` in `[services.production.run.env]`.
- `pid1` will forward `/api/*` to `localhost:3001`; Cloud Run traffic hits pid1 on 8080.
- Port landscape for this project: 8080=Cloud Run/pid1, 3001=api-server, 8081=mockup-sandbox, 22333=web.

## Symptoms
- Build phase succeeds (both api-server and web build cleanly).
- Promote step hangs silently for 15–20 minutes.
- `listDeploymentBuilds` shows provider=`cloud_run`, status=`failed`.
- Build logs end with "Created pid1 binary layer" then silence (no startup error logged — the api-server crash is invisible from build logs).
- Retries repeat the same 15-20 min timeout pattern before final failure.

## Verified fix
Commit `8a48b6f8`: changed `localPort` from 8080 → 3001 and `PORT` from `"8080"` → `"3001"` in `artifacts/api-server/.replit-artifact/artifact.toml`. Health check `GET /api/healthz/healthz` returns 200 on port 3001 in dev. Ready to republish.
