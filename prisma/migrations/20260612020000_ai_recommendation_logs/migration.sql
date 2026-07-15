CREATE TABLE "ai_recommendation_logs" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "kind" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "input_summary" TEXT,
  "output_summary" TEXT,
  "error" TEXT,
  "error_detail" TEXT,
  "provider_name" TEXT,
  "model" TEXT,
  "status" INTEGER,
  "duration_ms" INTEGER,
  "created_at" TEXT NOT NULL,
  CONSTRAINT "ai_recommendation_logs_kind_check" CHECK ("kind" IN ('ai', 'recommendation')),
  CONSTRAINT "ai_recommendation_logs_duration_ms_check" CHECK ("duration_ms" IS NULL OR "duration_ms" >= 0)
);

CREATE INDEX "ai_recommendation_logs_kind_idx" ON "ai_recommendation_logs" ("kind");
CREATE INDEX "ai_recommendation_logs_action_idx" ON "ai_recommendation_logs" ("action");
CREATE INDEX "ai_recommendation_logs_created_at_idx" ON "ai_recommendation_logs" ("created_at");
