# RideSync Server

Express + Socket.io backend for realtime ride coordination.

## Commands

- `npm run dev -w @ridesync/server`
- `npm run test -w @ridesync/server`
- `npm run start -w @ridesync/server`

## Environment

Copy `.env.example` to `.env`.

- `PORT`: server port
- `CLIENT_ORIGIN`: allowed frontend origin
- `NODE_ENV`: development/test/production
- `STORE_DRIVER`: `memory` or `mongo`
- `MONGODB_URI`: MongoDB connection URI (used when `STORE_DRIVER=mongo`)
- `MONGODB_DB`: MongoDB database name
- `SOCKET_ADAPTER`: `memory` or `redis`
- `REDIS_URL`: Redis connection URI (used when `SOCKET_ADAPTER=redis`)

## Persistence Modes

- `memory`: fastest startup, data resets on server restart.
- `mongo`: ride sessions persist across restarts using MongoDB.

## Socket Adapter Modes

- `memory`: default single-node Socket.io adapter.
- `redis`: enables multi-node Socket.io pub/sub via Redis.

## Invite Access Control

- `POST /api/rides` returns both `inviteToken` and `organizerToken`.
- `GET /api/rides/:rideId/snapshot` requires `?invite=<token>`.
- `POST /api/rides/:rideId/invite/rotate` rotates invite token and invalidates prior links (requires `organizerToken`).
- `POST /api/rides/:rideId/close` closes the ride (requires `organizerToken`).
- Socket `ride:join` requires `inviteToken` and rejects invalid tokens.
- Socket `ride:close` requires `organizerToken` and broadcasts closed state to the ride room.
- Telemetry and waypoint socket actions are accepted only for authenticated ride membership.
