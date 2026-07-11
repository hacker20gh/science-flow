import type { ProactiveInsight } from './event-bus';

interface ProjectSnapshot {
  paperCount: number;
  extractionCount: number;
  conflictCount: number;
  hypothesisCount: number;
  pendingHypotheses: number;
  experimentCount: number;
  todoCount: number;
  pendingTodos: number;
  lastActivityDays: number | null;
}

export function generateInsights(snapshot: ProjectSnapshot): ProactiveInsight[] {
  const insights: ProactiveInsight[] = [];

  // Rule 1: Conflicts need attention
  if (snapshot.conflictCount > 0) {
    insights.push({
      id: 'conflicts',
      type: 'warning',
      title: `${snapshot.conflictCount} 个文献冲突待解决`,
      description: '矩阵中存在方向不一致的通路数据，建议设计实验验证',
      action: { label: '查看矩阵', href: 'brain' },
      createdAt: Date.now(),
    });
  }

  // Rule 2: Enough data to form hypotheses
  if (snapshot.paperCount >= 3 && snapshot.extractionCount >= 3 && snapshot.hypothesisCount === 0) {
    insights.push({
      id: 'suggest-hypothesis',
      type: 'suggestion',
      title: '数据充足，建议提出假设',
      description: `已有 ${snapshot.paperCount} 篇文献和 ${snapshot.extractionCount} 条提取数据`,
      action: { label: '前往知识面板', href: 'brain' },
      createdAt: Date.now(),
    });
  }

  // Rule 3: Pending hypotheses need experiments
  if (snapshot.pendingHypotheses > 0 && snapshot.experimentCount === 0) {
    insights.push({
      id: 'suggest-experiment',
      type: 'suggestion',
      title: `${snapshot.pendingHypotheses} 个假设待验证`,
      description: '建议设计实验来验证待验证状态的假设',
      action: { label: '设计实验', href: 'experiments' },
      createdAt: Date.now(),
    });
  }

  // Rule 4: Project idle
  if (snapshot.lastActivityDays !== null && snapshot.lastActivityDays >= 3) {
    insights.push({
      id: 'idle',
      type: 'info',
      title: `项目已 ${snapshot.lastActivityDays} 天无活动`,
      description: `还有 ${snapshot.pendingTodos} 个待办任务未完成`,
      createdAt: Date.now(),
    });
  }

  // Rule 5: Pending todos
  if (snapshot.pendingTodos > 0) {
    insights.push({
      id: 'pending-todos',
      type: 'info',
      title: `${snapshot.pendingTodos} 个待办任务`,
      description: '前往知识面板查看和处理待办事项',
      action: { label: '查看待办', href: 'brain' },
      createdAt: Date.now(),
    });
  }

  return insights;
}
