PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_ProxyNode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "configId" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "port" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "authEnabled" BOOLEAN NOT NULL DEFAULT false,
    "authUsername" TEXT NOT NULL DEFAULT '',
    "authPassword" TEXT NOT NULL DEFAULT '',
    "lastChecked" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "location" TEXT NOT NULL,
    "failCount" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "ProxyNode_configId_fkey" FOREIGN KEY ("configId") REFERENCES "SystemConfig" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "new_ProxyNode" (
    "id",
    "configId",
    "host",
    "port",
    "type",
    "status",
    "lastChecked",
    "location",
    "failCount"
)
SELECT
    "id",
    "configId",
    COALESCE(NULLIF("ip", ''), '127.0.0.1') AS "host",
    "port",
    "type",
    "status",
    "lastChecked",
    "location",
    "failCount"
FROM "ProxyNode";

DROP TABLE "ProxyNode";
ALTER TABLE "new_ProxyNode" RENAME TO "ProxyNode";

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
