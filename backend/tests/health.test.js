import assert from "node:assert/strict";
import test from "node:test";
import request from "supertest";

process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://test:test@127.0.0.1:5432/test?schema=public";
process.env.NODE_ENV = process.env.NODE_ENV || "test";

test("GET /api/health returns service health payload", async () => {
  const { app } = await import("../src/app.js");

  const response = await request(app).get("/api/health");

  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.service, "skyhotel-agent-pro-backend");
  assert.equal(typeof response.body.time, "string");
  assert.equal(Number.isNaN(Date.parse(response.body.time)), false);
});
