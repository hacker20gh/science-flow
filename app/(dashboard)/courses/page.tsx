"use client";

import { useState, useEffect, useCallback } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { Check, ChevronLeft, BookOpen, Award, HelpCircle } from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Quiz {
  question: string;
  options: string[];
  answer: number;
}

interface Lesson {
  id: string;
  title: string;
  duration: string;
  content: string;
  keyTakeaways: string[];
  quiz?: Quiz;
}

interface Course {
  id: string;
  title: string;
  icon: string;
  description: string;
  lessons: Lesson[];
}

interface ProgressEntry {
  courseId: string;
  lessonId: string;
  status: string;
  completedAt: string | null;
}

/* ------------------------------------------------------------------ */
/*  Course Data — 26 lessons total                                     */
/* ------------------------------------------------------------------ */

const COURSES: Course[] = [
  // ─── 生物统计学基础 (8) ───────────────────────────────────────────
  {
    id: "biostatistics",
    title: "生物统计学基础",
    icon: "📊",
    description: "从零开始理解假设检验、置信区间、功效分析",
    lessons: [
      {
        id: "1",
        title: "为什么需要统计？",
        duration: "10 min",
        content:
          "科学研究中，个体差异无处不在——同一药物对不同小鼠的疗效可能差异很大。统计学帮我们从“偶然”中提取“必然”。\n\n" +
          "**描述统计（Descriptive Statistics）**用均值、标准差、中位数等概括数据的中心趋势和离散程度。例如：“该药物使肿瘤体积平均缩小 35%（SD=12%）”。\n\n" +
          "**推断统计（Inferential Statistics）**则从样本推断总体。我们不可能给全人类做实验，但可以通过统计检验判断：观察到的效果是否真实存在，还是仅仅是随机波动。\n\n" +
          "**典型案例**：某研究者发现 A 组 5 只小鼠肿瘤均值为 200mm³，B 组 5 只为 150mm³。差了 50mm³——但样本量太小，标准差可能很大，这个差异可能毫无统计意义。没有统计检验，我们就是在“看图说话”。",
        keyTakeaways: [
          "描述统计概括数据特征，推断统计从样本推断总体",
          "个体差异是统计存在的根本原因",
          "样本量太小时，表面差异可能不具统计意义",
        ],
        quiz: {
          question: "以下哪项属于推断统计的范畴？",
          options: [
            "计算实验数据的均值",
            "用 t 检验判断两组差异是否显著",
            "绘制数据分布直方图",
            "报告数据的标准差",
          ],
          answer: 1,
        },
      },
      {
        id: "2",
        title: "零假设与备择假设",
        duration: "15 min",
        content:
          "假设检验的起点是**零假设（H₀）**——它代表“没有效果”或“没有差异”。我们的策略是：假设 H₀ 成立，然后看数据是否强烈到足以拒绝它。\n\n" +
          "**备择假设（H₁）**是我们想证明的——通常是你预期的效果。例如：\n" +
          "- H₀：新药与安慰剂无差异\n" +
          "- H₁：新药疗效优于安慰剂\n\n" +
          "**单尾 vs 双尾检验**：\n" +
          "- **双尾检验**：检测任何方向的差异（更保守、更常用），适用于你不知道效果方向的情况\n" +
          "- **单尾检验**：只检测特定方向（如只检测“更大”），需要先验知识支撑\n\n" +
          "**关键原则**：统计检验只能“拒绝 H₀”或“不拒绝 H₀”，不能“接受 H₀”。不拒绝 H₀ 不等于证明了 H₀ 为真——就像无罪判决不等于“无辜”，只是“证据不足”。",
        keyTakeaways: [
          "零假设假设没有效果，我们的目标是检验能否拒绝它",
          "单尾检验有方向性，双尾检验更常用",
          "不拒绝 H₀ 不等于接受 H₀——只是证据不足",
        ],
        quiz: {
          question: "关于零假设（H₀），以下说法正确的是？",
          options: [
            "H₀ 代表研究者想要证明的假设",
            "如果 p > 0.05，说明 H₀ 为真",
            "H₀ 通常假设两组之间没有差异",
            "每次实验只能有一个备择假设，不能有零假设",
          ],
          answer: 2,
        },
      },
      {
        id: "3",
        title: "P 值与显著性水平",
        duration: "20 min",
        content:
          "**P 值**的定义：在 H₀ 为真的前提下，观察到当前数据（或更极端数据）的概率。\n\n" +
          "常见误解：P = 0.03 不意味着“H₀ 有 3% 的概率为真”，也不意味着“效果有 97% 的概率存在”。它只是说：如果 H₀ 成立，出现这样结果的概率只有 3%——这太偶然了，所以我们倾向于拒绝 H₀。\n\n" +
          "**显著性水平 α**（通常设为 0.05）是我们的“决策门槛”：\n" +
          "- P < α → 拒绝 H₀ → “统计显著”\n" +
          "- P ≥ α → 不能拒绝 H₀ → “不显著”\n\n" +
          "**P 值的陷阱**：\n" +
          "- P = 0.049 vs P = 0.051 的差异毫无实质意义——不要把连续变量硬切成二元“显著/不显著”\n" +
          "- 大样本下极小的效果也能产生“显著”P 值——效应量同样重要\n" +
          "- P 值不能替代临床/生物学意义——统计显著 ≠ 有实际价值",
        keyTakeaways: [
          "P 值是在 H₀ 为真时观察到当前数据（或更极端）的概率",
          "P < 0.05 是常用门槛，但 0.049 与 0.051 无本质区别",
          "统计显著不等于有实际意义，需结合效应量判断",
        ],
        quiz: {
          question: "P = 0.03 意味着什么？",
          options: [
            "H₀ 为真的概率是 3%",
            "实验结果有 97% 的概率是正确的",
            "若 H₀ 成立，观察到当前结果的概率为 3%",
            "备择假设 H₁ 为真的概率是 97%",
          ],
          answer: 2,
        },
      },
      {
        id: "4",
        title: "t 检验：两组比较",
        duration: "20 min",
        content:
          "t 检验用于比较两组均值是否存在显著差异，是最基础的假设检验方法。\n\n" +
          "**独立样本 t 检验（Independent t-test）**：\n" +
          "适用于两组独立受试对象（如实验组 vs 对照组）。前提假设：两组方差齐性（可用 Levene 检验）、数据近似正态分布。\n\n" +
          "**配对 t 检验（Paired t-test）**：\n" +
          "适用于同一受试对象的前后比较（如给药前 vs 给药后）。它关注的是**差值**的均值，消除了个体间差异。\n\n" +
          "**何时不用 t 检验**：\n" +
          "- 三组及以上 → 用 ANOVA\n" +
          "- 数据严重偏离正态 → 用 Mann-Whitney U\n" +
          "- 方差不齐 → 用 Welch's t 检验\n\n" +
          "**报告规范**：\n" +
          "应报告 t 值、自由度(df)、P 值和效应量。例如：\"A 组肿瘤体积显著小于 B 组（t(18)=3.42, P=0.003, Cohen's d=1.08）\"。",
        keyTakeaways: [
          "独立样本 t 检验比较两组，配对 t 检验比较同一组的前后差异",
          "前提假设：正态性、方差齐性；不满足时用非参数检验",
          "报告时需包含 t 值、df、P 值和效应量",
        ],
        quiz: {
          question: "以下哪种情况应该使用配对 t 检验？",
          options: [
            "比较雄性 vs 雌性小鼠的肿瘤体积",
            "比较 10 名患者给药前后的血压",
            "比较三种药物的疗效",
            "比较不同实验室的数据",
          ],
          answer: 1,
        },
      },
      {
        id: "5",
        title: "方差分析（ANOVA）",
        duration: "25 min",
        content:
          "**单因素方差分析（One-way ANOVA）**用于比较三组或以上均值。它本质上是检验“组间差异是否远大于组内差异”——用 F 统计量（组间方差 / 组内方差）来量化。\n\n" +
          "**为什么不能多次用 t 检验**：如果做 3 组两两比较（3 次 t 检验），每次 α=0.05，则整体 I 类错误率膨胀到 1-(0.95)³≈14.3%。\n\n" +
          "**事后检验（Post-hoc Tests）**：ANOVA 只告诉你“至少有两组不同”，不告诉你“哪两组不同”。\n" +
          "- **Tukey HSD**：最常用，所有两两比较，控制族错误率\n" +
          "- **Bonferroni**：最保守，简单但可能漏掉真实差异\n" +
          "- **Dunnett**：所有组 vs 对照组（最高效）\n\n" +
          "**报告格式**：F(组间df, 组内df) = F值, P = p值。例如：F(2, 27) = 8.54, P = 0.001。",
        keyTakeaways: [
          "ANOVA 用于三组及以上均值比较，避免多次 t 检验导致 I 类错误膨胀",
          "ANOVA 只能说明'至少有差异'，具体哪两组不同需事后检验",
          "Tukey HSD 最常用，Dunnett 适合全部组 vs 对照的场景",
        ],
        quiz: {
          question: "为什么要用 ANOVA 而不是多次 t 检验来比较多组？",
          options: [
            "ANOVA 计算速度更快",
            "多次 t 检验会膨胀整体 I 类错误率",
            "ANOVA 不需要数据满足正态性",
            "ANOVA 可以直接给出两两比较的结果",
          ],
          answer: 1,
        },
      },
      {
        id: "6",
        title: "卡方检验与非参数检验",
        duration: "20 min",
        content:
          "**卡方检验（Chi-square Test）**用于分类变量的独立性检验。\n" +
          "例如：药物 A 和药物 B 各处理 50 人，比较有效/无效的频率是否不同。观察频数与期望频数的偏差越大，χ² 值越大，P 值越小。\n\n" +
          "**非参数检验**——当数据不满足正态性假设时的替代方案：\n" +
          "- **Mann-Whitney U 检验**：独立样本 t 检验的非参数替代（比较两组的秩次）\n" +
          "- **Wilcoxon 符号秩检验**：配对 t 检验的非参数替代\n" +
          "- **Kruskal-Wallis 检验**：单因素 ANOVA 的非参数替代\n\n" +
          "**非参数检验的代价**：检验功效（power）通常低于参数检验，因为只用了秩次信息而忽略了具体数值。所以如果数据满足正态性，优先用参数检验。\n\n" +
          "**选择策略**：先用 Shapiro-Wilk 检验正态性 → 正态则参数检验 → 否则非参数检验。",
        keyTakeaways: [
          "卡方检验适用于分类变量的独立性检验",
          "非参数检验不要求正态性，但检验功效通常低于参数检验",
          "先检验数据是否满足正态性，再决定使用参数还是非参数检验",
        ],
        quiz: {
          question: "以下哪种情况最适合使用非参数检验？",
          options: [
            "数据严格满足正态分布",
            "样本量大于 30 且方差齐性",
            "数据严重偏态，不符合正态分布",
            "需要进行三组间的两两比较",
          ],
          answer: 2,
        },
      },
      {
        id: "7",
        title: "多重比较校正",
        duration: "15 min",
        content:
          "当你同时检验多个假设时，犯 I 类错误（假阳性）的概率急剧增加。这就是**多重比较问题**。\n\n" +
          "**校正方法**：\n" +
          "- **Bonferroni 校正**：最简单——将 α 除以检验次数。检验 20 个基因，每次显著性阈值变为 0.05/20 = 0.0025。极其保守，适合检验次数较少时。\n" +
          "- **Benjamini-Hochberg（FDR）**：控制错误发现率而非族错误率。更宽松，适合高通量数据（如 RNA-seq 中检验上万个基因）。假阳性多一点，但不会错过太多真阳性。\n\n" +
          "**实际应用**：\n" +
          "- RT-qPCR 检测 5 个靶基因 → Bonferroni 足够\n" +
          "- RNA-seq 差异表达分析 → 必须用 FDR（否则几乎没有差异基因）\n" +
          "- 多时间点 Western Blot → 根据检验数量决定\n\n" +
          "**核心原则**：不是所有多重比较都需要校正——校正的是在同一数据集上同时进行的多重检验。",
        keyTakeaways: [
          "多重检验膨胀 I 类错误率，必须进行校正",
          "Bonferroni 最保守，FDR 更适合高通量数据",
          "校正方法选择取决于检验数量和分析目的",
        ],
        quiz: {
          question: "对 RNA-seq 中上万个基因的差异表达分析，最适合的多重比较校正方法是？",
          options: [
            "Bonferroni 校正",
            "不进行任何校正",
            "Benjamini-Hochberg（FDR）",
            "将 P 值阈值改为 0.1",
          ],
          answer: 2,
        },
      },
      {
        id: "8",
        title: "功效分析与样本量估算",
        duration: "20 min",
        content:
          "**统计功效（Power）= 1 - β**，其中 β 是 II 类错误率（漏掉真阳性）。Power = 0.8 意味着如果效果真实存在，有 80% 的概率能检测到它。\n\n" +
          "**影响功效的四个因素**：\n" +
          "1. **效应量（Effect Size）**：效果越大越容易检测\n" +
          "2. **样本量（n）**：样本越多功效越高\n" +
          "3. **显著性水平（α）**：α 越严格功效越低\n" +
          "4. **数据变异度**：变异越小功效越高\n\n" +
          "**样本量估算实战**（使用 G*Power 软件）：\n" +
          "- 输入：效应量 d=0.8（大）、α=0.05、Power=0.80\n" +
          "- 输出：每组需要 26 只（独立 t 检验）\n" +
          "- 如果效应量只有 d=0.5（中等），则每组需要 64 只\n\n" +
          "**常见错误**：先做实验再算样本量——这本质上是在“碰运气”。必须在实验前估算样本量，否则即使 P<0.05，结论也不可靠。",
        keyTakeaways: [
          "Power = 1 - β，通常要求 ≥ 0.80",
          "样本量估算需在实验前完成，不是事后补救",
          "G*Power 是免费的样本量计算工具，输入效应量/α/Power 即可",
        ],
        quiz: {
          question: "统计功效（Power）= 0.80 意味着什么？",
          options: [
            "如果 H₀ 为真，有 80% 的概率不会错误拒绝",
            "如果效果真实存在，有 80% 的概率能检测到它",
            "实验中有 80% 的数据是有效的",
            "有 80% 的把握认为 H₁ 为真",
          ],
          answer: 1,
        },
      },
    ],
  },

  // ─── 实验设计实战 (6) ────────────────────────────────────────────
  {
    id: "experimental-design",
    title: "实验设计实战",
    icon: "🧪",
    description: "对照、随机、重复——设计可重复的实验",
    lessons: [
      {
        id: "1",
        title: "实验设计三原则",
        duration: "15 min",
        content:
          "经典实验设计的三大基石——由 R.A. Fisher 提出——是所有可靠研究的基础：\n\n" +
          "**1. 重复（Replication）**：在相同条件下独立重复实验。重复不是“同一个样本测三次”，而是独立处理多只动物/多份样品。重复次数越多，估计越精确。\n\n" +
          "**2. 随机化（Randomization）**：将实验对象随机分配到各组，消除系统偏差。例如：体重较重的小鼠不应全部分配到对照组。\n\n" +
          "**3. 局部控制/区组化（Blocking）**：将已知的变异来源（如性别、年龄、批次）作为区组因素，在设计阶段控制。例如：将不同代次的细胞实验作为独立区组。\n\n" +
          "**为什么三者缺一不可**：\n" +
          "- 无重复 → 无法评估误差\n" +
          "- 无随机化 → 引入选择偏倚\n" +
          "- 无区组控制 → 噪声过大掩盖真实效果\n\n" +
          "好的实验设计比更大的样本量更能提高研究质量。",
        keyTakeaways: [
          "重复、随机化、区组化是实验设计的三大基石",
          "重复要求独立处理，不是同一份样品重复测量",
          "好的实验设计比单纯增加样本量更有效",
        ],
        quiz: {
          question: "以下哪项最准确地描述了“随机化”的目的？",
          options: [
            "让每只动物接受不同的处理",
            "让已知的混杂因素在各组间均衡分布",
            "减少实验中的随机误差",
            "增加实验的重复次数",
          ],
          answer: 1,
        },
      },
      {
        id: "2",
        title: "对照组的类型与选择",
        duration: "20 min",
        content:
          "对照组是实验的“基准线”——没有对照，你的处理效果无法评估。\n\n" +
          "**常见对照组类型**：\n" +
          "- **阴性对照（Negative Control）**：不接受处理，观察基线状态（如不做任何处理的空白组）\n" +
          "- **溶剂对照（Vehicle Control）**：给予等量溶剂（如 DMSO、生理盐水），排除溶剂本身的影响\n" +
          "- **阳性对照（Positive Control）**：给予已知有效的处理，验证实验体系是否正常工作\n" +
          "- **假手术对照（Sham Control）**：进行除关键步骤外的全部操作（如开腹但不切除器官），排除手术本身的创伤效应\n\n" +
          "**选择原则**：\n" +
          "- 溶剂对照是最常用的——任何药物实验都必须有\n" +
          "- 阳性对照在方法学建立阶段必不可少\n" +
          "- 假手术对照在动物实验中经常被忽略但非常重要\n\n" +
          "**常见错误**：忘记溶剂对照。用 DMSO 溶解药物处理实验组，但对照组什么都没加——如果 DMSO 本身有毒性，结果就是假阳性。",
        keyTakeaways: [
          "溶剂对照排除溶剂影响，是药物实验的基本要求",
          "阳性对照验证实验体系是否正常工作",
          "假手术对照排除手术操作本身对结果的影响",
        ],
        quiz: {
          question: "某实验用 DMSO 溶解药物处理细胞，以下哪个是正确的对照设计？",
          options: [
            "不做任何处理的空白对照",
            "加入等体积 DMSO 的溶剂对照",
            "加入其他药物的阳性对照",
            "减少药物浓度的剂量对照",
          ],
          answer: 1,
        },
      },
      {
        id: "3",
        title: "随机化与盲法",
        duration: "15 min",
        content:
          "**随机化方法**：\n" +
          "- **随机数表**：最经典的方法，每两位数一组对应编号\n" +
          "- **计算机生成随机序列**：用 Excel RANDBETWEEN、Python random.sample 或在线工具\n" +
          "- **分层随机化**：先按性别分层，再在各层内随机分配，确保组间性别比例均衡\n" +
          "- **区组随机化**：保证每 N 个样本中各组数量相同，避免样本分配不均\n\n" +
          "**盲法**——消除观察者和受试者偏倚：\n" +
          "- **单盲**：受试者不知道自己在实验组还是对照组（动物实验中 = 饲养员不知道分组）\n" +
          "- **双盲**：受试者和实验操作者都不知道分组（最理想）\n" +
          "- **三盲**：受试者、操作者、数据分析者都不知道（最高标准）\n\n" +
          "**实际操作**：由第三方准备编码样本（如 1号=A组，2号=B组），实验结束揭盲。",
        keyTakeaways: [
          "分层随机化确保已知混杂因素在组间均衡",
          "双盲设计同时消除受试者和操作者的偏倚",
          "使用第三方编码样本是实现盲法的实用方法",
        ],
        quiz: {
          question: "在动物实验中，“双盲”通常指哪两者不知道分组信息？",
          options: [
            "动物和统计软件",
            "实验动物（饲养条件）和操作者",
            "实验室负责人和数据分析师",
            "两只实验小鼠互相不知情",
          ],
          answer: 1,
        },
      },
      {
        id: "4",
        title: "样本量估算实战",
        duration: "25 min",
        content:
          "样本量估算是实验前的必做步骤，直接决定你的实验是否有能力检测到真实效果。\n\n" +
          "**核心公式要素**：\n" +
          "- 效应量（Effect Size）：预期的处理效果大小\n" +
          "- α（显著性水平）：通常 0.05\n" +
          "- Power（统计功效）：通常要求 ≥ 0.80\n" +
          "- 变异度（SD）：从预实验或文献获取\n\n" +
          "**G*Power 实战步骤**（独立 t 检验）：\n" +
          "1. 选择检验类型 → T tests → Means → Independent\n" +
          "2. 输入：Tail(s)=Two, Effect size d=0.8, α=0.05, Power=0.80\n" +
          "3. 结果：Total sample size = 52（每组 26 只）\n\n" +
          "**效应量参考标准**（Cohen's d）：\n" +
          "- Small: d = 0.2\n" +
          "- Medium: d = 0.5\n" +
          "- Large: d = 0.8\n\n" +
          "**预实验的价值**：用 5-6 只动物做预实验，估算 SD，代入正式计算。文献中的 SD 可能和你的实验条件差异很大。",
        keyTakeaways: [
          "样本量估算必须在实验前完成，预实验可提供效应量和变异度估计",
          "Cohen's d: 0.2/0.5/0.8 分别对应小/中/大效应",
          "G*Power 是免费工具，输入四个参数即可得出所需样本量",
        ],
        quiz: {
          question: "在 G*Power 中进行样本量估算时，以下哪个参数不是必需的？",
          options: [
            "效应量（Effect Size）",
            "显著性水平（α）",
            "研究者的学历背景",
            "统计功效（Power）",
          ],
          answer: 2,
        },
      },
      {
        id: "5",
        title: "剂量-反应实验设计",
        duration: "20 min",
        content:
          "剂量-反应（Dose-Response）实验用于确定药物的最佳剂量范围，是药理学和毒理学研究的核心。\n\n" +
          "**设计要点**：\n" +
          "- **剂量设置**：通常用等比稀释（如 0.1, 0.3, 1, 3, 10, 30, 100 μM），覆盖 3-4 个数量级\n" +
          "- **对数剂量 vs 线性剂量**：剂量用对数坐标排列，S 型曲线（sigmoid curve）在对数坐标下呈线性中段\n" +
          "- **浓度点数**：至少 5-7 个浓度，中间段加密（IC₅₀ 附近多设几个点）\n\n" +
          "**关键参数**：\n" +
          "- **IC₅₀/EC₅₀**：半数抑制/有效浓度\n" +
          "- **Emax**：最大效应\n" +
          "- **Hill 系数**：曲线陡度，反映剂量敏感性\n\n" +
          "**常用拟合模型**：四参数 Logistic 回归（4PL）\n" +
          "Response = Bottom + (Top - Bottom) / (1 + (IC₅₀/Concentration)^Hill)\n\n" +
          "**常见错误**：浓度点太少、IC₅₀ 附近未加密、未设零浓度对照。",
        keyTakeaways: [
          "等比稀释覆盖宽剂量范围，IC₅₀ 附近需加密浓度点",
          "IC₅₀、Emax、Hill 系数是剂量-反应曲线的三个核心参数",
          "四参数 Logistic 回归（4PL）是标准拟合模型",
        ],
        quiz: {
          question: "以下哪种剂量设置最适合初筛药物的 IC₅₀？",
          options: [
            "1, 2, 3, 4, 5 μM（等差稀释）",
            "0.1, 0.3, 1, 3, 10, 30, 100 μM（等比稀释）",
            "只用 10 和 100 μM 两个浓度",
            "0.001, 0.01, 0.1, 1, 10, 100, 1000 mM（跨 6 个数量级）",
          ],
          answer: 1,
        },
      },
      {
        id: "6",
        title: "时间序列实验设计",
        duration: "20 min",
        content:
          "时间序列设计关注处理效果随时间的变化规律，适用于药效动力学、肿瘤生长曲线、基因表达动态等场景。\n\n" +
          "**设计要点**：\n" +
          "- **时间点选择**：根据预期效果变化速度决定。急性药效可能需要分钟级，慢性观察可能需要周级\n" +
          "- **基线测量**：处理前至少 1-2 个时间点作为基线\n" +
          "- **时间点数量**：通常 5-8 个，变化剧烈的时段加密\n\n" +
          "**统计方法**：\n" +
          "- **重复测量 ANOVA（RM-ANOVA）**：经典方法，但要求球形假设（Mauchly 检验）\n" +
          "- **混合效应模型（Linear Mixed Model）**：更灵活，可处理缺失数据和不等间距\n" +
          "- **GEE（广义估计方程）**：适用于非正态数据\n\n" +
          "**肿瘤生长曲线实战**：\n" +
          "每隔 3-4 天测量肿瘤体积，持续 21-28 天。用 RM-ANOVA 比较各组的时间-肿瘤体积曲线差异。",
        keyTakeaways: [
          "基线测量和足够的时间点数是时间序列设计的关键",
          "RM-ANOVA 要求球形假设，混合效应模型更灵活",
          "时间点应加密在预期变化剧烈的时段",
        ],
        quiz: {
          question: "重复测量 ANOVA 相对于普通 ANOVA 的一个额外前提是？",
          options: [
            "数据需要服从正态分布",
            "各组样本量必须相等",
            "需要满足球形假设（Mauchly 检验）",
            "需要使用对数转换数据",
          ],
          answer: 2,
        },
      },
    ],
  },

  // ─── 细胞生物学实验 (6) ──────────────────────────────────────────
  {
    id: "cell-biology",
    title: "细胞生物学实验",
    icon: "🔬",
    description: "Western Blot、qPCR、流式细胞术——核心技能",
    lessons: [
      {
        id: "1",
        title: "细胞培养基础",
        duration: "15 min",
        content:
          "细胞培养是生物医学研究的基本功。掌握无菌操作是第一要务。\n\n" +
          "**无菌操作核心**：\n" +
          "- 操作前后 75% 酒精擦拭台面和手\n" +
          "- 所有物品进超净台前过酒精灯\n" +
          "- 瓶盖开合 45° 角，不放下盖子\n" +
          "- 操作时间控制在 20 分钟内\n\n" +
          "**传代（Passaging）要点**：\n" +
          "- 贴壁细胞：PBS 洗 → 胰酶消化（37°C, 1-3 min）→ 加完全培养基终止 → 离心重悬 → 分瓶\n" +
          "- 传代比例通常 1:2 至 1:6，取决于细胞生长速度\n" +
          "- 记录传代数——超过 30 代的细胞可能发生遗传漂变\n\n" +
          "**支原体检测（Mycoplasma Testing）**：\n" +
          "- 每月至少检测一次（PCR 法或荧光染色法 DAPI）\n" +
          "- 支原体污染无明显症状但会严重影响实验结果\n" +
          "- 预防：加 Plasmocin prophylactic 到培养基",
        keyTakeaways: [
          "无菌操作是细胞培养第一准则，操作时间控制在 20 分钟内",
          "记录传代数，超过 30 代的细胞可能发生遗传漂变",
          "支原体污染是最隐蔽的杀手，每月至少检测一次",
        ],
        quiz: {
          question: "贴壁细胞传代时，终止胰酶消化的方法是？",
          options: [
            "用 PBS 冲洗",
            "加入含血清的完全培养基",
            "用 75% 酒精处理",
            "直接在室温下等待失活",
          ],
          answer: 1,
        },
      },
      {
        id: "2",
        title: "Western Blot 完全指南",
        duration: "30 min",
        content:
          "Western Blot（免疫印迹）检测特定蛋白的表达量，是验证实验结果的“金标准”之一。\n\n" +
          "**完整流程（5 步）**：\n\n" +
          "**1. 样品制备**：\n" +
          "细胞裂解（RIPA buffer + 蛋白酶抑制剂）→ BCA 法测浓度 → 加上样缓冲液 → 95°C 煮 5 min\n\n" +
          "**2. SDS-PAGE 电泳**：\n" +
          "根据目标蛋白大小选择胶浓度（30-60 kDa 用 10%，60-150 kDa 用 8%）→ 80V 跑浓缩胶，120V 跑分离胶\n\n" +
          "**3. 转膜**：\n" +
          "PVDF 膜（甲醇激活）或 NC 膜 → 300mA 恒流转 90-120 min（湿转）→ 冰浴防过热\n\n" +
          "**4. 封闭 + 一抗**：\n" +
          "5% BSA 封闭 1h → 一抗 4°C 过夜（或室温 2h）→ TBST 洗 3×5min\n\n" +
          "**5. 二抗 + 显影**：\n" +
          "二抗室温 1h → TBST 洗 → ECL 发光 → 曝光成像\n\n" +
          "**常见问题排查**：无条带检查一抗浓度和转膜效率；背景过高优化封闭条件。",
        keyTakeaways: [
          "5 步流程：样品制备→电泳→转膜→抗体孵育→显影",
          "转膜效率是 WB 成败的关键，湿转时务必冰浴",
          "封闭用 5% BSA 比脱脂奶粉更适合磷酸化抗体",
        ],
        quiz: {
          question: "Western Blot 中，用 BSA 而非脱脂奶粉封闭的主要原因是？",
          options: [
            "BSA 价格更便宜",
            "BSA 的封闭效果更差但更稳定",
            "脱脂奶粉含有酪蛋白，会干扰磷酸化抗体的检测",
            "BSA 可以替代一抗的功能",
          ],
          answer: 2,
        },
      },
      {
        id: "3",
        title: "qPCR 实验设计与分析",
        duration: "25 min",
        content:
          "实时荧光定量 PCR（qPCR）定量检测 mRNA 表达水平，2⁻ΔΔCt 法是最常用的相对定量方法。\n\n" +
          "**实验流程**：\n" +
          "1. **RNA 提取**：TRIzol 法 → 逆转录（cDNA 合成）\n" +
          "2. **引物设计**：跨外显子连接处、扩增产物 80-200 bp、Tm 值 58-62°C\n" +
          "3. **qPCR 反应**：SYBR Green 或 TaqMan 探针法\n" +
          "4. **数据分析**：2⁻ΔΔCt 法\n\n" +
          "**2⁻ΔΔCt 法步骤**：\n" +
          "- ΔCt = Ct(目标基因) - Ct(内参基因)\n" +
          "- ΔΔCt = ΔCt(处理组) - ΔCt(对照组)\n" +
          "- 相对表达量 = 2⁻ΔΔCt\n\n" +
          "**验证要点**：\n" +
          "- 内参基因选择：GAPDH、β-actin 或 18S rRNA（需验证其在各组表达稳定）\n" +
          "- 溶解曲线检查：单一峰 = 无引物二聚体\n" +
          "- 需设 NTC（无模板对照）排查污染",
        keyTakeaways: [
          "引物跨外显子连接处设计，扩增产物 80-200 bp",
          "2⁻ΔΔCt 法相对定量，内参基因必须在各组表达稳定",
          "溶解曲线单峰确认无引物二聚体，NTC 排查污染",
        ],
        quiz: {
          question: "2⁻ΔΔCt 法中，ΔCt 的计算公式是？",
          options: [
            "Ct(内参基因) - Ct(目标基因)",
            "Ct(目标基因) - Ct(内参基因)",
            "Ct(处理组) - Ct(对照组)",
            "Ct(NTC) - Ct(样品)",
          ],
          answer: 1,
        },
      },
      {
        id: "4",
        title: "流式细胞术入门",
        duration: "25 min",
        content:
          "流式细胞术（Flow Cytometry）可在单细胞水平同时检测多个参数，是免疫学和肿瘤学的核心工具。\n\n" +
          "**基础参数**：\n" +
          "- **FSC（前向散射）**：反映细胞大小\n" +
          "- **SSC（侧向散射）**：反映细胞内部复杂度（颗粒度）\n" +
          "- **荧光通道**：检测标记在抗体上的荧光素\n\n" +
          "**实验流程**：\n" +
          "1. 细胞制备（单细胞悬液，2-5×10⁶/mL）\n" +
          "2. 抗体标记（表面染色 +/胞内染色）\n" +
          "3. 上机采集（采集 10,000-100,000 个细胞）\n" +
          "4. 数据分析（FlowJo / FCS Express）\n\n" +
          "**荧光补偿（Compensation）**：不同荧光素的发射光谱会重叠，需要用补偿矩阵校正。单染对照管是必需的。\n\n" +
          "**设门策略（Gating）**：\n" +
          "依次设门排除死细胞 → 排除碎片 → 选定目标群体 → 分析子群比例。",
        keyTakeaways: [
          "FSC 反映细胞大小，SSC 反映细胞内部复杂度",
          "荧光补偿是必需步骤，用单染对照管建立补偿矩阵",
          "设门策略：排除死细胞→排除碎片→选定目标群体→分析子群",
        ],
        quiz: {
          question: "流式细胞术中，SSC（侧向散射）主要反映什么信息？",
          options: [
            "细胞大小",
            "细胞内部复杂度和颗粒度",
            "细胞的荧光强度",
            "细胞膜的通透性",
          ],
          answer: 1,
        },
      },
      {
        id: "5",
        title: "ELISA 实验要点",
        duration: "20 min",
        content:
          "ELISA（酶联免疫吸附测定）用于定量检测蛋白浓度，是检测细胞因子、激素等可溶性蛋白的常用方法。\n\n" +
          "**Sandwich ELISA 流程**（最常用）：\n" +
          "1. 包被抗体包被 96 孔板 → 4°C 过夜\n" +
          "2. 封闭 → 加样品 → 一抗孵育 → 酶标二底物显色 → 读 OD 值\n\n" +
          "**标准曲线**：\n" +
          "- 使用已知浓度的标准品系列（通常 7-8 个浓度点）\n" +
          "- 绘制标准曲线（通常用 4PL 拟合）\n" +
          "- 样品 OD 值落在标准曲线范围内才能计算浓度\n\n" +
          "**变异系数（CV）**：\n" +
          "- CV = SD/均值 × 100%\n" +
          "- 同一样品的重复孔 CV 应 < 10%\n" +
          "- CV > 15% 的数据不可信\n\n" +
          "**常见错误**：标准曲线范围与样品浓度不匹配；孵育时间不统一；洗涤不充分导致高背景。",
        keyTakeaways: [
          "Sandwich ELISA 用两种抗体夹住目标蛋白，特异性最高",
          "标准曲线的拟合质量直接决定定量准确性",
          "重复孔 CV < 10% 为合格，> 15% 需重新实验",
        ],
        quiz: {
          question: "ELISA 实验中，同一稀释度的两个重复孔之间的 CV 值为 18%，应该怎么办？",
          options: [
            "结果可接受，直接使用",
            "删除异常值后直接报告",
            "实验不可信，需要重新做",
            "将两个值取平均即可",
          ],
          answer: 2,
        },
      },
      {
        id: "6",
        title: "免疫荧光与共聚焦",
        duration: "25 min",
        content:
          "免疫荧光（IF）结合共聚焦显微镜可以实现蛋白的亚细胞定位观察，是形态学分析的利器。\n\n" +
          "**实验流程**：\n" +
          "1. **固定（Fixation）**：4% PFA 室温 15 min → 维持细胞形态和蛋白抗原性\n" +
          "2. **通透化（Permeabilization）**：0.1% Triton X-100 或 0.3% Saponin → 打开细胞膜让抗体进入\n" +
          "3. **封闭（Blocking）**：5% BSA 或 10% 正常血清 → 减少非特异性结合\n" +
          "4. **一抗孵育**：4°C 过夜 → 特异性识别目标蛋白\n" +
          "5. **二抗孵育**：室温避光 1h → 荧光标记二抗\n" +
          "6. **核染色**：DAPI 或 Hoechst 染核 10 min\n\n" +
          "**共聚焦显微镜要点**：\n" +
          "- Z-stack：获取不同焦平面的图像，重建三维信息\n" +
          "- 激光功率和增益需要优化——过高会导致光漂白和高背景\n" +
          "- 多色成像：按荧光波长依次扫描，避免通道串色\n\n" +
          "**常见问题**：背景过高→优化封闭；无信号→检查固定条件和一抗稀释度。",
        keyTakeaways: [
          "IF 流程：固定→通透→封闭→一抗→二抗→核染色→成像",
          "Z-stack 可获取不同焦平面信息，重建蛋白三维定位",
          "固定剂选择很关键：PFA 适合大多数抗原，甲醇适合部分核蛋白",
        ],
        quiz: {
          question: "在免疫荧光实验中，为什么需要进行“通透化”处理？",
          options: [
            "为了让细胞更容易固定",
            "为了让荧光染料更容易进入细胞核",
            "为了让抗体能够穿过细胞膜进入胞内",
            "为了增加细胞膜的荧光强度",
          ],
          answer: 2,
        },
      },
    ],
  },

  // ─── SCI 论文写作 (6) ────────────────────────────────────────────
  {
    id: "paper-writing",
    title: "SCI 论文写作",
    icon: "📝",
    description: "从图表到投稿——写出有说服力的论文",
    lessons: [
      {
        id: "1",
        title: "科研图表设计原则",
        duration: "20 min",
        content:
          "好的图表应该能独立讲述一个完整的故事——即使读者不看正文，也能通过图表和图注理解核心发现。\n\n" +
          "**配色原则**：\n" +
          "- 使用色盲友好的配色（如 RColorBrewer、ColorBrewer）\n" +
          "- 避免红绿同时出现（色盲最常见类型）\n" +
          "- 一组图表最多用 6-8 种颜色\n" +
          "- 推荐工具：Coblis（色盲模拟器）\n\n" +
          "**字体与尺寸**：\n" +
          "- 字体大小 ≥ 6pt（最终输出后）\n" +
          "- 推荐 Arial 或 Helvetica（多数期刊要求）\n" +
          "- 图注字号略小于正文\n\n" +
          "**图表类型选择**：\n" +
          "- 两组比较 → 柱状图 + 散点 + 误差线（推荐）\n" +
          "- 多组比较 → 箱线图或小提琴图\n" +
          "- 相关性 → 散点图 + 回归线\n" +
          "- 趋势 → 折线图 + 误差带\n\n" +
          "**期刊要求**：投稿前务必查看目标期刊的图稿要求（分辨率 ≥ 300 dpi，格式 TIFF/EPS）。",
        keyTakeaways: [
          "图表应能独立讲述故事，配色需色盲友好",
          "字体 ≥ 6pt，推荐 Arial，分辨率 ≥ 300 dpi",
          "柱状图 + 散点 + 误差线比纯柱状图更透明",
        ],
        quiz: {
          question: "以下哪种图表设计在 SCI 论文中最推荐？",
          options: [
            "只有柱状图（Bar chart），不显示个体数据点",
            "柱状图 + 个体散点 + 误差线",
            "饼图展示各组比例",
            "3D 效果的柱状图",
          ],
          answer: 1,
        },
      },
      {
        id: "2",
        title: "Results 的逻辑组织",
        duration: "20 min",
        content:
          "Results 部分是论文的核心——用数据讲故事。逻辑清晰的 Results 能让审稿人快速抓住重点。\n\n" +
          "**组织原则**：\n" +
          "- **按逻辑链排列**，不是按实验顺序\n" +
          "- 最重要的发现放最前面（inverted pyramid 倒金字塔结构）\n" +
          "- 每段围绕一个发现，配一个图/表\n\n" +
          "**经典结构**：\n" +
          "1. 表型/表征数据（证明现象存在）\n" +
          "2. 机制数据（解释为什么）\n" +
          "3. 功能验证（证明因果关系）\n\n" +
          "**统计结果的规范报告**：\n" +
          "- 报告统计量：\"t(18) = 3.42, P = 0.003\"\n" +
          "- 报告效应量：\"Cohen's d = 1.08\"\n" +
          "- 描述性语言配合数字：\"A 组显著高于 B 组（35.2 ± 4.1 vs 22.7 ± 3.8, P = 0.003）\"\n\n" +
          "**常见错误**：罗列实验过程而不突出结论；图表编号混乱；把 Methods 内容搬到 Results。",
        keyTakeaways: [
          "按逻辑链排列而非实验时间顺序，最重要的发现放最前面",
          "每段一个发现、一个图/表，统计量和效应量都要报告",
          "Results 只呈现数据和结论，不重复 Methods 内容",
        ],
        quiz: {
          question: "Results 部分应该按什么顺序组织内容？",
          options: [
            "按实验开展的时间先后顺序",
            "按图/表编号顺序",
            "按逻辑链——最重要的发现放最前面",
            "按统计显著性从低到高排列",
          ],
          answer: 2,
        },
      },
      {
        id: "3",
        title: "Introduction 的漏斗结构",
        duration: "15 min",
        content:
          "Introduction 的目标是：让读者理解“为什么要做这个研究”。经典的**漏斗结构（Funnel Structure）**从宽到窄：\n\n" +
          "**4 段式结构**：\n\n" +
          "**第 1 段：大背景**（Broad Context）\n" +
          "介绍领域的整体情况。例如：\"癌症是全球主要死因之一，其中实体瘤微环境在肿瘤进展中扮演关键角色。\"\n\n" +
          "**第 2 段：具体领域**（Specific Focus）\n" +
          "聚焦到你的具体研究方向。例如：\"肿瘤相关巨噬细胞（TAM）是肿瘤微环境中最丰富的免疫细胞...\"\n\n" +
          "**第 3 段：知识空白**（Knowledge Gap）\n" +
          "指出当前研究的不足。例如：\"然而，TAM 代谢重编程如何调控免疫逃逸的机制尚不清楚。\"\n\n" +
          "**第 4 段：研究目的**（Hypothesis & Aim）\n" +
          "明确提出假设和目的。例如：\"本研究旨在探究...，我们假设...\"\n\n" +
          "**技巧**：每一段的最后一个句子应该是下一段的桥梁。",
        keyTakeaways: [
          "漏斗结构：大背景→具体领域→知识空白→研究目的",
          "知识空白是核心——它证明你的研究有存在的价值",
          "每段末句应是下一段的桥梁，保持逻辑连贯",
        ],
        quiz: {
          question: "Introduction 漏斗结构的第 3 段应该写什么？",
          options: [
            "介绍实验方法和统计分析",
            "详细描述研究结果",
            "指出当前研究的知识空白",
            "总结全文的主要结论",
          ],
          answer: 2,
        },
      },
      {
        id: "4",
        title: "Discussion 的深度解读",
        duration: "25 min",
        content:
          "Discussion 是论文中最具挑战性的部分——需要把你的发现放入更大的学术背景中。\n\n" +
          "**经典结构**：\n\n" +
          "**1. 核心发现回顾**（1 段）：\n" +
          "简要重述主要发现和假设验证结果。不是重复 Results，而是提炼核心信息。\n\n" +
          "**2. 与已有文献对比**（2-3 段）：\n" +
          "- 一致的发现：\"这与 Smith et al. 的研究一致...\"\n" +
          "- 不一致的发现：\"与 Jones 的报道不同，我们发现...这可能是因为...\"\n" +
          "- 深入讨论差异的可能原因（方法差异、模型差异、样本差异）\n\n" +
          "**3. 机制探讨**（1-2 段）：\n" +
          "从已知的生物学知识出发，提出可能的机制解释。\n\n" +
          "**4. 研究局限性**（1 段）：\n" +
          "诚实但策略性地讨论局限性。每个局限后面跟一句如何缓解或未来计划。\n\n" +
          "**5. 未来方向与意义**（1 段）：\n" +
          "提出具体的后续研究方向和临床/应用意义。",
        keyTakeaways: [
          "Discussion 按顺序：回顾→文献对比→机制→局限→未来方向",
          "不一致的发现要深入讨论原因，这是展示分析深度的机会",
          "局限性要诚实但策略性地讨论，每个局限后跟缓解方案",
        ],
        quiz: {
          question: "Discussion 部分讨论研究局限性时，最佳策略是？",
          options: [
            "忽略局限性以免降低论文说服力",
            "列出所有局限但不做任何回应",
            "诚实讨论局限性，每个局限后附上缓解方案或未来方向",
            "把所有局限都归咎于样本量不足",
          ],
          answer: 2,
        },
      },
      {
        id: "5",
        title: "引用管理实战",
        duration: "15 min",
        content:
          "规范的引用管理不仅是学术诚信的要求，也是提高写作效率的利器。\n\n" +
          "**Zotero 入门**：\n" +
          "- 免费开源的文献管理工具，支持浏览器插件一键抓取\n" +
          "- 安装 Word/LibreOffice 插件，在写作时直接插入引用\n" +
          "- 用集合（Collection）管理不同课题的文献\n" +
          "- 标签（Tag）系统可以做多维分类\n\n" +
          "**引用格式**：\n" +
          "- APA：心理学、社会科学常用\n" +
          "- Vancouver（编号制）：生物医学最常用\n" +
          "- Nature/Science 格式：脚注制\n" +
          "- 期刊投稿前查看目标期刊的具体要求\n\n" +
          "**常见问题**：\n" +
          "- 同一篇文献多处引用 → Zotero 自动处理\n" +
          "- 更改引用风格 → Zotero 一键切换\n" +
          "- DOI 链接 → 在 Zotero 中自动更新元数据\n\n" +
          "**最佳实践**：写作时即时引用，不要写完再回头找文献。养成随手记录参考文献的习惯。",
        keyTakeaways: [
          "Zotero 是免费开源的文献管理工具，支持一键抓取和引用插入",
          "生物医学论文最常用 Vancouver 编号制，投稿前确认目标期刊格式",
          "写作时即时引用，不要写完再回头找文献",
        ],
        quiz: {
          question: "以下哪种文献管理工具是免费开源的，且支持浏览器插件一键抓取？",
          options: [
            "EndNote",
            "Zotero",
            "Mendeley（Elsevier 版）",
            "PubMed Central",
          ],
          answer: 1,
        },
      },
      {
        id: "6",
        title: "投稿与回复审稿意见",
        duration: "20 min",
        content:
          "投稿和回复审稿意见是发表论文的最后一关，策略性应对可以大幅提高录用率。\n\n" +
          "**Cover Letter 要点**：\n" +
          "- 简明扼要（不超过 1 页）\n" +
          "- 核心信息：研究了什么、发现了什么、为什么适合本期刊\n" +
          "- 强调创新性和意义\n" +
          "- 建议审稿人 2-3 位（排除利益冲突者）\n\n" +
          "**审稿意见回复策略**：\n" +
          "- **逐条回复**：每个问题用引用编号标记，确保没有遗漏\n" +
          "- **态度诚恳**：即使不同意，先感谢再解释\n" +
          "- **证据充分**：补实验或引用文献支持你的观点\n" +
          "- **修改用红色**：让审稿人快速找到改动之处\n\n" +
          "**回复格式**：\n" +
          "Reviewer #1, Comment 1: \"请补充样本量估算的依据\"\n\n" +
          "Response: 感谢审稿人的建议。我们在修订稿的 Methods 部分补充了样本量估算细节...(引用文献)...修改后的文本在第 X 页第 X 行，已用红色标出。\n\n" +
          "**关键心态**：审稿意见是免费的专家咨询，每一次认真回复都在提高论文质量。",
        keyTakeaways: [
          "Cover Letter 突出创新性和适合本期刊的理由",
          "审稿意见逐条回复，态度诚恳，证据充分",
          "审稿意见是免费的专家咨询，认真回复提高论文质量",
        ],
        quiz: {
          question: "回复审稿意见时，如果不同意审稿人的观点，最佳做法是？",
          options: [
            "忽略该条意见，不作回应",
            "直接反驳，不需要引用证据",
            "先感谢审稿人的建议，再用文献或数据支持你的观点",
            "删除被质疑的实验结果",
          ],
          answer: 2,
        },
      },
    ],
  },
];

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function CoursesPage() {
  /* ---- view state ---- */
  type View = "list" | "lessons" | "detail";
  const [view, setView] = useState<View>("list");
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [selectedLessonId, setSelectedLessonId] = useState<string | null>(null);

  /* ---- progress ---- */
  const [progress, setProgress] = useState<Record<string, Record<string, string>>>({});
  const [quizSelections, setQuizSelections] = useState<Record<string, number | null>>({});
  const [quizSubmitted, setQuizSubmitted] = useState<Record<string, boolean>>({});

  /* ---- helpers ---- */
  const currentCourse = COURSES.find((c) => c.id === selectedCourseId) ?? null;
  const currentLesson = currentCourse?.lessons.find((l) => l.id === selectedLessonId) ?? null;

  const isCompleted = (courseId: string, lessonId: string) =>
    progress[courseId]?.[lessonId] === "completed";

  const courseCompletionCount = (courseId: string, _total: number) => {
    const courseProgress = progress[courseId];
    if (!courseProgress) return 0;
    return Object.values(courseProgress).filter((s) => s === "completed").length;
  };

  /* ---- load progress on mount ---- */
  useEffect(() => {
    fetch("/api/courses/progress")
      .then((r) => r.json())
      .then((data: { progress?: ProgressEntry[] }) => {
        if (!data.progress) return;
        const map: Record<string, Record<string, string>> = {};
        for (const entry of data.progress) {
          if (!map[entry.courseId]) map[entry.courseId] = {};
          map[entry.courseId][entry.lessonId] = entry.status;
        }
        setProgress(map);
      })
      .catch((err) => {
        console.error("[Courses] Failed to load progress:", err);
        /* graceful: stay with empty progress */
      });
  }, []);

  /* ---- mark lesson complete ---- */
  const markComplete = useCallback(
    async (courseId: string, lessonId: string) => {
      // optimistic update
      setProgress((prev) => ({
        ...prev,
        [courseId]: { ...(prev[courseId] ?? {}), [lessonId]: "completed" },
      }));

      try {
        await fetch("/api/courses/progress", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ courseId, lessonId, status: "completed" }),
        });
      } catch {
        /* optimistic update already applied */
      }
    },
    [],
  );

  /* ---- navigation ---- */
  const openCourse = (courseId: string) => {
    setSelectedCourseId(courseId);
    setSelectedLessonId(null);
    setView("lessons");
  };

  const openLesson = (lessonId: string) => {
    setSelectedLessonId(lessonId);
    setView("detail");
  };

  const backToCourseList = () => {
    setView("list");
    setSelectedCourseId(null);
    setSelectedLessonId(null);
  };

  const backToLessonList = () => {
    setView("lessons");
    setSelectedLessonId(null);
  };

  /* ---- quiz logic ---- */
  const handleQuizSelect = (lessonKey: string, optionIndex: number) => {
    if (quizSubmitted[lessonKey]) return;
    setQuizSelections((prev) => ({ ...prev, [lessonKey]: optionIndex }));
  };

  const submitQuiz = (lessonKey: string) => {
    setQuizSubmitted((prev) => ({ ...prev, [lessonKey]: true }));
  };

  const resetQuiz = (lessonKey: string) => {
    setQuizSelections((prev) => ({ ...prev, [lessonKey]: null }));
    setQuizSubmitted((prev) => ({ ...prev, [lessonKey]: false }));
  };

  /* ================================================================ */
  /*  RENDER                                                           */
  /* ================================================================ */

  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex-1 overflow-y-auto bg-gray-50">
        <div className="p-8 max-w-4xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-2xl font-bold">🎓 科研设计实战课</h1>
            <p className="text-gray-500 mt-1">从统计基础到论文写作，系统提升科研技能</p>
          </div>

          {/* ───────── Course List View ───────── */}
          {view === "list" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {COURSES.map((course) => {
                const completed = courseCompletionCount(course.id, course.lessons.length);
                const total = course.lessons.length;
                const pct = Math.round((completed / total) * 100);

                return (
                  <button
                    key={course.id}
                    onClick={() => openCourse(course.id)}
                    className="text-left p-6 bg-white border border-gray-200 rounded-xl hover:border-blue-300 hover:shadow-sm transition-all"
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-2xl">{course.icon}</span>
                      <h3 className="font-semibold">{course.title}</h3>
                    </div>
                    <p className="text-sm text-gray-500 mb-3">{course.description}</p>

                    <div className="flex items-center gap-3 mb-1">
                      <div className="flex-1 bg-gray-200 rounded-full h-1.5">
                        <div
                          className="bg-blue-500 h-1.5 rounded-full transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-xs text-gray-400">
                        {completed}/{total}
                      </span>
                    </div>

                    {completed > 0 && completed < total && (
                      <p className="text-xs text-blue-500 mt-1">继续学习</p>
                    )}
                    {completed === total && (
                      <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                        <Check size={12} /> 全部完成
                      </p>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* ───────── Lesson List View ───────── */}
          {view === "lessons" && currentCourse && (
            <div>
              <button
                onClick={backToCourseList}
                className="text-sm text-blue-600 hover:underline mb-4 flex items-center gap-1"
              >
                <ChevronLeft size={14} /> 返回课程列表
              </button>

              <div className="bg-white border border-gray-200 rounded-xl p-6">
                <div className="flex items-center gap-3 mb-4">
                  <span className="text-3xl">{currentCourse.icon}</span>
                  <div>
                    <h2 className="text-xl font-bold">{currentCourse.title}</h2>
                    <p className="text-sm text-gray-500">{currentCourse.description}</p>
                  </div>
                </div>

                {/* progress bar */}
                <div className="mb-4">
                  {(() => {
                    const completed = courseCompletionCount(
                      currentCourse.id,
                      currentCourse.lessons.length,
                    );
                    const total = currentCourse.lessons.length;
                    const pct = Math.round((completed / total) * 100);
                    return (
                      <div className="flex items-center gap-3">
                        <div className="flex-1 bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-blue-500 h-2 rounded-full transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-400">
                          {completed}/{total} 完成
                        </span>
                      </div>
                    );
                  })()}
                </div>

                <div className="text-xs text-gray-400 mb-4">
                  {currentCourse.lessons.length} 节课 · 共约{" "}
                  {currentCourse.lessons.reduce((sum, l) => sum + parseInt(l.duration), 0)}{" "}
                  分钟
                </div>

                <div className="space-y-2">
                  {currentCourse.lessons.map((lesson, i) => {
                    const done = isCompleted(currentCourse.id, lesson.id);
                    return (
                      <button
                        key={lesson.id}
                        onClick={() => openLesson(lesson.id)}
                        className="w-full flex items-center gap-4 p-4 border border-gray-100 rounded-lg hover:border-blue-200 transition-colors text-left"
                      >
                        <div
                          className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium shrink-0 ${
                            done
                              ? "bg-green-100 text-green-600"
                              : "bg-gray-100 text-gray-500"
                          }`}
                        >
                          {done ? "✓" : i + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{lesson.title}</div>
                          <div className="text-xs text-gray-400 mt-0.5 line-clamp-1">
                            {lesson.content.slice(0, 60)}...
                          </div>
                        </div>
                        <span className="text-xs text-gray-400 shrink-0">
                          {lesson.duration}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ───────── Lesson Detail View ───────── */}
          {view === "detail" && currentCourse && currentLesson && (
            <div>
              <button
                onClick={backToLessonList}
                className="text-sm text-blue-600 hover:underline mb-4 flex items-center gap-1"
              >
                <ChevronLeft size={14} /> 返回 {currentCourse.title}
              </button>

              {/* lesson number & title */}
              <div className="mb-6">
                <p className="text-xs text-gray-400 mb-1">
                  {currentCourse.icon} {currentCourse.title}
                </p>
                <h2 className="text-xl font-bold">{currentLesson.title}</h2>
                <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
                  <span className="flex items-center gap-1">
                    <BookOpen size={12} /> {currentLesson.duration}
                  </span>
                  {isCompleted(currentCourse.id, currentLesson.id) && (
                    <span className="flex items-center gap-1 text-green-600">
                      <Check size={12} /> 已完成
                    </span>
                  )}
                </div>
              </div>

              {/* content */}
              <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6">
                <h3 className="font-semibold text-sm text-gray-700 mb-3 flex items-center gap-1.5">
                  <BookOpen size={14} /> 课程内容
                </h3>
                <div className="prose prose-sm max-w-none text-gray-700 leading-relaxed whitespace-pre-line">
                  {currentLesson.content.split("\n\n").map((paragraph, pi) => (
                    <p key={pi} className="mb-3">
                      {paragraph.split("**").map((seg, si) =>
                        si % 2 === 1 ? (
                          <strong key={si} className="text-gray-900">
                            {seg}
                          </strong>
                        ) : (
                          <span key={si}>{seg}</span>
                        ),
                      )}
                    </p>
                  ))}
                </div>
              </div>

              {/* key takeaways */}
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-6 mb-6">
                <h3 className="font-semibold text-sm text-blue-800 mb-3 flex items-center gap-1.5">
                  <Award size={14} /> 核心要点
                </h3>
                <ul className="space-y-2">
                  {currentLesson.keyTakeaways.map((point, i) => (
                    <li key={i} className="flex gap-2 text-sm text-blue-900">
                      <span className="font-bold text-blue-600 shrink-0">{i + 1}.</span>
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* quiz */}
              {currentLesson.quiz && (() => {
                const q = currentLesson.quiz!;
                const lessonKey = `${currentCourse.id}-${currentLesson.id}`;
                const selection = quizSelections[lessonKey] ?? null;
                const submitted = quizSubmitted[lessonKey] ?? false;
                const isCorrect = selection === q.answer;

                return (
                  <div className="bg-amber-50 border border-amber-100 rounded-xl p-6 mb-6">
                    <h3 className="font-semibold text-sm text-amber-800 mb-3 flex items-center gap-1.5">
                      <HelpCircle size={14} /> 随堂测验
                    </h3>
                    <p className="text-sm text-amber-900 font-medium mb-4">{q.question}</p>
                    <div className="space-y-2 mb-4">
                      {q.options.map((opt, oi) => {
                        const isSelected = selection === oi;
                        const showCorrect = submitted && oi === q.answer;
                        const showWrong = submitted && isSelected && !isCorrect;

                        let optClass =
                          "w-full text-left px-4 py-2.5 text-sm rounded-lg border transition-all ";
                        if (!submitted) {
                          optClass += isSelected
                            ? "border-amber-400 bg-amber-100"
                            : "border-amber-200 bg-white hover:bg-amber-50";
                        } else if (showCorrect) {
                          optClass += "border-green-400 bg-green-50 text-green-800";
                        } else if (showWrong) {
                          optClass += "border-red-300 bg-red-50 text-red-700";
                        } else {
                          optClass += "border-amber-200 bg-white text-gray-500";
                        }

                        return (
                          <button
                            key={oi}
                            onClick={() => handleQuizSelect(lessonKey, oi)}
                            className={optClass}
                            disabled={submitted}
                          >
                            <span className="font-medium mr-2">
                              {String.fromCharCode(65 + oi)}.
                            </span>
                            {opt}
                          </button>
                        );
                      })}
                    </div>
                    <div className="flex items-center gap-3">
                      {!submitted ? (
                        <button
                          onClick={() => submitQuiz(lessonKey)}
                          disabled={selection === null}
                          className="px-4 py-2 text-sm font-medium bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                          提交答案
                        </button>
                      ) : (
                        <>
                          <span
                            className={`text-sm font-medium ${isCorrect ? "text-green-700" : "text-red-600"}`}
                          >
                            {isCorrect ? "✓ 回答正确！" : "✗ 回答错误，正确答案是 " + String.fromCharCode(65 + q.answer)}
                          </span>
                          <button
                            onClick={() => resetQuiz(lessonKey)}
                            className="ml-auto text-xs text-amber-600 hover:underline"
                          >
                            重新作答
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* mark complete button */}
              <div className="flex items-center justify-between">
                <button
                  onClick={backToLessonList}
                  className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
                >
                  <ChevronLeft size={14} /> 返回目录
                </button>

                {isCompleted(currentCourse.id, currentLesson.id) ? (
                  <div className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-green-700 bg-green-50 border border-green-200 rounded-lg">
                    <Check size={16} /> 已完成
                  </div>
                ) : (
                  <button
                    onClick={() => markComplete(currentCourse.id, currentLesson.id)}
                    className="px-5 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    标记完成
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
