import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import os from "node:os";
import test from "node:test";

test("importing prisma module without DATABASE_URL fails fast", async () => {
  const prismaModuleUrl = new URL("../src/lib/prisma.js", import.meta.url).href;

  const result = await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        "--input-type=module",
        "--eval",
        `try { await import('${prismaModuleUrl}'); process.exit(1); } catch (err) { console.error(err?.message || err); process.exit(2); }`
      ],
      {
        cwd: os.tmpdir(),
        env: { PATH: process.env.PATH, DATABASE_URL: "" },
        stdio: ["ignore", "pipe", "pipe"]
      }
    );

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code, signal) => {
      resolve({ code, signal, stdout, stderr });
    });
  });

  assert.equal(result.signal, null);
  assert.equal(result.code, 2);
  assert.match(
    `${result.stdout}${result.stderr}`,
    /DATABASE_URL is required and must point to PostgreSQL/
  );
});
