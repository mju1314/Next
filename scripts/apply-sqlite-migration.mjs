import { createHash, randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const databasePath = join(root, "prisma", "dev.db");
const migrationsPath = join(root, "prisma", "migrations");

const db = new DatabaseSync(databasePath);

db.exec(`
  CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "checksum" TEXT NOT NULL,
    "finished_at" DATETIME,
    "migration_name" TEXT NOT NULL,
    "logs" TEXT,
    "rolled_back_at" DATETIME,
    "started_at" DATETIME NOT NULL DEFAULT current_timestamp,
    "applied_steps_count" INTEGER UNSIGNED NOT NULL DEFAULT 0
  );
`);

const migrationNames = readdirSync(migrationsPath, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

for (const migrationName of migrationNames) {
  const existing = db
    .prepare('SELECT "id" FROM "_prisma_migrations" WHERE "migration_name" = ?')
    .get(migrationName);

  if (existing) {
    continue;
  }

  const migrationPath = join(migrationsPath, migrationName, "migration.sql");
  const sql = readFileSync(migrationPath, "utf8");
  const checksum = createHash("sha256").update(sql).digest("hex");

  db.exec(sql);
  db.prepare(`
    INSERT INTO "_prisma_migrations"
      ("id", "checksum", "finished_at", "migration_name", "logs", "rolled_back_at", "started_at", "applied_steps_count")
    VALUES (?, ?, current_timestamp, ?, NULL, NULL, current_timestamp, 1)
  `).run(randomUUID(), checksum, migrationName);
}

db.close();
