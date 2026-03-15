import assert from "node:assert/strict";
import test, { after, beforeEach } from "node:test";

process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://test:test@127.0.0.1:5432/test?schema=public";
process.env.NODE_ENV = process.env.NODE_ENV || "test";

const { prisma } = await import("../src/lib/prisma.js");
const { otaPrismaStore } = await import("../src/data/ota-prisma-store.js");

const cleanOtaTables = async () => {
  await prisma.otaRoomMapping.deleteMany();
  await prisma.otaRoomType.deleteMany();
  await prisma.otaHotelMapping.deleteMany();
  await prisma.otaHotel.deleteMany();
};

beforeEach(async () => {
  await cleanOtaTables();
});

after(async () => {
  await cleanOtaTables();
  await prisma.$disconnect();
});

test("upsertHotelMapping persists shid and listHotelMappings returns it", async () => {
  await otaPrismaStore.upsertHotelMapping({
    platform: "feizhu",
    platformHotelId: "H1001",
    platformHotelName: "Hotel A",
    shid: "SHID-1001",
    internalChainId: "CHAIN-1",
    internalHotelName: "Internal Hotel A",
    enabled: true
  });

  const rows = await otaPrismaStore.listHotelMappings({ platform: "feizhu" });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].platform, "FEIZHU");
  assert.equal(rows[0].platformHotelId, "H1001");
  assert.equal(rows[0].shid, "SHID-1001");
});

test("upsertRoomMapping writes mapping publish fields and rawPayload strategy formula", async () => {
  await otaPrismaStore.upsertHotelMapping({
    platform: "feizhu",
    platformHotelId: "H2001",
    platformHotelName: "Hotel B",
    internalChainId: "CHAIN-2",
    internalHotelName: "Internal Hotel B",
    enabled: true
  });

  const mapping = await otaPrismaStore.upsertRoomMapping({
    platform: "feizhu",
    platformHotelId: "H2001",
    platformRoomTypeId: "R2001",
    platformRoomTypeName: "Deluxe",
    srid: "SRID-2001",
    internalRoomTypeId: "IR-2001",
    internalRoomTypeName: "Internal Deluxe",
    rateCode: "RATE_A",
    platformChannel: "direct",
    breakfastCount: 2,
    guaranteeType: 1,
    cancelPolicyCal: { type: "flex" },
    publishStatus: "published",
    lastPublishedAt: "2026-03-15T10:20:30.000Z",
    lastPublishError: "",
    formulaMultiplier: 1.3,
    formulaAddend: 88,
    enabled: true
  });

  assert.equal(mapping.srid, "SRID-2001");
  assert.equal(mapping.breakfastCount, 2);
  assert.equal(mapping.guaranteeType, 1);
  assert.deepEqual(mapping.cancelPolicyCal, { type: "flex" });
  assert.equal(mapping.publishStatus, "PUBLISHED");
  assert.equal(mapping.lastPublishedAt?.toISOString?.(), "2026-03-15T10:20:30.000Z");
  assert.equal(mapping.lastPublishError, null);
  assert.equal(mapping.formulaMultiplier, 1.3);
  assert.equal(mapping.formulaAddend, 88);

  const row = await prisma.otaRoomType.findUnique({
    where: {
      platform_platformHotelId_platformRoomTypeId: {
        platform: "FEIZHU",
        platformHotelId: "H2001",
        platformRoomTypeId: "R2001"
      }
    },
    select: {
      rawPayload: true
    }
  });

  assert.ok(row);
  assert.equal(typeof row.rawPayload, "object");
  assert.equal(row.rawPayload.strategyConfigs["DIRECT::RATE_A"].formulaMultiplier, 1.3);
  assert.equal(row.rawPayload.strategyConfigs["DIRECT::RATE_A"].formulaAddend, 88);
});

test("upsertRoomMapping ignores invalid lastPublishedAt on create", async () => {
  await otaPrismaStore.upsertHotelMapping({
    platform: "feizhu",
    platformHotelId: "H2002",
    platformHotelName: "Hotel Invalid Date",
    internalChainId: "CHAIN-2002",
    internalHotelName: "Internal Hotel Invalid Date",
    enabled: true
  });

  const mapping = await otaPrismaStore.upsertRoomMapping({
    platform: "feizhu",
    platformHotelId: "H2002",
    platformRoomTypeId: "R2002",
    platformRoomTypeName: "Standard",
    internalRoomTypeId: "IR-2002",
    internalRoomTypeName: "Internal Standard",
    rateCode: "RATE_INVALID_DATE",
    platformChannel: "DEFAULT",
    lastPublishedAt: "not-a-date",
    enabled: true
  });

  assert.equal(mapping.lastPublishedAt, null);
});

test("getProductCenterTree returns hotel-room-strategy tree from DB", async () => {
  await otaPrismaStore.upsertHotelMapping({
    platform: "feizhu",
    platformHotelId: "H2201",
    platformHotelName: "Hotel Tree",
    shid: "SHID-TREE",
    internalChainId: "CHAIN-TREE",
    internalHotelName: "Internal Hotel Tree",
    enabled: true
  });

  await otaPrismaStore.upsertRoomMapping({
    platform: "feizhu",
    platformHotelId: "H2201",
    platformRoomTypeId: "R2201",
    platformRoomTypeName: "Tree Deluxe",
    srid: "SRID-TREE",
    internalRoomTypeId: "IR-TREE",
    internalRoomTypeName: "Internal Tree Deluxe",
    rateCode: "TREE_RATE",
    platformChannel: "DEFAULT",
    formulaMultiplier: 1.1,
    formulaAddend: 33,
    enabled: true
  });

  const tree = await otaPrismaStore.getProductCenterTree({ platform: "feizhu" });
  assert.equal(tree.length, 1);
  assert.equal(tree[0].mapping.shid, "SHID-TREE");
  assert.equal(tree[0].rooms.length, 1);
  assert.equal(tree[0].rooms[0].strategies.length, 1);
  assert.equal(tree[0].rooms[0].strategies[0].srid, "SRID-TREE");
  assert.equal(tree[0].rooms[0].strategies[0].formulaMultiplier, 1.1);
  assert.equal(tree[0].rooms[0].strategies[0].formulaAddend, 33);
});

test("listRoomMappings reads legacy formula from OtaRoomType.rawPayload.strategyConfigs", async () => {
  const hotel = await prisma.otaHotel.create({
    data: {
      platform: "FEIZHU",
      platformHotelId: "H3001",
      hotelName: "Hotel C",
      city: null,
      status: "ONLINE",
      source: "SYNC",
      rawPayload: {},
      lastSyncedAt: null
    }
  });

  await prisma.otaRoomType.create({
    data: {
      platform: "FEIZHU",
      platformHotelId: "H3001",
      platformRoomTypeId: "R3001",
      roomTypeName: "Superior",
      bedType: null,
      outRid: "R3001",
      rateplanCode: "RATE_B",
      vendor: null,
      rawPayload: {
        strategyConfigs: {
          "DEFAULT::RATE_B": {
            formulaMultiplier: 1.5,
            formulaAddend: 66
          }
        }
      },
      hotelId: hotel.id
    }
  });

  await prisma.otaRoomMapping.create({
    data: {
      platform: "FEIZHU",
      platformHotelId: "H3001",
      platformRoomTypeId: "R3001",
      srid: null,
      platformRoomTypeName: "Superior",
      internalRoomTypeId: "IR-3001",
      internalRoomTypeName: "Internal Superior",
      rateCode: "RATE_B",
      rateCodeId: null,
      rpActivityId: null,
      breakfastCount: 0,
      guaranteeType: 0,
      cancelPolicyCal: null,
      publishStatus: "DRAFT",
      lastPublishedAt: null,
      lastPublishError: null,
      bookingTier: "NORMAL",
      platformChannel: "DEFAULT",
      orderSubmitMode: "MANUAL",
      autoOrderEnabled: true,
      autoSyncEnabled: true,
      manualTuningEnabled: false,
      autoSyncFutureDays: 30,
      enabled: true
    }
  });

  const rows = await otaPrismaStore.listRoomMappings({
    platform: "feizhu",
    platformHotelId: "H3001",
    platformRoomTypeId: "R3001",
    platformChannel: "default"
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].rateCode, "RATE_B");
  assert.equal(rows[0].formulaMultiplier, 1.5);
  assert.equal(rows[0].formulaAddend, 66);
});
