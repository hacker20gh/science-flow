-- CreateIndex
CREATE INDEX "Extraction_paperId_createdAt_idx" ON "Extraction"("paperId", "createdAt");

-- CreateIndex
CREATE INDEX "Hypothesis_projectId_createdAt_idx" ON "Hypothesis"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "Experiment_projectId_createdAt_idx" ON "Experiment"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "Conversation_projectId_updatedAt_idx" ON "Conversation"("projectId", "updatedAt");

-- CreateIndex
CREATE INDEX "ChatMessage_conversationId_createdAt_idx" ON "ChatMessage"("conversationId", "createdAt");
