-- Retry backoff for queued automation runs.
ALTER TABLE "automation_runs" ADD COLUMN "notBefore" TIMESTAMP(3);
CREATE INDEX "automation_runs_status_notBefore_idx" ON "automation_runs"("status", "notBefore");
