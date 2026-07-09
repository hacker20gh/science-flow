-- SciFlow AI 数据库初始化脚本
-- 在 Supabase SQL Editor 中运行此脚本

-- 启用 UUID 扩展
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ===== 用户 =====
CREATE TABLE IF NOT EXISTS "User" (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  avatar TEXT,
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ===== 项目 =====
CREATE TABLE IF NOT EXISTS "Project" (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name TEXT NOT NULL,
  description TEXT,
  "userId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_project_user ON "Project"("userId");

-- ===== 文献 =====
CREATE TABLE IF NOT EXISTS "Paper" (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "projectId" TEXT NOT NULL REFERENCES "Project"(id) ON DELETE CASCADE,
  doi TEXT UNIQUE,
  pmid TEXT,
  title TEXT NOT NULL,
  authors TEXT[] DEFAULT '{}',
  journal TEXT,
  year INTEGER,
  "impactFactor" DOUBLE PRECISION,
  abstract TEXT,
  "fullText" TEXT,
  source TEXT, -- pubmed, semantic_scholar, openalex, user_upload
  "oaUrl" TEXT,
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_paper_project ON "Paper"("projectId");
CREATE INDEX idx_paper_doi ON "Paper"(doi) WHERE doi IS NOT NULL;
CREATE INDEX idx_paper_pmid ON "Paper"(pmid) WHERE pmid IS NOT NULL;

-- ===== 文献提取结果 =====
CREATE TABLE IF NOT EXISTS "Extraction" (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "paperId" TEXT NOT NULL REFERENCES "Paper"(id) ON DELETE CASCADE,
  "drugName" TEXT,
  "drugConc" TEXT,
  "cellLine" TEXT,
  pathway TEXT,
  "pathwayDir" TEXT, -- up, down, no_change
  phenotype TEXT,
  "phenotypeDir" TEXT,
  method TEXT,
  conclusion TEXT,
  "rawText" TEXT,
  confidence DOUBLE PRECISION,
  verified BOOLEAN DEFAULT false,
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_extraction_paper ON "Extraction"("paperId");

-- ===== 假设 =====
CREATE TABLE IF NOT EXISTS "Hypothesis" (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "projectId" TEXT NOT NULL REFERENCES "Project"(id) ON DELETE CASCADE,
  statement TEXT NOT NULL,
  status TEXT DEFAULT 'pending', -- pending, testing, supported, refused, revised
  evidence JSONB,
  "basedOn" TEXT[] DEFAULT '{}',
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_hypothesis_project ON "Hypothesis"("projectId");

-- ===== 实验 =====
CREATE TABLE IF NOT EXISTS "Experiment" (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "projectId" TEXT NOT NULL REFERENCES "Project"(id) ON DELETE CASCADE,
  "hypothesisId" TEXT REFERENCES "Hypothesis"(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL, -- western_blot, flow_cytometry, qpcr, etc.
  status TEXT DEFAULT 'designed', -- designed, running, completed, failed
  protocol JSONB NOT NULL,
  variables JSONB NOT NULL,
  result JSONB,
  troubleshoot JSONB,
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_experiment_project ON "Experiment"("projectId");

-- ===== 实验数据 =====
CREATE TABLE IF NOT EXISTS "ExperimentData" (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "experimentId" TEXT NOT NULL REFERENCES "Experiment"(id) ON DELETE CASCADE,
  "fileType" TEXT NOT NULL, -- excel, csv, image
  "fileName" TEXT NOT NULL,
  "fileUrl" TEXT NOT NULL, -- Supabase Storage URL
  "parsedData" JSONB,
  analysis JSONB,
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_expdata_experiment ON "ExperimentData"("experimentId");

-- ===== 时间线事件 =====
CREATE TABLE IF NOT EXISTS "TimelineEvent" (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "projectId" TEXT NOT NULL REFERENCES "Project"(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  content JSONB NOT NULL,
  metadata JSONB,
  "sortOrder" INTEGER DEFAULT 0,
  "weekNumber" INTEGER,
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_timeline_project ON "TimelineEvent"("projectId");

-- ===== 论文草稿 =====
CREATE TABLE IF NOT EXISTS "Manuscript" (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "projectId" TEXT NOT NULL REFERENCES "Project"(id) ON DELETE CASCADE,
  journal TEXT,
  language TEXT DEFAULT 'en',
  abstract TEXT,
  introduction TEXT,
  methods TEXT,
  results TEXT,
  discussion TEXT,
  references JSONB,
  "reviewSimulation" JSONB,
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_manuscript_project ON "Manuscript"("projectId");

-- ===== 更新时间触发器 =====
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW."updatedAt" = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_project_updated
  BEFORE UPDATE ON "Project"
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trigger_hypothesis_updated
  BEFORE UPDATE ON "Hypothesis"
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trigger_experiment_updated
  BEFORE UPDATE ON "Experiment"
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trigger_manuscript_updated
  BEFORE UPDATE ON "Manuscript"
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
