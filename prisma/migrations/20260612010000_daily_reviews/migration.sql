CREATE TABLE "daily_reviews" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "date" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'manual',
  "metrics_snapshot" TEXT,
  "created_at" TEXT NOT NULL,
  "updated_at" TEXT NOT NULL,
  CONSTRAINT "daily_reviews_source_check" CHECK ("source" IN ('manual', 'ai', 'local'))
);

CREATE UNIQUE INDEX "daily_reviews_date_key" ON "daily_reviews" ("date");
