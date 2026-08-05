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

## Fourth root cause (CONFIRMED): replit.nix flutter/jdk/android packages bloat nix-0 layer
`replit.nix` had `pkgs.flutter` (9.3 GB nix store closure), `pkgs.jdk17` (141 MB), `pkgs.android-tools`. These are packaged into the nix-0 OCI layer. The layer push has a ~20-min timeout; 9.3+ GB cannot push in time → bundler retries entire push cycle in a loop.
Fix (commit `864ed91d0`): removed all three from replit.nix via `uninstallSystemDependencies`. nix-0 layer now contains only nodejs-20 + postgresql-16 (~200-300 MB).
**TO BUILD APK**: temporarily add `pkgs.flutter`, `pkgs.jdk17`, `pkgs.android-tools` back to replit.nix, build, then remove BEFORE publishing. See android-build-nix.md.

## Third root cause (CONFIRMED): workspace too large for Repl layer upload
Build logs showed: build succeeds → "Pushing pid1 binary layer..." → 20-min silence → fail.
Root cause: 57,795 files tracked in git including android-ndk (2GB), android-sdk-ws (352MB), .gradle-home (2.9GB), build/ (759MB). `git archive HEAD` = **5.9 GB**. Cloud Run bundler timed out pushing the Repl layer silently.
Fix (commit `<cleanup>`): `git rm -r --cached` all those dirs + add to `.gitignore`. New `git archive HEAD` = **2.89 MB**. 432 tracked files remain (actual source only).
**Rule: never commit Android SDKs, Gradle caches, or build output to git in this repo.**

## Second root cause: DATABASE_URL not passed to subprocess
pid1 creates the api-server subprocess with **only** the vars in `[services.production.run.env]` (PORT and NODE_ENV). DATABASE_URL and PG* vars are in the outer Cloud Run container env (injected by Replit's infra) but are **NOT** inherited by the subprocess. The old `lib/db/src/index.ts` threw at module load if DATABASE_URL was absent → crash before `listen()` → startup probe never gets 200 → 20-40 min timeout loop.

**Fix (commit c6904d9f)**: Removed the eager throw from `lib/db/src/index.ts`. Changed `new Pool({ connectionString: process.env.DATABASE_URL })` → `new Pool()` (no args). pg reads DATABASE_URL automatically, and also reads individual PG* vars (PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE) that Replit DOES inject into Cloud Run. Connection is lazy (first query), so server starts and health check passes regardless.

**Proven locally**: `DATABASE_URL="" PORT=4001 NODE_ENV=production node artifacts/api-server/dist/index.mjs` → starts successfully, listens, health check 200. Previously this crashed immediately with exit code 1.
