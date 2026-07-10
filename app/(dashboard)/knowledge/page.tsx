"use client";

import { useState } from "react";
import Link from "next/link";
import { Sidebar } from "@/components/layout/sidebar";

const KNOWLEDGE_CATEGORIES = [
  {
    id: "statistics",
    label: "统计基础",
    icon: "📊",
    articles: [
      {
        id: "p-value",
        title: "P 值是什么？",
        summary: "理解 p 值的含义、常见误解和正确使用方法",
        tags: ["统计", "假设检验"],
      },
      {
        id: "power",
        title: "统计功效（Statistical Power）",
        summary: "为什么你的实验需要足够的样本量",
        tags: ["统计", "样本量"],
      },
      {
        id: "multiple-testing",
        title: "多重检验校正",
        summary: "Bonferroni、FDR 和为什么不能反复做 t 检验",
        tags: ["统计", "多重比较"],
      },
      {
        id: "effect-size",
        title: "效应量（Effect Size）",
        summary: "统计显著 ≠ 生物学意义：如何衡量效应大小",
        tags: ["统计", "效应量"],
      },
    ],
  },
  {
    id: "experimental-design",
    label: "实验设计",
    icon: "🧪",
    articles: [
      {
        id: "controls",
        title: "对照组设计",
        summary: "阳性对照、阴性对照、Vehicle 对照——你需要哪些？",
        tags: ["实验设计", "对照"],
      },
      {
        id: "blinding",
        title: "随机化与盲法",
        summary: "如何避免实验偏差：随机分组和单盲/双盲设计",
        tags: ["实验设计", "偏差"],
      },
      {
        id: "replication",
        title: "生物学重复 vs 技术重复",
        summary: "什么时候需要 3 个生物学重复？什么时候 3 次技术重复就够了？",
        tags: ["实验设计", "重复"],
      },
      {
        id: "dose-response",
        title: "剂量-反应曲线设计",
        summary: "如何选择浓度梯度、确定 IC50/EC50",
        tags: ["实验设计", "剂量"],
      },
    ],
  },
  {
    id: "common-assays",
    label: "常见实验方法",
    icon: "🔬",
    articles: [
      {
        id: "western-blot",
        title: "Western Blot 完全指南",
        summary: "从蛋白提取到曝光：每个步骤的注意事项",
        tags: ["Western Blot", "蛋白"],
      },
      {
        id: "qpcr",
        title: "qPCR 实验设计",
        summary: "引物设计、内参选择、2^-ΔΔCt 方法",
        tags: ["qPCR", "基因表达"],
      },
      {
        id: "flow-cytometry",
        title: "流式细胞术入门",
        summary: "FSC/SSC 设门、荧光补偿、常见标记物",
        tags: ["流式细胞术", "细胞分析"],
      },
      {
        id: "elisa",
        title: "ELISA 实验要点",
        summary: "标准曲线、样本稀释、OD 值解读",
        tags: ["ELISA", "蛋白定量"],
      },
    ],
  },
  {
    id: "writing",
    label: "论文写作",
    icon: "📝",
    articles: [
      {
        id: "figure-design",
        title: "科研图表设计原则",
        summary: "如何设计清晰、专业、有说服力的 Figure",
        tags: ["写作", "图表"],
      },
      {
        id: "statistical-reporting",
        title: "统计结果的规范报告",
        summary: "APA 格式、t(F) 值怎么写、p 值的正确呈现",
        tags: ["写作", "统计"],
      },
    ],
  },
];

// 知识卡片内容
const ARTICLE_CONTENT: Record<string, { content: string; keyPoints: string[]; tips: string[] }> = {
  "p-value": {
    content: `P 值是在零假设（H₀）为真的前提下，观察到当前数据或更极端数据的概率。

**常见误解：**
- ❌ "p = 0.03 意味着有 97% 的概率 H₁ 为真" → 错！p 值不是 H₁ 为真的概率
- ❌ "p > 0.05 意味着没有效果" → 错！可能是样本量不足
- ❌ "p < 0.05 意味着效果很重要" → 错！统计显著 ≠ 生物学意义

**正确理解：**
- p 值衡量的是"数据与零假设的不兼容程度"
- p 值越小，数据越不支持零假设
- p 值不能告诉你效应的大小或方向

**实践建议：**
- 报告效应量和置信区间，而不仅仅是 p 值
- 设置合理的显著性水平（α = 0.05 是惯例，不是真理）
- 考虑生物学意义，而不只是统计学意义`,
    keyPoints: [
      "p 值是在 H₀ 为真的前提下，观察到当前数据或更极端数据的概率",
      "p 值不是 H₁ 为真的概率",
      "统计显著 ≠ 生物学意义",
      "报告效应量和置信区间比只报告 p 值更有价值",
    ],
    tips: [
      "在实验设计阶段就确定样本量和显著性水平",
      "不要在看到数据后才选择统计方法",
      "多个实验的一致性比单个 p 值更有说服力",
    ],
  },
  "power": {
    content: `统计功效（Power）= 1 - β = 检测到真实效果的概率。

**为什么重要：**
- 如果 Power = 0.6，意味着你有 40% 的概率漏掉真实的效果
- 低 Power 的实验既浪费资源，又可能得出错误结论

**影响 Power 的因素：**
1. 样本量（n）—— 最主要的因素
2. 效应量（Effect Size）—— 效果越大越容易检测到
3. 显著性水平（α）—— α 越大 Power 越高（但假阳性也越多）
4. 数据变异性 —— 变异越小 Power 越高

**如何提高 Power：**
- 增加样本量（最直接）
- 优化实验条件减少变异
- 使用更精确的检测方法
- 选择合适的统计检验

**样本量估算：**
- 使用 G*Power 软件或 R 的 pwr 包
- 需要预估效应量（基于文献或预实验）
- 通常需要 Power ≥ 0.8`,
    keyPoints: [
      "Power = 检测到真实效果的概率",
      "低 Power = 高假阴性率 = 浪费资源",
      "样本量是影响 Power 的最重要因素",
      "Power ≥ 0.8 是常见要求",
    ],
    tips: [
      "实验前做样本量估算，不是实验后",
      "预实验可以帮助估计效应量",
      "如果经费有限，宁可减少组数也要保证每组样本量",
    ],
  },
  "controls": {
    content: `对照组是实验设计的核心——没有对照，就没有结论。

**对照类型：**

1. **阴性对照（Negative Control）**
   - 目的：排除非特异性效应
   - 例：Vehicle 对照（溶剂对照）
   - 确保：溶剂本身不影响结果

2. **阳性对照（Positive Control）**
   - 目的：验证实验体系有效
   - 例：已知能激活某通路的药物
   - 确保：如果阳性对照都失败，说明实验体系有问题

3. **空白对照（Blank Control）**
   - 目的：扣除背景信号
   - 例：不加任何处理的细胞
   - 确保：基线水平的准确性

4. **自身对照（Self Control）**
   - 目的：消除个体差异
   - 例：同一批细胞的处理前后对比
   - 注意：需要确认处理是可逆的

**常见缺失：**
- ❌ 只有实验组，没有 Vehicle 对照
- ❌ 没有阳性对照，无法判断实验体系是否工作
- ❌ 对照组和实验组的处理条件不一致`,
    keyPoints: [
      "阴性对照排除非特异性效应",
      "阳性对照验证实验体系有效",
      "Vehicle 对照是最基本的阴性对照",
      "缺少对照的实验结果不可信",
    ],
    tips: [
      "设计实验时先列对照组，再列实验组",
      "阳性对照要选文献中验证过的",
      "对照组的处理条件要和实验组完全一致",
    ],
  },
};

export default function KnowledgePage() {
  const [selectedArticle, setSelectedArticle] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>("statistics");

  const currentArticle = selectedArticle ? ARTICLE_CONTENT[selectedArticle] : null;
  const currentMeta = KNOWLEDGE_CATEGORIES
    .flatMap((c) => c.articles)
    .find((a) => a.id === selectedArticle);

  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex-1 overflow-y-auto bg-gray-50">
        <div className="p-8 max-w-5xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-2xl font-bold">📚 科研知识库</h1>
            <p className="text-gray-500 mt-1">实验设计、统计方法、论文写作的速查手册</p>
          </div>

          {selectedArticle && currentArticle ? (
            /* 文章详情 */
            <div>
              <button
                onClick={() => setSelectedArticle(null)}
                className="text-sm text-blue-600 hover:underline mb-4"
              >
                ← 返回知识库
              </button>

              <div className="bg-white border border-gray-200 rounded-xl p-6">
                <div className="flex items-center gap-2 mb-1">
                  {currentMeta?.tags.map((tag) => (
                    <span key={tag} className="text-xs px-2 py-0.5 bg-blue-50 text-blue-600 rounded">
                      {tag}
                    </span>
                  ))}
                </div>
                <h2 className="text-xl font-bold mt-2">{currentMeta?.title}</h2>

                {/* 正文 */}
                <div className="mt-6 prose prose-sm max-w-none">
                  {currentArticle.content.split("\n\n").map((para, i) => {
                    if (para.startsWith("**") && para.endsWith("**")) {
                      return <h3 key={i} className="text-base font-semibold mt-6 mb-2">{para.replace(/\*\*/g, "")}</h3>;
                    }
                    return (
                      <div key={i} className="mb-3 text-sm leading-relaxed text-gray-700 whitespace-pre-wrap">
                        {para}
                      </div>
                    );
                  })}
                </div>

                {/* 关键要点 */}
                <div className="mt-6 bg-blue-50 border border-blue-100 rounded-lg p-4">
                  <h4 className="text-sm font-medium text-blue-700 mb-2">📌 关键要点</h4>
                  <ul className="space-y-1">
                    {currentArticle.keyPoints.map((point, i) => (
                      <li key={i} className="text-xs text-blue-600">• {point}</li>
                    ))}
                  </ul>
                </div>

                {/* 实践建议 */}
                <div className="mt-4 bg-green-50 border border-green-100 rounded-lg p-4">
                  <h4 className="text-sm font-medium text-green-700 mb-2">💡 实践建议</h4>
                  <ul className="space-y-1">
                    {currentArticle.tips.map((tip, i) => (
                      <li key={i} className="text-xs text-green-600">• {tip}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          ) : (
            /* 分类列表 */
            <div>
              {/* 分类导航 */}
              <div className="flex gap-2 mb-6 overflow-x-auto">
                {KNOWLEDGE_CATEGORIES.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setActiveCategory(cat.id)}
                    className={`px-4 py-2 rounded-lg text-sm whitespace-nowrap transition-colors ${
                      activeCategory === cat.id
                        ? "bg-blue-600 text-white"
                        : "bg-white border border-gray-200 text-gray-600 hover:border-blue-300"
                    }`}
                  >
                    {cat.icon} {cat.label}
                  </button>
                ))}
              </div>

              {/* 文章卡片 */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {KNOWLEDGE_CATEGORIES
                  .find((c) => c.id === activeCategory)
                  ?.articles.map((article) => (
                    <button
                      key={article.id}
                      onClick={() => setSelectedArticle(article.id)}
                      className="text-left p-5 bg-white border border-gray-200 rounded-xl hover:border-blue-300 hover:shadow-sm transition-all"
                    >
                      <h3 className="font-medium text-sm mb-2">{article.title}</h3>
                      <p className="text-xs text-gray-500 mb-3">{article.summary}</p>
                      <div className="flex gap-2">
                        {article.tags.map((tag) => (
                          <span key={tag} className="text-xs px-2 py-0.5 bg-gray-100 text-gray-500 rounded">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </button>
                  ))}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
