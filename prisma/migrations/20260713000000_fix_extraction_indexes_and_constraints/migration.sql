-- Fix Extraction indexes and Paper.doi constraint

-- 1. Remove global unique constraint on Paper.doi (replace with per-project composite)
-- First, drop the existing unique index if it exists
DROP INDEX IF EXISTS "Paper_doi_key";

-- 2. Add composite unique constraint: same doi can exist in different projects
CREATE UNIQUE INDEX "Paper_projectId_doi_key" ON "Paper"("projectId", "doi");

-- 3. Add indexes to Extraction for common queries
CREATE INDEX "Extraction_paperId_idx" ON "Extraction"("paperId");
CREATE INDEX "Extraction_verified_idx" ON "Extraction"("verified");

-- 4. Update Extraction -> Paper foreign key to CASCADE on delete
-- (Deleting a Paper should delete its Extractions)
ALTER TABLE "Extraction" DROP CONSTRAINT IF EXISTS "Extraction_paperId_fkey";
ALTER TABLE "Extraction" ADD CONSTRAINT "Extraction_paperId_fkey"
  FOREIGN KEY ("paperId") REFERENCES "Paper"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
