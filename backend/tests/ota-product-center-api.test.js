import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import test, { after, beforeEach } from "node:test";
import request from "supertest";

process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://test:test@127.0.0.1:5432/test?schema=public";
process.env.NODE_ENV = process.env.NODE_ENV || "test";

const { app } = await import("../src/app.js");
const { prisma } = await import("../src/lib/prisma.js");
const { prismaStore } = await import("../src/data/prisma-store.js");

const TEST_USER_PREFIX = "pc-api-test";

const cleanOtaTables = async () => {
  await prisma.otaCalendarItem.deleteMany();
  await prisma.otaOrderBinding.deleteMany();
  await prisma.otaInboundOrder.deleteMany();
  await prisma.otaRoomMapping.deleteMany();
  await prisma.otaRoomType.deleteMany();
  await prisma.otaHotelMapping.deleteMany();
  await prisma.otaChannelMapping.deleteMany();
  await prisma.otaHotel.deleteMany();
  await prisma.otaSyncLog.deleteMany();
};

const cleanUsers = async () => {
  await prisma.session.deleteMany({
    where: {
      user: {
        username: {
          startsWith: TEST_USER_PREFIX
        }
      }
    }
  });
  await prisma.user.deleteMany({
    where: {
      username: {
        startsWith: TEST_USER_PREFIX
      }
    }
  });
};

const createToken = async (role) => {
  const user = await prismaStore.createUser({
    username: `${TEST_USER_PREFIX}-${role.toLowerCase()}-${randomUUID().slice(0, 8)}`,
    name: `Test ${role}`,
    password: "123456",
    role,
    status: "ACTIVE"
  });
  const token = await prismaStore.createSession(user);
  return token;
};

const strategyPayload = (suffix = randomUUID().slice(0, 6)) => ({
  platform: "FLIGGY",
  strategy: {
    platform: "FLIGGY",
    platformHotelId: `HOTEL-${suffix}`,
    platformRoomTypeId: `ROOM-${suffix}`,
    platformRoomTypeName: `Room ${suffix}`,
    internalRoomTypeId: `INTERNAL-ROOM-${suffix}`,
    internalRoomTypeName: `Internal Room ${suffix}`,
    rateCode: `RATE-${suffix}`,
    platformChannel: "DEFAULT",
    srid: `SRID-${suffix}`,
    formulaMultiplier: 1.2,
    formulaAddend: 30,
    enabled: true
  },
  publishProduct: {
    platformHotelId: `HOTEL-${suffix}`,
    platformRoomTypeId: `ROOM-${suffix}`,
    rateplanCode: `RATE-${suffix}`
  }
});

const runNodeScript = ({ script, env }) => {
  return new Promise((resolve, reject) => {
    const child = spawn("node", ["--input-type=module", "-e", script], {
      env: {
        ...process.env,
        ...env
      },
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ code, stdout, stderr });
    });
  });
};

beforeEach(async () => {
  await cleanOtaTables();
  await cleanUsers();
});

after(async () => {
  await cleanOtaTables();
  await cleanUsers();
  await prisma.$disconnect();
});

test("GET /api/ota/product-center/tree returns 401 without bearer token", async () => {
  const response = await request(app).get("/api/ota/product-center/tree");
  assert.equal(response.status, 401);
  assert.equal(response.body.message, "Missing bearer token");
});

test("POST /api/ota/product-center/strategies/save-and-publish returns 403 for USER role", async () => {
  const userToken = await createToken("USER");
  const response = await request(app)
    .post("/api/ota/product-center/strategies/save-and-publish")
    .set("Authorization", `Bearer ${userToken}`)
    .send(strategyPayload("FORBID"));

  assert.equal(response.status, 403);
  assert.equal(response.body.message, "Forbidden");
});

test("GET /api/ota/product-center/tree returns items array for ADMIN", async () => {
  const adminToken = await createToken("ADMIN");
  const response = await request(app)
    .get("/api/ota/product-center/tree")
    .set("Authorization", `Bearer ${adminToken}`);

  assert.equal(response.status, 200);
  assert.equal(Array.isArray(response.body.items), true);
});

test("POST /api/ota/product-center/import-atour imports hotel into local OTA store for ADMIN", async () => {
  const adminToken = await createToken("ADMIN");
  const suffix = randomUUID().slice(0, 6);
  const chainId = `ATOUR-${suffix}`;
  const response = await request(app)
    .post("/api/ota/product-center/import-atour")
    .set("Authorization", `Bearer ${adminToken}`)
    .send({
      platform: "FLIGGY",
      atour: {
        chainId,
        title: `亚朵测试酒店-${suffix}`,
        cityName: "杭州"
      }
    });

  assert.equal(response.status, 201);
  assert.equal(response.body.platformHotelId, chainId);
  assert.equal(response.body.hotelName, `亚朵测试酒店-${suffix}`);
  if (Array.isArray(response.body.rooms) && response.body.rooms.length > 0) {
    for (const room of response.body.rooms) {
      assert.equal(String(room.platformRoomTypeId || "").startsWith(`ATOUR${chainId}_`), true);
    }
  }

  const row = await prisma.otaHotel.findUnique({
    where: {
      platform_platformHotelId: {
        platform: "FLIGGY",
        platformHotelId: chainId
      }
    }
  });

  assert.ok(row);
  assert.equal(row.hotelName, `亚朵测试酒店-${suffix}`);
});

test("POST /api/ota/product-center/mappings/hotel-shid writes and returns shid", async () => {
  const adminToken = await createToken("ADMIN");
  const suffix = randomUUID().slice(0, 6);
  const payload = {
    platform: "FLIGGY",
    platformHotelId: `H-${suffix}`,
    platformHotelName: `Hotel ${suffix}`,
    internalChainId: `CHAIN-${suffix}`,
    internalHotelName: `Internal Hotel ${suffix}`,
    shid: `SHID-${suffix}`,
    enabled: true
  };

  const response = await request(app)
    .post("/api/ota/product-center/mappings/hotel-shid")
    .set("Authorization", `Bearer ${adminToken}`)
    .send(payload);

  assert.equal(response.status, 201);
  assert.equal(response.body.shid, payload.shid);

  const row = await prisma.otaHotelMapping.findUnique({
    where: {
      platform_platformHotelId: {
        platform: payload.platform,
        platformHotelId: payload.platformHotelId
      }
    }
  });
  assert.ok(row);
  assert.equal(row.shid, payload.shid);
});

test("POST /api/ota/product-center/mappings/room-srid writes and returns srid", async () => {
  const adminToken = await createToken("ADMIN");
  const suffix = randomUUID().slice(0, 6);
  const payload = {
    platform: "FLIGGY",
    platformHotelId: `H-${suffix}`,
    platformRoomTypeId: `R-${suffix}`,
    platformRoomTypeName: `Room ${suffix}`,
    internalRoomTypeId: `IR-${suffix}`,
    internalRoomTypeName: `Internal Room ${suffix}`,
    rateCode: `RATE-${suffix}`,
    platformChannel: "DEFAULT",
    srid: `SRID-${suffix}`,
    enabled: true
  };

  const response = await request(app)
    .post("/api/ota/product-center/mappings/room-srid")
    .set("Authorization", `Bearer ${adminToken}`)
    .send(payload);

  assert.equal(response.status, 201);
  assert.equal(response.body.srid, payload.srid);

  const row = await prisma.otaRoomMapping.findFirst({
    where: {
      platform: payload.platform,
      platformHotelId: payload.platformHotelId,
      platformRoomTypeId: payload.platformRoomTypeId,
      platformChannel: payload.platformChannel,
      rateCode: payload.rateCode
    }
  });
  assert.ok(row);
  assert.equal(row.srid, payload.srid);
});

test("POST /api/ota/product-center/strategies/save-and-publish returns draft when publish disabled", async () => {
  const adminToken = await createToken("ADMIN");
  const payload = strategyPayload();
  const response = await request(app)
    .post("/api/ota/product-center/strategies/save-and-publish")
    .set("Authorization", `Bearer ${adminToken}`)
    .send(payload);

  assert.equal(response.status, 201);
  assert.deepEqual(response.body.publish, { code: "PUBLISH_DISABLED", disabled: true });
  assert.equal(response.body.strategy.publishStatus, "DRAFT");

  const row = await prisma.otaRoomMapping.findFirst({
    where: {
      platform: payload.strategy.platform,
      platformHotelId: payload.strategy.platformHotelId,
      platformRoomTypeId: payload.strategy.platformRoomTypeId,
      platformChannel: payload.strategy.platformChannel,
      rateCode: payload.strategy.rateCode
    }
  });
  assert.ok(row);
  assert.equal(row.publishStatus, "DRAFT");
});

test("POST /api/ota/product-center/strategies/save-and-publish sets PUBLISHED with publish enabled in separate process", async () => {
  const script = `
import assert from "node:assert/strict";
import request from "supertest";

process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://test:test@127.0.0.1:5432/test?schema=public";
process.env.NODE_ENV = "test";

const { app } = await import("./src/app.js");
const { prisma } = await import("./src/lib/prisma.js");
const { prismaStore } = await import("./src/data/prisma-store.js");

const username = "pc-api-test-spawn-admin-" + Date.now();
const user = await prismaStore.createUser({
  username,
  name: "Spawn Admin",
  password: "123456",
  role: "ADMIN",
  status: "ACTIVE"
});
const token = await prismaStore.createSession(user);

const response = await request(app)
  .post("/api/ota/product-center/strategies/save-and-publish")
  .set("Authorization", "Bearer " + token)
  .send({
    platform: "FLIGGY",
    strategy: {
      platform: "FLIGGY",
      platformHotelId: "SPAWN-HOTEL",
      platformRoomTypeId: "SPAWN-ROOM",
      platformRoomTypeName: "Spawn Room",
      internalRoomTypeId: "SPAWN-IR",
      internalRoomTypeName: "Spawn Internal Room",
      rateCode: "SPAWN-RATE",
      platformChannel: "DEFAULT",
      srid: "SPAWN-SRID"
    },
    publishProduct: {
      platformHotelId: "SPAWN-HOTEL",
      platformRoomTypeId: "SPAWN-ROOM",
      rateplanCode: "SPAWN-RATE"
    }
  });

assert.equal(response.status, 201);
assert.equal(response.body.strategy.publishStatus, "PUBLISHED");

const row = await prisma.otaRoomMapping.findFirst({
  where: {
    platform: "FLIGGY",
    platformHotelId: "SPAWN-HOTEL",
    platformRoomTypeId: "SPAWN-ROOM",
    platformChannel: "DEFAULT",
    rateCode: "SPAWN-RATE"
  }
});
assert.ok(row);
assert.equal(row.publishStatus, "PUBLISHED");

await prisma.session.deleteMany({ where: { userId: user.id } });
await prisma.user.deleteMany({ where: { id: user.id } });
await prisma.otaRoomMapping.deleteMany({ where: { platformHotelId: "SPAWN-HOTEL", platformRoomTypeId: "SPAWN-ROOM" } });
await prisma.otaRoomType.deleteMany({ where: { platformHotelId: "SPAWN-HOTEL", platformRoomTypeId: "SPAWN-ROOM" } });
await prisma.otaHotel.deleteMany({ where: { platformHotelId: "SPAWN-HOTEL" } });
await prisma.otaSyncLog.deleteMany({ where: { platform: "FLIGGY" } });
await prisma.$disconnect();
`;

  const result = await runNodeScript({
    script,
    env: {
      DATABASE_URL: process.env.DATABASE_URL,
      NODE_ENV: "test",
      OTA_MOCK_ADAPTER_ENABLED: "true",
      OTA_PUBLISH_ENABLED: "true"
    }
  });

  assert.equal(result.code, 0, `spawned publish-enabled test failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
});
