# RideSync

RideSync is a mobile-first Progressive Web App for coordinating group motorcycle rides with real-time location sharing, waypoint collaboration, and low-latency Socket.io updates.

## Interview Prep Guide

- Full architecture, feature breakdown, deployment journey, and interview Q and A:
   - [docs/details.md](docs/details.md)

## Stack

- Frontend: React, TypeScript, Vite, Redux Toolkit, Socket.io client, MapLibre, PWA
- Backend: Node.js, TypeScript, Express, Socket.io
- Shared contracts: Typed event payloads in `packages/shared`
- Local infra: MongoDB + Redis via Docker Compose (free local stack)

## Monorepo Layout

- `apps/web`: PWA client
- `apps/server`: API + realtime server
- `packages/shared`: shared event contracts and schemas
- `docker-compose.yml`: local MongoDB and Redis

## Quick Start

1. Install dependencies:
   - `npm install`
2. Copy env files:
   - `copy apps\server\.env.example apps\server\.env`
   - `copy apps\web\.env.example apps\web\.env`
3. (Optional) Start local data services:
   - `docker compose up -d`
4. Start app stack:
   - `npm run dev`
5. Open the app:
   - `http://localhost:5173`

## Scripts

- `npm run dev`: run web and server concurrently
- `npm run build`: typecheck all packages + build web
- `npm run lint`: workspace lint/typecheck
- `npm run test`: run workspace tests

## Current Feature Baseline

- Create and join ride sessions
- Realtime rider join/leave updates
- Realtime location broadcast with adaptive telemetry throttling
- Waypoint add/remove with realtime sync
- Persistent local telemetry queue (IndexedDB via localforage)
- Server-side persistence mode switch (`memory` or `mongo`) for ride state
- Socket adapter mode switch (`memory` or `redis`) for horizontal scaling
- Invite-token-protected ride access links and join flow
- Organizer invite-link rotation to revoke old links instantly
- Organizer-only host token controls for privileged actions
- Organizer ride close flow with realtime lockout for all connected riders
- Privacy Policy, Terms of Use, and local data deletion pages
- Installable PWA manifest

## GPS Tracking Status

- Implemented: browser Geolocation API + adaptive sampling is active.
- HTTPS requirement: production GPS requires HTTPS (HTTP uses demo telemetry fallback by design).
- iOS limitation: background tracking is restricted by iOS/PWA platform behavior.

## Mobile-First Notes

- UI is designed for phone screens first and scales up to desktop.
- PWA tracking works reliably while app is active in foreground.
- Full always-on background tracking is limited on iOS PWAs.

## Cloud Readiness Note

- The current setup is fully local by default (no external cloud account required).
- For cloud persistence/scaling, you must provide your own managed MongoDB/Redis services and credentials.

## Deployment For Customer Beta

Render blueprint is included at `render.yaml`.

### Required external actions (you must do these)

1. Create a Render account and connect this repository.
2. Create managed MongoDB and Redis services (Render or external providers) and collect connection URIs.
3. Deploy using `render.yaml`.
4. Set environment variables:
   - Server: `CLIENT_ORIGIN`, `MONGODB_URI`, `REDIS_URL`
   - Web: `VITE_API_BASE_URL`, `VITE_SOCKET_URL`
5. Ensure `CLIENT_ORIGIN` exactly matches the deployed web URL.
6. Confirm both web and server are on HTTPS endpoints before customer GPS testing.

### Post-deploy smoke checks

1. `GET /api/health` returns 200 on server URL.
2. Create ride -> join from second device -> verify realtime markers update.
3. Rotate invite link -> old link must fail.
4. Close ride -> both clients show closed state and controls disabled.
