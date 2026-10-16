-- Conversation tool set is frozen at creation; replayFrom marks the compaction point.
ALTER TABLE "conversations" ADD COLUMN "webSearch" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "conversations" ADD COLUMN "replayFrom" TIMESTAMP(3);
