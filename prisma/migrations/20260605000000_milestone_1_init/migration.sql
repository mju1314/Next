PRAGMA foreign_keys=OFF;

CREATE TABLE "domains" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "icon" TEXT,
  "color" TEXT,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TEXT NOT NULL,
  "updated_at" TEXT NOT NULL
);

CREATE TABLE "goals" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "domain_id" TEXT,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "importance" INTEGER NOT NULL DEFAULT 3,
  "start_date" TEXT,
  "target_date" TEXT,
  "status" TEXT NOT NULL DEFAULT 'active',
  "progress" REAL NOT NULL DEFAULT 0,
  "created_at" TEXT NOT NULL,
  "updated_at" TEXT NOT NULL,
  CONSTRAINT "goals_domain_id_fkey" FOREIGN KEY ("domain_id") REFERENCES "domains" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "goals_importance_check" CHECK ("importance" BETWEEN 1 AND 5),
  CONSTRAINT "goals_status_check" CHECK ("status" IN ('active', 'paused', 'completed', 'archived')),
  CONSTRAINT "goals_progress_check" CHECK ("progress" >= 0 AND "progress" <= 100)
);

CREATE TABLE "projects" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "goal_id" TEXT,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "status" TEXT NOT NULL DEFAULT 'active',
  "progress" REAL NOT NULL DEFAULT 0,
  "start_date" TEXT,
  "target_date" TEXT,
  "last_active_at" TEXT,
  "created_at" TEXT NOT NULL,
  "updated_at" TEXT NOT NULL,
  CONSTRAINT "projects_goal_id_fkey" FOREIGN KEY ("goal_id") REFERENCES "goals" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "projects_status_check" CHECK ("status" IN ('active', 'paused', 'completed', 'archived')),
  CONSTRAINT "projects_progress_check" CHECK ("progress" >= 0 AND "progress" <= 100)
);

CREATE TABLE "tasks" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "project_id" TEXT,
  "goal_id" TEXT,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "status" TEXT NOT NULL DEFAULT 'todo',
  "priority_manual" INTEGER,
  "estimate_min" INTEGER,
  "actual_min" INTEGER NOT NULL DEFAULT 0,
  "due_at" TEXT,
  "task_type" TEXT,
  "energy_level" TEXT,
  "is_blocked" BOOLEAN NOT NULL DEFAULT false,
  "score_snapshot" TEXT,
  "created_at" TEXT NOT NULL,
  "updated_at" TEXT NOT NULL,
  CONSTRAINT "tasks_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "tasks_goal_id_fkey" FOREIGN KEY ("goal_id") REFERENCES "goals" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "tasks_status_check" CHECK ("status" IN ('todo', 'doing', 'done', 'skipped', 'archived')),
  CONSTRAINT "tasks_priority_manual_check" CHECK ("priority_manual" IS NULL OR "priority_manual" BETWEEN 1 AND 5),
  CONSTRAINT "tasks_estimate_min_check" CHECK ("estimate_min" IS NULL OR "estimate_min" > 0),
  CONSTRAINT "tasks_actual_min_check" CHECK ("actual_min" >= 0),
  CONSTRAINT "tasks_task_type_check" CHECK ("task_type" IS NULL OR "task_type" IN ('deep_work', 'admin', 'learning', 'health', 'errand')),
  CONSTRAINT "tasks_energy_level_check" CHECK ("energy_level" IS NULL OR "energy_level" IN ('low', 'medium', 'high'))
);

CREATE TABLE "inbox_items" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "raw_text" TEXT NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'manual',
  "status" TEXT NOT NULL DEFAULT 'unprocessed',
  "converted_task_id" TEXT,
  "converted_project_id" TEXT,
  "converted_goal_id" TEXT,
  "created_at" TEXT NOT NULL,
  "updated_at" TEXT NOT NULL,
  CONSTRAINT "inbox_items_converted_task_id_fkey" FOREIGN KEY ("converted_task_id") REFERENCES "tasks" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "inbox_items_source_check" CHECK ("source" IN ('manual', 'voice', 'ai', 'imported')),
  CONSTRAINT "inbox_items_status_check" CHECK ("status" IN ('unprocessed', 'converted', 'ignored', 'archived'))
);

CREATE INDEX "goals_domain_id_idx" ON "goals" ("domain_id");
CREATE INDEX "projects_goal_id_idx" ON "projects" ("goal_id");
CREATE INDEX "tasks_project_id_idx" ON "tasks" ("project_id");
CREATE INDEX "tasks_goal_id_idx" ON "tasks" ("goal_id");
CREATE INDEX "tasks_status_idx" ON "tasks" ("status");
CREATE INDEX "inbox_items_status_idx" ON "inbox_items" ("status");
CREATE INDEX "inbox_items_converted_task_id_idx" ON "inbox_items" ("converted_task_id");

PRAGMA foreign_keys=ON;
