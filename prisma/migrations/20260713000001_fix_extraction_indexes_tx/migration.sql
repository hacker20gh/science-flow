-- This migration was originally applied without a transaction wrapper.
-- Re-applying idempotently with a transaction for safety.

BEGIN;

-- 1. Remove global unique constraint on Paper.doi (replace with per-project composite)
DROP INDEX IF EXISTS "Paper_doi_key";

-- 2. Add composite unique constraint: same doi can exist in different projects
CREATE UNIQUE INDEX IF NOT EXISTS "Paper_projectId_doi_key" ON "Paper"("projectId", "doi");

-- 3. Add indexes to Extraction for common queries
CREATE INDEX IF NOT EXISTS "Extraction_paperId_idx" ON "Extraction"("paperId");
CREATE INDEX IF NOT EXISTS "Extraction_verified_idx" ON "Extraction"("verified");

-- 4. Update Extraction -> Paper foreign key to CASCADE on delete
ALTER TABLE "Extraction" DROP CONSTRAINT IF EXISTS "Extraction_paperId_fkey";
ALTER TABLE "Extraction" ADD CONSTRAINT "Extraction_paperId_fkey"
  FOREIGN KEY ("paperId") REFERENCES "Paper"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
