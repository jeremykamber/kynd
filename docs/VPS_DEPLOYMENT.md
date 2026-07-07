# VPS Deployment Guide: DeepBound

## Architecture Overview

DeepBound uses a **dual-mode architecture** with two separate deployments:

| Component | Host | URL | Purpose |
|-----------|------|-----|---------|
| **Frontend + Server Actions** | Netlify | `https://deepbound.bringforthstudio.com` | UI, server actions, client-side logic |
| **Backend API + Playwright** | VPS | `http://154.38.180.173:8080` | `/api/vps/*` routes, browser automation |

```
Browser → Netlify (Next.js) → Server Actions → runRemote() → VPS API (port 8080)
                                                              ↓
                                                         Playwright (port 8081)
```

## How It Works

Server actions (`src/actions/*.ts`) check `shouldRunLocally()` which **always returns `false`** (hardcoded). This forces every server action to call `runRemote()`, which POSTs to `VPS_BACKEND_URL/api/vps/<endpoint>` with an `Authorization: Bearer <token>` header.

The VPS runs a Next.js standalone build that only serves `/api/vps/*` routes. A middleware (`src/middleware.ts`) guards all these routes:
1. Checks `IS_VPS=true` — if not set, returns 404 (prevents Netlify from exposing these routes)
2. Checks `Authorization` header against `VPS_AUTH_TOKEN` — if mismatch, returns 401

## Required Environment Variables

### Netlify (`deepbound.bringforthstudio.com`)

| Variable | Value | Purpose |
|----------|-------|---------|
| `IS_VPS` | `false` | Tells middleware this is Netlify (not the VPS) |
| `VPS_BACKEND_URL` | `http://154.38.180.173:8080` | Where to send remote API calls |
| `VPS_AUTH_TOKEN` | (shared secret) | Auth token sent in `Authorization` header |
| `PLAYWRIGHT_WS_ENDPOINT` | `ws://154.38.180.173:8081/playwright-ws` | Playwright browser server on VPS |
| `OPENROUTER_API_KEY` | (API key) | LLM provider key |
| `OPENAI_API_KEY` | (API key) | Fallback LLM provider key |

### VPS (`154.38.180.173`)

Set via `ecosystem.config.js` (not `.env` — the standalone build doesn't read `.env`):

| Variable | Value | Purpose |
|----------|-------|---------|
| `IS_VPS` | `true` | Tells middleware this IS the VPS |
| `VPS_AUTH_TOKEN` | (shared secret, matches Netlify) | Validates incoming requests |
| `VPS_BACKEND_URL` | `http://localhost:8080` | Self-referencing for internal calls |
| `PLAYWRIGHT_WS_ENDPOINT` | `ws://localhost:8081/playwright-ws` | Local browser server |
| `OPENROUTER_API_KEY` | (API key) | LLM provider key |
| `PORT` | `8080` | Next.js server port |
| `NODE_ENV` | `production` | Production mode |

## VPS Setup

### PM2 Processes

Two processes managed by `ecosystem.config.js`:

1. **`kynd-browser-server`** — Playwright browser server on port 8081
   - Script: `playwright-server.js` (root of project)
   - Launches `chromium.launchServer()` 

2. **`kynd-backend-engine`** — Next.js standalone server on port 8080
   - Script: `.next/standalone/server.js`
   - Handles all `/api/vps/*` requests

### Commands

```bash
# Start/Restart everything
npx pm2 start ecosystem.config.js

# View logs
npx pm2 logs kynd-backend-engine --lines 50

# Restart after build
npx pm2 restart ecosystem.config.js

# Stop
npx pm2 stop kynd-backend-engine
```

### Build & Deploy

```bash
# Pull latest
git pull origin main

# Build (produces .next/standalone/)
npm run build

# Restart
npx pm2 restart ecosystem.config.js
```

## Playwright Browser Server (`playwright-server.js`)

A standalone Node.js script that exposes a Playwright Chromium instance via WebSocket. This allows the Next.js server to connect to a persistent browser rather than launching one per request.

- **Port:** 8081
- **Endpoint:** `ws://localhost:8081/playwright-ws`
- **Heartbeat:** 30-second interval via WebSocket ping

## Auth Flow (Why "Unauthorized" Happens)

1. Netlify server action calls `runRemote()` → fetch to `VPS_BACKEND_URL/api/vps/...`
2. Request includes `Authorization: Bearer ${VPS_AUTH_TOKEN}` header
3. VPS middleware checks `authHeader !== Bearer ${process.env.VPS_AUTH_TOKEN}`
4. If mismatch → returns 401 `{"error":"Unauthorized"}`

**If you see "Unauthorized" on the Netlify site:**
- Verify `VPS_AUTH_TOKEN` is set on **both** Netlify and VPS — they must match
- Redeploy Netlify after changing env vars (they don't take effect until redeploy)
- The VPS `.env` file is NOT read by the standalone build — use `ecosystem.config.js` instead
- The build must be completed (`.next/standalone/server.js` must exist)

## Troubleshooting

### "Error: Cannot read properties of undefined (reading 'toLowerCase')"
Bug in the persona analysis validation step — the validation logic expects fields that optional personas might not have. This is a known issue.

### "browserContext.newPage: Browser closed"
The browser server process was killed. Caused by `RemotePlaywrightAdapter.close()` calling `this.browser.close()` on a WebSocket-connected browser. **Fixed** — now only page + context are cleaned up.

### "Headers Timeout Error"
OpenRouter API timeout. The LLM provider is slow or unreachable. Retry the request.

### PM2 process running old code
The standalone build must complete successfully. If `npm run build` is aborted, `.next/standalone/` won't exist but the old PM2 process may keep running from a deleted file (Linux keeps FDs alive). Always run `npm run build` to completion before restarting.
