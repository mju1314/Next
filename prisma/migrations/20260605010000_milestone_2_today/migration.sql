CREATE TABLE "daily_plans" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "date" TEXT NOT NULL,
  "available_minutes" INTEGER NOT NULL,
  "mood" INTEGER,
  "energy" INTEGER,
  "status" TEXT NOT NULL DEFAULT 'active',
  "created_at" TEXT NOT NULL,
  "updated_at" TEXT NOT NULL,
  CONSTRAINT "daily_plans_available_minutes_check" CHECK ("available_minutes" BETWEEN 10 AND 720),
  CONSTRAINT "daily_plans_mood_check" CHECK ("mood" IS NULL OR "mood" BETWEEN 1 AND 5),
  CONSTRAINT "daily_plans_energy_check" CHECK ("energy" IS NULL OR "energy" BETWEEN 1 AND 5),
  CONSTRAINT "daily_plans_status_check" CHECK ("status" IN ('draft', 'active', 'reviewed'))
);

CREATE TABLE "daily_foci" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "daily_plan_id" TEXT NOT NULL,
  "task_id" TEXT NOT NULL,
  "rank" INTEGER NOT NULL,
  "planned_minutes" INTEGER,
  "reason" TEXT,
  "score_detail" TEXT,
  "status" TEXT NOT NULL DEFAULT 'planned',
  "created_at" TEXT NOT NULL,
  "updated_at" TEXT NOT NULL,
  CONSTRAINT "daily_foci_daily_plan_id_fkey" FOREIGN KEY ("daily_plan_id") REFERENCES "daily_plans" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "daily_foci_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "daily_foci_rank_check" CHECK ("rank" BETWEEN 1 AND 4),
  CONSTRAINT "daily_foci_planned_minutes_check" CHECK ("planned_minutes" IS NULL OR "planned_minutes" > 0),
  CONSTRAINT "daily_foci_status_check" CHECK ("status" IN ('planned', 'doing', 'done', 'missed'))
);

CREATE UNIQUE INDEX "daily_plans_date_key" ON "daily_plans" ("date");
CREATE UNIQUE INDEX "daily_foci_daily_plan_id_rank_key" ON "daily_foci" ("daily_plan_id", "rank");
CREATE INDEX "daily_foci_daily_plan_id_idx" ON "daily_foci" ("daily_plan_id");
CREATE INDEX "daily_foci_task_id_idx" ON "daily_foci" ("task_id");
