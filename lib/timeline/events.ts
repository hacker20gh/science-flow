/**
 * 时间线事件系统
 *
 * 记录项目中的所有事件（搜索、提取、实验、转向等）
 * 每个事件是项目历史的一部分
 */

// ===== 事件类型 =====

export type TimelineEventType =
  | "literature"
  | "hypothesis"
  | "experiment_design"
  | "experiment_completed"
  | "experiment_failed"
  | "pivot"           // 方向转变
  | "matrix_updated"
  | "manuscript"
  | "data_upload";

export interface TimelineEvent {
  id: string;
  type: TimelineEventType;
  title: string;
  description: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
  weekNumber?: number;
}

// ===== 事件模板 =====

export function createEvent(
  type: TimelineEventType,
  title: string,
  description: string,
  metadata?: Record<string, unknown>
): TimelineEvent {
  return {
    id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    title,
    description,
    timestamp: Date.now(),
    metadata,
  };
}

// ===== 事件图标和颜色 =====

export const EVENT_CONFIG: Record<
  TimelineEventType,
  { icon: string; label: string; color: string; bgColor: string }
> = {
  literature: {
    icon: "📖",
    label: "文献操作",
    color: "text-blue-600",
    bgColor: "bg-blue-100",
  },
  hypothesis: {
    icon: "💡",
    label: "假设提出",
    color: "text-amber-600",
    bgColor: "bg-amber-100",
  },
  experiment_design: {
    icon: "🧪",
    label: "实验设计",
    color: "text-green-600",
    bgColor: "bg-green-100",
  },
  experiment_completed: {
    icon: "✅",
    label: "实验完成",
    color: "text-green-700",
    bgColor: "bg-green-100",
  },
  experiment_failed: {
    icon: "⚠️",
    label: "实验失败",
    color: "text-red-600",
    bgColor: "bg-red-100",
  },
  pivot: {
    icon: "🔀",
    label: "方向调整",
    color: "text-purple-600",
    bgColor: "bg-purple-100",
  },
  matrix_updated: {
    icon: "📊",
    label: "矩阵更新",
    color: "text-blue-600",
    bgColor: "bg-blue-100",
  },
  manuscript: {
    icon: "📝",
    label: "论文操作",
    color: "text-gray-600",
    bgColor: "bg-gray-100",
  },
  data_upload: {
    icon: "📊",
    label: "数据上传",
    color: "text-teal-600",
    bgColor: "bg-teal-100",
  },
};

// ===== 时间格式化 =====

export function formatEventTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;

  if (diff < 60_000) return "刚刚";
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)} 小时前`;
  if (diff < 604800_000) return `${Math.floor(diff / 86400_000)} 天前`;

  return new Date(timestamp).toLocaleDateString("zh-CN", {
    month: "short",
    day: "numeric",
  });
}

// ===== 演示数据 =====

export function getDemoEvents(): TimelineEvent[] {
  const now = Date.now();
  const day = 86400_000;

  return [
    createEvent(
      "literature",
      "搜索文献",
      "搜索 PD-1 耐药机制，找到 30 篇相关文献（PubMed + Semantic Scholar + OpenAlex）",
      { total: 30, query: "PD-1 resistance hepatocellular carcinoma" }
    ),
    createEvent(
      "literature",
      "提取文献信息",
      "从 4 篇文献中提取出 5 个实验数据，生成初始机制矩阵",
      { papers: 4, experiments: 5 }
    ),
    createEvent(
      "matrix_updated",
      "机制矩阵生成",
      "矩阵包含 4 个通路维度、4 个表型维度，发现 1 个冲突（PD-L1 上下调不一致）",
      { pathways: 4, phenotypes: 4, conflicts: 1 }
    ),
    createEvent(
      "hypothesis",
      "提出假设",
      "sorafenib 通过 NF-κB 通路上调 HCC 细胞中的 PD-L1 表达",
      { hypothesis: "sorafenib 通过 NF-κB 上调 PD-L1" }
    ),
    {
      ...createEvent(
        "experiment_design",
        "设计实验 Exp#1",
        "sorafenib 5μM 处理 Huh7 细胞，检测 NF-κB 和 PD-L1",
        { experiment: "Exp#1", drug: "sorafenib", conc: "5μM", cellLine: "Huh7" }
      ),
      timestamp: now - 2 * day,
    },
    {
      ...createEvent(
        "experiment_failed",
        "Exp#1 失败",
        "5μM sorafenib 导致 >80% 细胞死亡，无法收集数据。原因：浓度接近 IC50",
        { experiment: "Exp#1", reason: "cytotoxicity", cellDeath: "80%" }
      ),
      timestamp: now - day,
    },
    {
      ...createEvent(
        "experiment_design",
        "重新设计 Exp#2",
        "降低浓度梯度至 1-5μM，增加剂量-效应曲线",
        { experiment: "Exp#2", drug: "sorafenib", conc: "1-5μM" }
      ),
      timestamp: now - day + 3600_000,
    },
    {
      ...createEvent(
        "experiment_completed",
        "Exp#2 完成",
        "PD-L1 在 2-3μM 显著上调（p<0.01），呈剂量依赖性",
        { experiment: "Exp#2", result: "PD-L1 upregulated at 2-3μM" }
      ),
      timestamp: now - 12 * 3600_000,
    },
    {
      ...createEvent(
        "hypothesis",
        "修订假设",
        "基于 Exp#2 结果，提出新假设：NF-κB 介导 sorafenib 诱导的 PD-L1 上调",
        { hypothesis: "NF-κB mediates sorafenib-induced PD-L1 upregulation" }
      ),
      timestamp: now - 10 * 3600_000,
    },
    {
      ...createEvent(
        "experiment_design",
        "设计 Exp#3",
        "NF-κB 抑制剂 + sorafenib 联合处理，验证 NF-κB 的作用",
        { experiment: "Exp#3" }
      ),
      timestamp: now - 6 * 3600_000,
    },
  ];
}
