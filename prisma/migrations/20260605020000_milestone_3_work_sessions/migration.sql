CREATE TABLE "work_sessions" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "task_id" TEXT NOT NULL,
  "start_at" TEXT NOT NULL,
  "end_at" TEXT,
  "duration_min" INTEGER,
  "focus_score" INTEGER,
  "note" TEXT,
  "created_at" TEXT NOT NULL,
  CONSTRAINT "work_sessions_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "work_sessions_duration_min_check" CHECK ("duration_min" IS NULL OR "duration_min" >= 0),
  CONSTRAINT "work_sessions_focus_score_check" CHECK ("focus_score" IS NULL OR "focus_score" BETWEEN 1 AND 5)
);

CREATE INDEX "work_sessions_task_id_idx" ON "work_sessions" ("task_id");
CREATE INDEX "work_sessions_end_at_idx" ON "work_sessions" ("end_at");
