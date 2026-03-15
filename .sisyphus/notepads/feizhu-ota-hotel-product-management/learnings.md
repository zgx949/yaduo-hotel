# Learnings

- Repo already has OTA stack and UI at `backend/src/routes/ota.routes.js`, `backend/src/services/ota-integration.service.js`, `backend/src/services/ota/taobao-top.adapter.js`, `backend/src/data/ota-prisma-store.js`, `backend/prisma/schema.prisma`, `views/OtaPlatform.tsx`.
- Existing `/api/ota/products/*` endpoints are closer to "import by outer_id" (fetch + persist) than "publish", so new product-center flow must be explicit about import vs publish.
- `OtaRoomMapping` already behaves like the strategy row (unique by platform/hotel/room/channel/rateCode). Formula is mirrored into `OtaRoomType.rawPayload.strategyConfigs`.
- `backend/src/lib/prisma.js` throws when `DATABASE_URL` missing; tests need a strategy for this.
- Docker compose currently lacks Postgres; tests should not depend on remote RDS.

- Added minimal Node built-in test harness in  (, ) with inline dummy  and  so health tests run without Postgres.
- Added  using  +  +  against exported  and .
- For missing  coverage in , spawned a separate Node process with  set to empty string; this prevents Prisma dotenv auto-load from overriding and reliably triggers the expected error path.

- Added minimal Node built-in test harness in backend/package.json (test, test:watch) with inline dummy DATABASE_URL and NODE_ENV=test so health tests run without Postgres.
- Added backend/tests/health.test.js using node:test + node:assert/strict + supertest against exported app and GET /api/health.
- For missing DATABASE_URL coverage in backend/src/lib/prisma.js, spawned a separate Node process with DATABASE_URL set to an empty string; this prevents Prisma dotenv auto-load from overriding and reliably triggers the expected error path.

- Extended `OtaHotelMapping` with optional `shid` to persist Fliggy standard hotel mapping without affecting existing rows.
- Extended `OtaRoomMapping` with optional `srid` plus publish management fields (`breakfastCount`, `guaranteeType`, `cancelPolicyCal`, `publishStatus`, `lastPublishedAt`, `lastPublishError`) so strategy rows can store Fliggy rateplan publish state.
- Used safe defaults (`breakfastCount=0`, `guaranteeType=0`, `publishStatus="DRAFT"`) and nullable fields for backward compatibility with existing data.

- Updated `backend/src/data/ota-prisma-store.js` so `upsertHotelMapping` now persists optional `shid` and only overwrites it when explicitly provided.
- Updated `upsertRoomMapping` to persist optional `srid` and publish fields while keeping formula dual-write behavior in `OtaRoomType.rawPayload.strategyConfigs` via existing `writeStrategyFormula`/`readStrategyFormula`.
- Added store-only DB aggregation `getProductCenterTree({ platform })` that composes hotel -> room -> strategy nodes from `OtaHotel`, `OtaRoomType`, `OtaHotelMapping`, and `OtaRoomMapping` without external API calls.
- Added deterministic integration tests in `backend/tests/ota-prisma-store.test.js` with OTA table cleanup in hooks; covers publish-field persistence + strategy dual-write, legacy formula fallback from raw payload, and tree aggregation output.
- In `upsertRoomMapping` create path, `lastPublishedAt` must use `toOptionalDate(payload.lastPublishedAt) ?? null` to avoid passing `Invalid Date` into Prisma when input is malformed.
- Added regression test: invalid `lastPublishedAt` on create no longer throws and persists as `null`.

- Added explicit product-center publish orchestration methods in `backend/src/services/ota-integration.service.js`: `validatePublishPayload`, `publishHotelProduct`, `publishRoomTypeProduct`, `publishRatePlanProduct`, and `saveStrategyAndAutoPublish`.
- Kept legacy import semantics unchanged: existing `upsertHotelProduct`, `upsertRoomTypeProduct`, and `upsertRatePlanProduct` still use adapter fetch methods and local persistence only (no remote publish).

- Added new admin-only product-center router at `backend/src/routes/ota-product-center.routes.js` with endpoints: `GET /tree`, `POST /import-atour` (501 stub), `POST /mappings/hotel-shid`, `POST /mappings/room-srid`, `POST /strategies/save-and-publish`, and `POST /publish/retry`.
- Mounted product-center routes in `backend/src/routes/index.js` at `apiRoutes.use("/ota/product-center", otaProductCenterRoutes)`, producing final paths under `/api/ota/product-center/*`.

- Added OTA publish safety gates in config/service: `OTA_PUBLISH_ENABLED` defaults to `false`, and `OTA_MOCK_ADAPTER_ENABLED` defaults to `true` only in `NODE_ENV=test` (otherwise `false`).
- When publish is disabled, product publish methods now throw `ValidationError` with `code="PUBLISH_DISABLED"` and status `400`, while `saveStrategyAndAutoPublish` still persists strategy locally as `DRAFT` and returns `{ publish: { code: "PUBLISH_DISABLED", disabled: true } }` without calling any adapter publish API.
- When publish is enabled and mock adapter is enabled, publish/import paths route through `fliggyMockAdapter` (no external network) and successful strategy auto-publish marks `publishStatus="PUBLISHED"`.

- Frontend menu/tab wiring for product center uses `feizhu-product-center` as stable tab id in both `components/Sidebar.tsx` and `App.tsx`, with menu selector `data-testid="menu-feizhu-product-center"`.
- Added a minimal page shell at `views/FeizhuProductCenter.tsx` and guarded USER access in `App.tsx` role deny logic.

- Atour place-search normalized payload provides `title/subTitle` (not `chainName`) in `items/hotels`, so frontend display must prefer `title` for human-readable hotel names and keep `chainId` as secondary line.
- Implemented backend `POST /api/ota/product-center/import-atour` by wiring `otaIntegrationService.importAtourHotel`: it imports hotel metadata immediately and best-effort fetches Atour room list into local OTA hotel/room tables; fetch failure no longer blocks local import.
- Improved `getProductCenterTree` name fallback logic to prefer mapping names (`platformHotelName/internalHotelName`, `platformRoomTypeName/internalRoomTypeName`) before IDs, reducing ID-only tree nodes.
