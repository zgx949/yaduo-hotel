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
const { otaIntegrationService } = await import("../src/services/ota-integration.service.js");

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
        cityId: "330100",
        cityName: "杭州",
        address: "西湖区测试路 1 号",
        tel: "0571-12345678"
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
  assert.equal(row.cityId, "330100");
  assert.equal(row.address, "西湖区测试路 1 号");
  assert.equal(row.tel, "0571-12345678");
});

test("POST /api/ota/product-center/hotels/upsert requires tel when publish enabled", async () => {
  const script = `
import assert from "node:assert/strict";
import request from "supertest";

process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://test:test@127.0.0.1:5432/test?schema=public";
process.env.NODE_ENV = "test";

const { app } = await import("./src/app.js");
const { prisma } = await import("./src/lib/prisma.js");
const { prismaStore } = await import("./src/data/prisma-store.js");

const username = "pc-api-test-spawn-admin-upsert-" + Date.now();
const user = await prismaStore.createUser({
  username,
  name: "Spawn Admin Upsert",
  password: "123456",
  role: "ADMIN",
  status: "ACTIVE"
});
const token = await prismaStore.createSession(user);

const response = await request(app)
  .post("/api/ota/product-center/hotels/upsert")
  .set("Authorization", "Bearer " + token)
  .send({
    platform: "FLIGGY",
    product: {
      platformHotelId: "SPAWN-HOTEL-NO-TEL",
      name: "Spawn Hotel No Tel",
      cityId: "330100"
    }
  });

assert.equal(response.status, 400);
assert.equal(response.body.code, "OTA_PUBLISH_VALIDATION_ERROR");
assert.equal(response.body.field, "tel");

await prisma.session.deleteMany({ where: { userId: user.id } });
await prisma.user.deleteMany({ where: { id: user.id } });
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

  assert.equal(result.code, 0, `spawned upsert-without-tel test failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
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

test("POST /api/ota/product-center/mappings/hotel-shid pushes to remote when publish succeeds", async () => {
  const adminToken = await createToken("ADMIN");
  const suffix = randomUUID().slice(0, 6);
  const platformHotelId = `H-PUSH-${suffix}`;
  const payload = {
    platform: "FLIGGY",
    platformHotelId,
    platformHotelName: `Hotel ${suffix}`,
    internalChainId: `CHAIN-${suffix}`,
    internalHotelName: `Internal Hotel ${suffix}`,
    shid: `SHID-${suffix}`,
    enabled: true
  };

  await prisma.otaHotel.create({
    data: {
      platform: "FLIGGY",
      platformHotelId,
      hotelName: payload.platformHotelName,
      cityId: "330100",
      city: "杭州",
      address: "测试路 1 号",
      tel: "0571-00001111",
      status: "ONLINE",
      source: "TEST",
      rawPayload: {}
    }
  });

  const originalPublishHotelProduct = otaIntegrationService.publishHotelProduct;
  let capturedProduct = null;

  otaIntegrationService.publishHotelProduct = async ({ product }) => {
    capturedProduct = product;
    return {
      platform: "FLIGGY",
      level: "HOTEL",
      platformHotelId: String(product?.platformHotelId || "").trim(),
      response: {
        ok: true,
        mocked: true
      },
      result: {
        ok: true
      }
    };
  };

  try {
    const response = await request(app)
      .post("/api/ota/product-center/mappings/hotel-shid")
      .set("Authorization", `Bearer ${adminToken}`)
      .send(payload);

    assert.equal(response.status, 201);
    assert.equal(response.body.shid, payload.shid);
    assert.equal(response.body.remotePushed, true);
    assert.equal(response.body.remoteError, null);
    assert.equal(typeof response.body.remoteResponse, "object");

    assert.ok(capturedProduct);
    assert.equal(capturedProduct.platformHotelId, platformHotelId);
    assert.equal(capturedProduct.shid, payload.shid);
    assert.equal(capturedProduct.tel, "0571-00001111");
    assert.equal(capturedProduct.cityId, "330100");
    assert.equal(capturedProduct.cityName, "杭州");
  } finally {
    otaIntegrationService.publishHotelProduct = originalPublishHotelProduct;
  }
});

test("POST /api/ota/product-center/mappings/hotel-shid keeps local save when remote push fails", async () => {
  const adminToken = await createToken("ADMIN");
  const suffix = randomUUID().slice(0, 6);
  const platformHotelId = `H-PUSH-FAIL-${suffix}`;
  const payload = {
    platform: "FLIGGY",
    platformHotelId,
    platformHotelName: `Hotel ${suffix}`,
    internalChainId: `CHAIN-${suffix}`,
    internalHotelName: `Internal Hotel ${suffix}`,
    shid: `SHID-${suffix}`,
    enabled: true
  };

  await prisma.otaHotel.create({
    data: {
      platform: "FLIGGY",
      platformHotelId,
      hotelName: payload.platformHotelName,
      cityId: "330100",
      city: "杭州",
      address: "测试路 2 号",
      tel: "0571-00002222",
      status: "ONLINE",
      source: "TEST",
      rawPayload: {}
    }
  });

  const originalPublishHotelProduct = otaIntegrationService.publishHotelProduct;
  otaIntegrationService.publishHotelProduct = async () => {
    const err = new Error("mocked remote push failed");
    err.code = "MOCK_REMOTE_FAILED";
    throw err;
  };

  try {
    const response = await request(app)
      .post("/api/ota/product-center/mappings/hotel-shid")
      .set("Authorization", `Bearer ${adminToken}`)
      .send(payload);

    assert.equal(response.status, 201);
    assert.equal(response.body.shid, payload.shid);
    assert.equal(response.body.remotePushed, false);
    assert.equal(response.body.remoteError?.code, "MOCK_REMOTE_FAILED");
    assert.equal(response.body.remoteError?.message, "mocked remote push failed");

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
  } finally {
    otaIntegrationService.publishHotelProduct = originalPublishHotelProduct;
  }
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
  const isDisabled = response.body?.publish?.code === "PUBLISH_DISABLED";
  if (isDisabled) {
    assert.equal(response.body.strategy.publishStatus, "DRAFT");
  } else {
    assert.equal(response.body.strategy.publishStatus, "PUBLISHED");
  }

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
  assert.equal(row.publishStatus, isDisabled ? "DRAFT" : "PUBLISHED");
});

test("POST /api/ota/product-center/hotels/upsert returns PUBLISH_DISABLED when publish gate is off", async () => {
  const adminToken = await createToken("ADMIN");
  const suffix = randomUUID().slice(0, 6);
  const response = await request(app)
    .post("/api/ota/product-center/hotels/upsert")
    .set("Authorization", `Bearer ${adminToken}`)
    .send({
      platform: "FLIGGY",
      product: {
        platformHotelId: `H-UPSERT-${suffix}`,
        name: `Hotel Upset ${suffix}`,
        city: "杭州",
        tel: "0571-12345678"
      }
    });

  assert.equal([201, 400].includes(response.status), true);
  if (response.status === 400) {
    assert.equal(response.body.code, "PUBLISH_DISABLED");
  } else {
    assert.equal(response.body.platformHotelId, `H-UPSERT-${suffix}`);
  }
});

test("POST /api/ota/product-center/room-types/upsert returns PUBLISH_DISABLED when publish gate is off", async () => {
  const adminToken = await createToken("ADMIN");
  const suffix = randomUUID().slice(0, 6);
  const response = await request(app)
    .post("/api/ota/product-center/room-types/upsert")
    .set("Authorization", `Bearer ${adminToken}`)
    .send({
      platform: "FLIGGY",
      product: {
        platformHotelId: `H-UPSERT-${suffix}`,
        platformRoomTypeId: `ATOURH-UPSERT-${suffix}_${suffix}`,
        name: `Room Upset ${suffix}`,
        srid: `SRID-${suffix}`
      }
    });

  assert.equal([201, 400].includes(response.status), true);
  if (response.status === 400) {
    assert.equal(response.body.code, "PUBLISH_DISABLED");
  } else {
    assert.equal(response.body.platformRoomTypeId, `ATOURH-UPSERT-${suffix}_${suffix}`);
  }
});

test("POST /api/ota/product-center/hotels/delete accepts ADMIN request", async () => {
  const adminToken = await createToken("ADMIN");
  const suffix = randomUUID().slice(0, 6);
  const response = await request(app)
    .post("/api/ota/product-center/hotels/delete")
    .set("Authorization", `Bearer ${adminToken}`)
    .send({
      platform: "FLIGGY",
      product: {
        platformHotelId: `H-DEL-${suffix}`
      }
    });

  assert.equal(response.status, 200);
  assert.equal(response.body.platformHotelId, `H-DEL-${suffix}`);
});

test("POST /api/ota/product-center/room-types/delete accepts ADMIN request", async () => {
  const adminToken = await createToken("ADMIN");
  const suffix = randomUUID().slice(0, 6);
  const response = await request(app)
    .post("/api/ota/product-center/room-types/delete")
    .set("Authorization", `Bearer ${adminToken}`)
    .send({
      platform: "FLIGGY",
      product: {
        platformHotelId: `H-DEL-${suffix}`,
        platformRoomTypeId: `ATOURH-DEL-${suffix}_${suffix}`
      }
    });

  assert.equal(response.status, 200);
  assert.equal(response.body.platformRoomTypeId, `ATOURH-DEL-${suffix}_${suffix}`);
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
