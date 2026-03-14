# Fliggy OTA Integration Guide (Hotel Product + Price/Inventory + Orders)

## Background change

Current OTA operation no longer relies on directly syncing all products from Fliggy first.
The recommended flow is:

1. Maintain hotel and room-type products in this platform.
2. Publish or update product entities to Fliggy with product APIs.
3. Bind local channels and room mappings.
4. Query and push price/inventory.
5. Pull inbound orders and push order confirmations.

## Official docs scope you need

- Hotel product APIs: `https://open.alitrip.com/docs/api_list.htm?cid=20752`
- Hotel online booking APIs: `https://open.alitrip.com/docs/api_list.htm?cid=20753`

## Required Fliggy APIs by capability

### 1) Product publish / update / delete

- `taobao.xhotel.add`
- `taobao.xhotel.update`
- `taobao.xhotel.delete`
- `taobao.xhotel.roomtype.add`
- `taobao.xhotel.roomtype.update`
- `taobao.xhotel.roomtype.delete.public`
- `taobao.xhotel.rateplan.add`
- `taobao.xhotel.rateplan.update`
- `taobao.xhotel.rateplan.delete`
- `taobao.xhotel.rate.delete`

### 2) Price and inventory query / update

- Query:
  - `taobao.xhotel.rate.get`
- Update (already used in this repo):
  - `taobao.xhotel.rate.update`
- Optional higher-throughput extensions:
  - `taobao.xhotel.rates.update`
  - `taobao.xhotel.rates.increment`
  - `taobao.xhotel.rooms.update`
  - `taobao.xhotel.rooms.increment`
  - `taobao.xhotel.quota.update`

### 3) Order pull / push

- Pull:
  - `taobao.xhotel.order.search`
  - `taobao.xhotel.order.future.info.get` (optional for incremental change polling)
- Push / acknowledge:
  - `taobao.xhotel.order.update`
  - `taobao.xhotel.order.update.confirmcode`

## Existing implementation in this repo

- Adapter:
  - `backend/src/services/ota/taobao-top.adapter.js`
- Integration service:
  - `backend/src/services/ota-integration.service.js`
- Routes:
  - `backend/src/routes/ota.routes.js`
- Persistence:
  - `backend/src/data/ota-prisma-store.js`
  - `backend/prisma/schema.prisma`

## New internal endpoints for product maintenance

These endpoints are for the new operation model where products are maintained on this platform first.

- `POST /api/ota/products/hotels`
  - Publish/update hotel product to Fliggy
- `DELETE /api/ota/products/hotels/:platformHotelId`
  - Delete hotel product on Fliggy
- `POST /api/ota/products/room-types`
  - Publish/update room type product
- `DELETE /api/ota/products/room-types/:platformRoomTypeId`
  - Delete room type product
  - Requires `platformHotelId` in body or query
- `POST /api/ota/products/rateplans`
  - Publish/update rateplan product
- `DELETE /api/ota/products/rateplans`
  - Delete rateplan product
- `DELETE /api/ota/products/rates`
  - Delete rate product

## Existing endpoints you will keep using

- Channel and product bindings:
  - `POST /api/ota/mappings/hotels`
  - `POST /api/ota/mappings/rooms`
  - `POST /api/ota/mappings/channels`
- Price/inventory:
  - `GET /api/ota/calendar`
  - `POST /api/ota/calendar`
  - `POST /api/ota/push/rate-inventory`
- Orders:
  - `POST /api/ota/orders/pull`
  - `POST /api/ota/webhooks/:platform/orders`
  - `POST /api/ota/orders/:externalOrderId/template`
  - `POST /api/ota/orders/:externalOrderId/auto-submit`
  - `POST /api/ota/orders/:externalOrderId/manual-payment-confirm`

## Minimal operational sequence

1. Create/update hotel product (`/api/ota/products/hotels`).
2. Create/update room-type product (`/api/ota/products/room-types`).
3. Create/update rateplan (`/api/ota/products/rateplans`).
4. Bind hotel/room/channel to local model (`/api/ota/mappings/*`).
5. Set local calendar price/inventory (`/api/ota/calendar`).
6. Push price/inventory to Fliggy (`/api/ota/push/rate-inventory`).
7. Pull and process orders (`/api/ota/orders/pull`) or receive webhook.
8. Confirm and push order confirmation code back to Fliggy.

## Auth and signature notes (TOP)

- TOP gateway: `https://eco.taobao.com/router/rest`
- Required env vars:
  - `OTA_TOP_APP_KEY`
  - `OTA_TOP_APP_SECRET`
  - `OTA_TOP_ASSESS_TOKEN` (or `OTA_TOP_SESSION`)
  - `OTA_TOP_VENDOR` (if your vendor scope requires it)
- Webhook signature:
  - Header: `x-ota-signature`
  - Secret: `OTA_WEBHOOK_SECRET`

## Caveat

Fliggy APIs have field differences between legacy and newer docs (for example `hid`/`outer_id`, `out_rid`/`room_type_id`).
This implementation intentionally accepts multiple aliases and normalizes them in the adapter.
