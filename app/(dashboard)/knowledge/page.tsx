"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { PValueSimulator } from "@/components/knowledge/p-value-simulator";
import { Sidebar } from "@/components/layout/sidebar";

export default function KnowledgePage() {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center">加载中...</div>}>
      <KnowledgeContent />
    </Suspense>
  );
}

const KNOWLEDGE_CATEGORIES = [
  {
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
  "effect-size": {
    content: `**什么是效应量（Effect Size）？**

P 值告诉你"差异是否统计显著"，但不告诉你"差异有多大"。效应量衡量的是效果的实际大小，是判断研究结果是否有实际意义的关键指标。

**为什么 p 值不够？**
- 一个样本量足够大的研究，即使微不足道的差异也能得到极小的 p 值
- "p < 0.001"不代表效果重要，可能只是样本量大
- 效应量告诉你：这个差异在现实中到底有多大

**Cohen's d 公式：**

Cohen's d = (M₁ - M₂) / SD_pooled

其中 SD_pooled = √[(SD₁² + SD₂²) / 2]

**Cohen's d 解读标准：**
- d = 0.2：小效应（Small）—— 需要仔细观察才能察觉
- d = 0.5：中等效应（Medium）—— 肉眼可见的差异
- d = 0.8：大效应（Large）—— 非常明显的差异

**实际例子：**
假设某药物使肿瘤体积从对照组的 500mm³ 降至治疗组的 350mm³，SD = 100mm³：
Cohen's d = (500 - 350) / 100 = 1.5 → 大效应

如果两组均值分别为 500 和 480，SD = 100：
Cohen's d = (500 - 480) / 100 = 0.2 → 小效应（可能不值得投入临床转化）

**常见误区：统计显著 ≠ 实际重要**
- 在 SciFlow 的机制矩阵中，你可以同时看到 p 值和效应量，帮助你判断哪些差异真正值得关注`,
    keyPoints: [
      "效应量衡量效果的实际大小，补充 p 值的不足",
      "Cohen's d：0.2 小效应、0.5 中效应、0.8 大效应",
      "大样本量可以产生极小的 p 值，但效应量可能很小",
      "报告统计结果时应同时包含 p 值和效应量",
      "效应量帮助判断研究结果的实际应用价值",
    ],
    tips: [
      "写论文时在每个统计检验结果旁标注效应量",
      "做样本量估算时需要预估效应量（基于文献或预实验）",
      "小效应量 + 极小 p 值 = 样本量过大导致的虚假显著",
      "关注 CI 宽度：窄 CI + 大效应量 = 可靠的结果",
    ],
  },
  "multiple-testing": {
    content: `**多重比较问题：你可能正在制造假阳性**

假设你在 0.05 的显著性水平下独立地做 20 次 t 检验，即使所有假设都不成立（零假设全部为真），你平均也会得到 1 个假阳性结果（20 × 0.05 = 1）。这就是多重比较问题。

**问题的本质：**
- 单次检验的假阳性率是 5%
- 但当你做多次检验时，"至少出现一个假阳性"的概率急剧上升
- 20 次检验：至少一个假阳性的概率 = 1 - (0.95)²⁰ ≈ 64%
- 在机制矩阵中比较多个基因或通路时，这个问题尤为突出

**常用校正方法：**

1. **Bonferroni 校正（最保守）**
   - 新的显著性阈值 = α / n（n 为检验次数）
   - 例：10 次检验，α = 0.05 → 阈值变为 0.005
   - 优点：简单，严格控制家族误差率（FWER）
   - 缺点：过于保守，容易漏掉真实效果（假阴性增加）

2. **Benjamini-Hochberg FDR（推荐）**
   - 控制的是"假发现率"（False Discovery Rate）
   - 不是控制"至少一个假阳性"，而是控制"阳性结果中假阳性的比例"
   - 比 Bonferroni 更有统计功效（power）
   - 适用于探索性分析，如筛选差异表达基因

**何时用哪种方法？**
- 确认性研究（验证已知假说）→ Bonferroni
- 探索性研究（筛选候选分子）→ Benjamini-Hochberg FDR
- 基因组学/蛋白质组学大数据 → FDR 几乎总是更合适`,
    keyPoints: [
      "多次检验会显著增加假阳性率",
      "Bonferroni 校正简单但保守，适用于少量检验",
      "Benjamini-Hochberg FDR 更适合大规模筛选",
      "探索性研究优先用 FDR，确认性研究可用 Bonferroni",
      "在机制矩阵等多变量比较中必须做多重检验校正",
    ],
    tips: [
      "设计实验时就预见到需要校正的次数，调整样本量",
      "在 SciFlow 机制矩阵中标注已使用的校正方法",
      "筛选阶段用 FDR，验证阶段用更严格的阈值",
      "不要只报告校正前的 p 值，审稿人一定会追问",
    ],
  },
  "blinding": {
    content: `**为什么需要随机化和盲法？**

研究者的期望会无意识地影响实验操作和数据判读。随机化和盲法是减少这种偏差（bias）的两大支柱。

**随机化（Randomization）**

随机分组的目的是确保各组在基线特征上尽可能均衡，消除选择偏差（Selection Bias）。

- 简单随机化：抛硬币或随机数表（适合大样本）
- 分层随机化：按性别、年龄等分层后随机（保证关键因素均衡）
- 区组随机化：按固定区组大小随机（保证各组样本量接近）

**分配隐藏（Allocation Concealment）**
- 与随机化不同：分配隐藏是"不让操作者知道下一个被分到哪组"
- 方法：密封信封、中央随机化系统
- 为什么重要：没有分配隐藏，随机化可能被绕过

**盲法的三个层次：**

1. **单盲（Single-blind）**
   - 受试者不知道自己在哪一组
   - 最基本的盲法要求

2. **双盲（Double-blind）**
   - 受试者和实验操作者都不知道分组
   - 临床试验的金标准

3. **三盲（Triple-blind）**
   - 受试者、操作者、数据分析者都不知道分组
   - 最高级别的偏差控制

**实验室实验的实用建议：**
- 给样品编号时使用随机编码，解码前完成所有分析
- 免疫组化、Western Blot 的图像判读应在盲法下进行
- 细胞计数、流式设门等主观操作同样需要盲法`,
    keyPoints: [
      "随机化消除选择偏差，确保各组基线均衡",
      "分配隐藏防止研究者主观操控分组",
      "双盲是临床试验金标准：受试者和操作者都不知道分组",
      "实验室研究也应尽量实施盲法操作",
      "数据分析阶段的盲法常被忽视但同样重要",
    ],
    tips: [
      "使用随机数生成器进行分组，不要手动分配",
      "实验前准备好密封的随机编码信封",
      "让第三方进行样品编号，实验者只看到编码",
      "图像分析、细胞计数等主观评估必须在盲法下进行",
    ],
  },
  "replication": {
    content: `**生物学重复 ≠ 技术重复**

这是实验设计中最常见的混淆之一，理解二者的区别直接关系到结论的可靠性。

**技术重复（Technical Replicate）**
- 同一个生物样本重复测量多次
- 目的：评估测量方法的精确度（精密度）
- 例：同一份 RNA 样本跑 3 次 qPCR
- 反映的是：仪器噪音、操作误差

**生物学重复（Biological Replicate）**
- 不同的生物样本，独立处理和测量
- 目的：评估生物学变异，推断总体特征
- 例：3 只不同小鼠的肝脏组织分别提取 RNA 并做 qPCR
- 反映的是：个体间差异、生物学真实变异

**为什么 n=3 技术重复 ≠ n=3 生物学重复？**

假设你只有 1 只小鼠的组织，跑了 3 次 qPCR：
- 你得到的是：非常精确的"这只小鼠"的数据
- 你不知道的是：其他小鼠是否也这样
- 结论只对这一只小鼠有效，不能推广到整个群体

统计学要求的是：生物学重复提供独立的观测值（n），技术重复只能减少单次测量的噪音。

**正确的报告格式：**
"n = 3 biological replicates, each measured with 2 technical replicates"
在 SciFlow 的实验设计模块中，可以分别记录和追踪两种重复。

**最小重复数建议：**
- 细胞实验：至少 3 次独立生物学重复
- 动物实验：每组至少 5-6 只（考虑统计功效）
- 临床样本：根据效应量和变异度估算`,
    keyPoints: [
      "技术重复评估测量精密度，生物学重复评估真实变异",
      "统计分析中的 n 指的是生物学重复数",
      "3 次技术重复不能替代 3 次生物学重复",
      "论文中必须明确报告两种重复的数量",
      "生物学重复数不足是审稿人最常提出的质疑之一",
    ],
    tips: [
      "在实验记录本中分别标注两种重复的数量",
      "预实验可以帮助判断生物学变异的大小",
      "如果经费有限，优先保证生物学重复数",
      "使用 SciFlow 实验设计模板记录重复类型和数量",
    ],
  },
  "dose-response": {
    content: `**剂量-反应关系：药理学的基石**

了解药物浓度与生物学效应之间的定量关系，是药物研发和毒理学评估的核心。

**关键概念：**

1. **IC50（半数抑制浓度）**
   - 抑制 50% 最大效应所需的浓度
   - 越小说明药物效价（potency）越高
   - 常用于：细胞增殖抑制、酶活性抑制

2. **EC50（半数有效浓度）**
   - 产生 50% 最大效应所需的浓度
   - 与 IC50 类似，但用于激动剂

3. **Emax（最大效应）**
   - 药物能达到的最大效果
   - 反映药物的内在活性（efficacy）

**剂量-反应曲线形状：**

- **S 形曲线（Sigmoid）**：最常见，符合受体-配体结合规律
- **Hormesis 曲线**：低剂量刺激、高剂量抑制（U 形或倒 J 形）
- **线性关系**：在有限浓度范围内近似线性

**实验设计要点：**

- 浓度梯度设计：通常用对数等间距（如 0.01, 0.1, 1, 10, 100 μM）
- 每个浓度至少 3-5 个生物学重复
- 浓度范围要覆盖从无效应到饱和效应的完整区间
- 包含零浓度对照和最高浓度（确保毒性不在范围内）

**曲线拟合：**
使用四参数逻辑回归模型（4-parameter logistic model）：

Y = Bottom + (Top - Bottom) / (1 + 10^((LogEC50 - X) × HillSlope))

其中 HillSlope 反映曲线的陡峭程度。

在 SciFlow 的数据分析模块中，可以上传剂量-反应数据并自动拟合曲线，计算 IC50/EC50 值。`,
    keyPoints: [
      "IC50 和 EC50 是衡量药物效价的核心指标",
      "剂量梯度应覆盖无效应到饱和效应的完整范围",
      "对数等间距是设计浓度梯度的常用方法",
      "四参数逻辑回归是拟合剂量-反应曲线的标准模型",
      "Hormesis（低剂量刺激）现象需要特别注意",
    ],
    tips: [
      "先做预实验确定浓度范围，再做正式实验",
      "每个浓度点至少 3 个生物学重复",
      "使用 GraphPad Prism 或 SciFlow 进行非线性拟合",
      "报告 IC50/EC50 时同时报告 95% 置信区间",
    ],
  },
  "western-blot": {
    content: `**Western Blot 全流程攻略**

Western Blot 是检测特定蛋白表达的金标准方法，但步骤繁多，每一步都可能出问题。

**第一步：样本制备**

1. 裂解细胞/组织：使用含蛋白酶抑制剂的 RIPA 或 NP-40 裂解液
2. 蛋白定量：BCA 法或 Bradford 法
3. 加入 Loading Buffer，95°C 变性 5-10 分钟
4. 关键：每孔上样量一致（通常 20-50 μg 总蛋白）

**第二步：SDS-PAGE 电泳**

- 根据目标蛋白大小选择胶浓度：小蛋白（<50 kDa）用 12-15%，大蛋白用 8-10%
- 恒流跑胶：浓缩胶 80V，分离胶 120-150V
- 预染 Marker 用于监控电泳进程

**第三步：转膜**

- 湿转（Wet transfer）：效率高，适合大蛋白（>100 kDa），耗时 1-2 小时
- 半干转（Semi-dry）：速度快（30-60 分钟），适合中小蛋白
- 活化的 PVDF 膜用甲醇浸泡，NC 膜用转膜缓冲液平衡

**第四步：封闭与抗体孵育**

- 封闭液：5% 脱脂奶粉或 3-5% BSA（磷酸化蛋白用 BSA）
- 一抗 4°C 过夜（或室温 1-2 小时）
- 二抗室温孵育 1 小时

**常见问题排查：**

| 问题 | 可能原因 | 解决方案 |
|------|---------|---------|
| 无信号 | 抗体失效、转膜不充分 | 检查转膜效率、更换抗体 |
| 高背景 | 封闭不足、抗体浓度过高 | 延长封闭时间、稀释抗体 |
| 额外条带 | 交叉反应、蛋白降解 | 优化抗体特异性、加蛋白酶抑制剂`,
    keyPoints: [
      "BCA 法定量确保各孔上样量一致",
      "转膜效率是 Western Blot 成功的关键步骤",
      "磷酸化蛋白检测必须用 BSA 封闭，不能用脱脂奶粉",
      "无信号先查转膜效率，高背景先查封闭和抗体浓度",
      "每步都要设阳性对照验证体系有效性",
    ],
    tips: [
      "转膜后用丽春红 S 染色确认转膜效率",
      "一抗稀释比例需要优化，不要盲目沿用文献",
      "曝光时先短时间曝光，避免过曝丢失定量范围",
      "用 ImageJ 进行灰度分析时要扣除背景",
    ],
  },
  "qpcr": {
    content: `**qPCR 定量分析完全指南**

实时荧光定量 PCR（qPCR）是检测基因表达水平最常用的方法，但要获得可靠数据，每一步都需要精心设计。

**引物设计原则：**

- 产物长度：80-200 bp（短片段扩增效率更高）
- 引物长度：18-25 bp，GC 含量 40-60%
- 3' 端避免互补（防止引物二聚体）
- 跨外显子设计（防止基因组 DNA 污染）
- 使用 NCBI Primer BLAST 验证特异性

**内参基因（Reference Gene）选择：**

- 常用内参：GAPDH、β-actin、18S rRNA、HPRT1
- 关键：内参在你的实验条件下必须稳定表达
- 不要默认使用 GAPDH——在不同处理条件下，它的表达可能变化
- 推荐：至少验证 2-3 个候选内参的稳定性

**2^(-ΔΔCt) 方法：**

1. ΔCt = Ct(目标基因) - Ct(内参基因)
2. ΔΔCt = ΔCt(处理组) - ΔCt(对照组)
3. 相对表达量 = 2^(-ΔΔCt)

前提条件：引物扩增效率接近 100%（即 Efficiency ≈ 2，或 slope ≈ -3.32）

**MIQE 指南核心要点：**
- 报告 RNA 质量（RIN 值、A260/280）
- 报告引物效率（标准曲线 slope）
- 包含无模板对照（NTC）和无逆转录对照（-RT）
- 至少 3 次生物学重复

**常见陷阱：**
- 未做熔解曲线分析（无法判断是否有非特异扩增）
- 内参基因未验证稳定性
- Ct 值 > 35 时结果不可靠（接近检测限）`,
    keyPoints: [
      "引物产物长度 80-200 bp，跨外显子设计",
      "内参基因需要在实验条件下验证稳定性",
      "2^(-ΔΔCt) 方法要求扩增效率接近 100%",
      "至少 3 次生物学重复，每次含技术重复",
      "MIQE 指南是 qPCR 报告的金标准",
    ],
    tips: [
      "先做标准曲线确认引物效率（slope ≈ -3.32）",
      "熔解曲线是判断扩增特异性的必要步骤",
      "Ct > 35 的结果谨慎解读，考虑用更灵敏的方法",
      "在 SciFlow 实验记录中追踪内参基因的选择依据",
    ],
  },
  "flow-cytometry": {
    content: `**流式细胞术：从入门到精通**

流式细胞术（Flow Cytometry）可以在单细胞水平同时检测多个参数，是免疫学和细胞生物学研究的利器。

**基本原理：**

1. **光散射信号**
   - FSC（前向散射）：反映细胞大小
   - SSC（侧向散射）：反映细胞内部复杂度（颗粒性）
   - FSC vs SSC 散点图是流式分析的第一步

2. **荧光信号**
   - 细胞表面或内部的荧光标记抗体发出信号
   - 每个荧光通道对应一个检测参数
   - 同时检测 10-30 个参数（多色流式）

**荧光补偿（Compensation）：**

- 问题：一个荧光素的发射光谱可能泄漏到相邻检测通道
- 解决：数学补偿矩阵校正串色
- 必须使用单阳性对照（每个荧光素单独标记）来计算补偿

**设门策略（Gating Strategy）：**

1. 去除碎片和双联体（FSC-A vs FSC-H）
2. 设活细胞门（如 Zombie Aqua 阴性）
3. 淋巴细胞门（FSC/SSC 形态）
4. 特征标记物分群（如 CD3+ T 细胞）

**FMO 对照（Fluorescence Minus One）：**
- 每个荧光通道留一个不加，其余全加
- 用于设定正确的人工设门边界
- 比同型对照（Isotype Control）更准确

**数据分析要点：**
- 使用 FlowJo、FCS Express 或 Cytobank
- 所有样本使用统一的补偿矩阵和设门策略
- 报告时展示所有设门步骤的散点图`,
    keyPoints: [
      "FSC 反映细胞大小，SSC 反映内部复杂度",
      "荧光补偿是多色流式分析的必要步骤",
      "设门策略应从碎片去除逐步细化到目标群体",
      "FMO 对照比同型对照更准确地设定设门边界",
      "所有样本必须使用统一的补偿和设门策略",
    ],
    tips: [
      "先跑补偿微球（CompBeads）建立补偿矩阵",
      "设门时从'宽'到'窄'逐步细化，避免过度假设",
      "每次实验设 FMO 对照，特别是新组合的多色方案",
      "保存原始 FCS 文件，流式数据可以反复分析",
    ],
  },
  "elisa": {
    content: `**ELISA 定量检测：原理与实践**

酶联免疫吸附测定（ELISA）是蛋白定量的常规方法，选择合适的类型和严格的质量控制是获得可靠数据的关键。

**三种主要类型：**

1. **直接 ELISA（Direct）**
   - 抗原包被板 → 酶标一抗 → 显色
   - 优点：步骤简单、快速
   - 缺点：灵敏度较低、需要标记每种一抗

2. **间接 ELISA（Indirect）**
   - 抗原包被板 → 一抗 → 酶标二抗 → 显色
   - 优点：二抗可通用、信号放大
   - 缺点：步骤多、交叉反应风险

3. **夹心 ELISA（Sandwich）**—— 最常用
   - 捕获抗体包被 → 加样本 → 检测抗体 → 显色
   - 优点：特异性高、灵敏度高
   - 要求：需要识别同一蛋白不同表位的两种抗体

**标准曲线构建：**

- 使用已知浓度的标准品做系列稀释（通常 6-8 个点）
- 用四参数逻辑回归（4PL）拟合标准曲线
- 样品 OD 值必须落在标准曲线的线性范围内
- 线性范围之外的样品需要调整稀释倍数

**质量控制指标：**

- 批内变异系数（Intra-assay CV）：应 < 10%
- 批间变异系数（Inter-assay CV）：应 < 15%
- 标准曲线 R² ≥ 0.99
- 回收率（Recovery）：80-120%

**常见问题与解决：**

- 信号弱：延长孵育时间、增加抗体浓度
- 背景高：缩短二抗孵育时间、优化封闭条件
- CV 值大：加样不准确、孔间温度不均匀
- 标准曲线不理想：检查标准品活性、稀释精度`,
    keyPoints: [
      "夹心 ELISA 特异性最高，是最常用的类型",
      "标准曲线必须覆盖样品浓度范围，用 4PL 拟合",
      "批内 CV < 10%，批间 CV < 15% 是质量控制标准",
      "样品 OD 值超出标准曲线范围时必须调整稀释倍数",
      "每个 ELISA 板都应包含空白对照、标准曲线和质控品",
    ],
    tips: [
      "加样时从低浓度到高浓度，减少交叉污染",
      "每孔设复孔（duplicate 或 triplicate）",
      "显色反应要严格控制时间，TMB 终止后 30 分钟内读数",
      "保存好标准品原液，分装后 -80°C 保存避免反复冻融",
    ],
  },
  "figure-design": {
    content: `**科研图表设计原则：让你的数据会说话**

好的图表能在 5 秒内传达核心信息。图表设计的质量直接影响论文的可读性和影响力。

**核心原则：**

1. **清晰性（Clarity）**
   - 每张图只传达一个核心信息
   - 删减一切不必要的装饰（图表垃圾）
   - 坐标轴标签清晰，单位明确

2. **简洁性（Simplicity）**
   - 避免 3D 图表（增加视觉复杂度但不增加信息）
   - 柱状图不从零开始是常见错误
   - 饼图不适合展示连续数据——用柱状图替代

3. **一致性（Consistency）**
   - 全文使用统一的配色方案
   - 字体、字号、线宽保持一致
   - 图表风格与期刊风格匹配

**颜色选择：**

- 使用色盲友好配色（约 8% 的男性有红绿色盲）
- 推荐工具：ColorBrewer、Adobe Color
- 避免彩虹色阶，改用 viridis 或 inferno 色阶
- 打印版考虑灰度可辨识性

**字体和尺寸规范：**
- 坐标轴标签：≥ 10 pt
- 刻度标签：≥ 8 pt
- 图注文字：7-8 pt
- 分辨率：≥ 300 dpi（Nature/Cell 要求）

**顶级期刊的图表要求：**
- Nature：单栏 89 mm，双栏 183 mm，最大深度 247 mm
- Cell：单栏 85 mm，双栏 174 mm
- Science：单栏 55 mm，双栏 120 mm
- 所有期刊：字体推荐 Arial 或 Helvetica`,
    keyPoints: [
      "每张图只传达一个核心信息，删减多余装饰",
      "使用色盲友好配色，避免彩虹色阶",
      "字体 ≥ 10pt，分辨率 ≥ 300 dpi 是基本要求",
      "3D 图表和饼图在科研论文中应尽量避免",
      "了解目标期刊的图表尺寸和格式要求",
    ],
    tips: [
      "用 Adobe Illustrator 或 Inkscape 做最终排版调整",
      "先在灰度模式下检查图表是否仍可辨识",
      "投稿前用期刊模板检查图表尺寸和字体要求",
      "在 SciFlow 论文模块中可以直接导出符合期刊规范的图表",
    ],
  },
  "statistical-reporting": {
    content: `**统计结果的规范报告：APA 格式与最佳实践**

正确的统计报告让审稿人和读者能完整评估你的数据分析质量。不规范的报告是论文被拒的常见原因之一。

**APA 格式规范：**

- t 检验：t(自由度) = x.xx, p = .xxx
  - 例：t(28) = 3.42, p = .002
- F 检验：F(分子df, 分母df) = x.xx, p = .xxx
  - 例：F(2, 27) = 8.15, p = .002
- 卡方检验：χ²(df, n = xx) = x.xx, p = .xxx
- 相关系数：r(df) = .xx, p = .xxx
- 注意：APA 格式中 p 值的 0 不省略（写 p = .002，不写 p = .02）

**必须报告的统计量：**

1. 效应量（Effect Size）
   - Cohen's d（t 检验）、η²（方差分析）、r²（回归）
   - 审稿人越来越要求报告效应量

2. 置信区间（Confidence Interval）
   - 95% CI 比 p 值提供更多信息
   - 报告格式：M = 45.2, 95% CI [40.1, 50.3]

3. 描述性统计
   - 均值 ± 标准差（SD）或标准误（SEM）
   - 明确标注使用的是 SD 还是 SEM

**图注必须包含的信息：**
- 样本量（n）：每组的生物学重复数
- 误差线定义：SD、SEM 还是 95% CI
- 统计检验方法和结果
- 显著性标记含义（* p < .05, ** p < .01, *** p < .001）

**"统计显著" vs "生物学显著"：**
- 不要将 p < 0.05 直接翻译为"显著差异"
- 应该说"两组之间存在统计学显著差异（p = .002, d = 1.2）"
- 同时讨论效应量的实际意义`,
    keyPoints: [
      "t/F 检验结果必须包含自由度、检验统计量和 p 值",
      "效应量和置信区间是 p 值的重要补充，必须报告",
      "图注必须包含 n、误差线定义和统计检验结果",
      "区分'统计显著'和'生物学显著'，不要混用",
      "描述性统计明确标注是 SD 还是 SEM",
    ],
    tips: [
      "使用统计软件的输出模板（如 R 的 papaja 包）自动格式化",
      "在 Methods 部分声明所有统计检验和显著性水平",
      "Results 中每个数字都要有对应的统计检验支撑",
      "用 SciFlow 的统计报告功能自动生成规范的统计描述",
    ],
  },
};

function KnowledgeContent() {
  const searchParams = useSearchParams();
  const [selectedArticle, setSelectedArticle] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>("statistics");

  // Auto-select article from ?article= query param (e.g. from data analysis page)
  useEffect(() => {
    const articleId = searchParams.get("article");
    if (articleId) {
      setSelectedArticle(articleId);
      // Auto-switch to the right category
      const category = KNOWLEDGE_CATEGORIES.find((c) =>
        c.articles.some((a) => a.id === articleId)
      );
      if (category) setActiveCategory(category?.id ?? "statistics");
    }
  }, [searchParams]);

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

              {/* P 值交互模拟器 */}
              {selectedArticle === "p-value" && (
                <div className="mt-6 bg-white border border-gray-200 rounded-xl p-6">
                  <h3 className="text-base font-semibold mb-4">🎮 交互式模拟器</h3>
                  <PValueSimulator />
                </div>
              )}
            </div>
          ) : (
            /* 分类列表 */
            <div>
              {/* 分类导航 */}
              <div className="flex gap-2 mb-6 overflow-x-auto">
                {KNOWLEDGE_CATEGORIES.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setActiveCategory(cat?.id ?? "statistics")}
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
