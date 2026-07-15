import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const here = dirname(fileURLToPath(import.meta.url)); // tests/helpers
const projectRoot = dirname(dirname(here));
const migrationsPath = join(projectRoot, "prisma", "migrations");

export type TestDb = {
  databaseUrl: string;
  cleanup: () => void;
};

/**
 * 创建一个隔离的临时 SQLite 数据库，并按顺序应用所有 migration。
 * 必须在导入 @/lib/prisma 之前调用，确保 PrismaClient 读取正确的 DATABASE_URL。
 */
export function createTestDatabase(): TestDb {
  const dir = mkdtempSync(join(tmpdir(), "next-test-"));
  const dbFile = join(dir, "test.db");

  const db = new DatabaseSync(dbFile);
  db.exec("PRAGMA foreign_keys=ON;");

  const migrationNames = readdirSync(migrationsPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  for (const migrationName of migrationNames) {
    const sql = readFileSync(join(migrationsPath, migrationName, "migration.sql"), "utf8");
    // checksum 仅用于保持与生产迁移脚本一致的可追溯性，此处不写入迁移表。
    createHash("sha256").update(sql).digest("hex");
    db.exec(sql);
  }

  db.close();

  const databaseUrl = `file:${dbFile.replace(/\\/g, "/")}`;
  process.env.DATABASE_URL = databaseUrl;

  return {
    databaseUrl,
    cleanup: () => {
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
