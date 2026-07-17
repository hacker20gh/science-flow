/**
 * 将 LLM 提取结果转换为数据库 Extraction 记录的数据
 */
export function mapExtractionToDB(experiment: Record<string, unknown>, paperId: string) {
  // 兼容新 (intervention) 和旧 (drug_intervention) 字段名
  const iv = (experiment.intervention || experiment.drug_intervention) as Record<string, unknown> | undefined;

  // 计算实验分层标签
  const tier = getExperimentTierFromType(experiment.experiment_type as string | undefined);

  return {
    paperId,
    drugName: iv?.target || iv?.name || null,
    drugConc: iv?.concentration || null,
    duration: iv?.duration || null,
    coTreatment: iv?.co_treatment || null,
    cellLine: (experiment.model as Record<string, unknown>)?.cell_line || null,
    species: (experiment.model as Record<string, unknown>)?.species || null,
    passage: (experiment.model as Record<string, unknown>)?.passage || null,
    pathway: (experiment.pathway_effects as Record<string, unknown>[])?.[0]?.pathway || null,
    pathwayDir: (experiment.pathway_effects as Record<string, unknown>[])?.[0]?.direction || null,
    phenotype: (experiment.phenotype_effects as Record<string, unknown>[])?.[0]?.phenotype || null,
    phenotypeDir: (experiment.phenotype_effects as Record<string, unknown>[])?.[0]?.direction || null,
    method: experiment.statistical_test || null,
    expMethod: (experiment.pathway_effects as Record<string, unknown>[])?.[0]?.method || null,
    conclusion: experiment.conclusion || null,
    rawText: experiment.evidence_quote || null,
    pathwayEffects: experiment.pathway_effects || undefined,
    phenotypeEffects: experiment.phenotype_effects || undefined,
    controls: experiment.controls || undefined,
    sampleSize: experiment.sample_size || null,
    confidence: experiment.confidence ?? null,
    experimentType: experiment.experiment_type || null,
    experimentMethods: experiment.experiment_methods || undefined,
    ic50: experiment.ic50 || null,
    // 新增字段
    doseResponse: experiment.dose_response || undefined,
    mechanisticChain: experiment.mechanistic_chain || undefined,
    interventionType: iv?.type || "drug",
    interventionMethod: iv?.method || null,
    experimentTier: tier,
    experimentRole: experiment.role || null,
    conclusionIndex: (experiment as Record<string, unknown>).conclusionIndex ?? null,
    conclusionClaim: (experiment as Record<string, unknown>).conclusionClaim || null,
    evidenceFigure: experiment.evidence_figure || null,
    evidenceTable: experiment.evidence_table || null,
  };
}

/**
 * 从 experiment_type 推断实验分层标签
 */
function getExperimentTierFromType(experimentType?: string | null): string {
  switch (experimentType) {
    case "cell_line":
    case "primary_cell":
    case "organoid":
    case "tissue_slice":
      return "in_vitro";
    case "animal_model":
    case "xenograft":
      return "in_vivo";
    case "patient_sample":
    case "clinical_trial":
    case "clinical_obs":
    case "case_report":
      return "clinical";
    case "bioinformatics":
    case "omics":
    case "meta_analysis":
    case "review":
      return "computational";
    default:
      return "in_vitro";
  }
}

/**
 * 从 LLM 提取结果中获取关系型通路/表型效果数据
 * 用于创建 Extraction 后批量创建关联的 PathwayEffect / PhenotypeEffect 记录
 */
export function extractRelationalEffects(experiment: Record<string, unknown>): {
  pathwayEffects: Array<{ pathway: string; direction: string; significance: string | null; method: string | null; foldChange: string | null }>;
  phenotypeEffects: Array<{ phenotype: string; direction: string; foldChange: string | null }>;
} {
  const pathwayEffects = ((experiment.pathway_effects as Record<string, unknown>[]) || []).map(pe => ({
    pathway: (pe.pathway as string) || "",
    direction: (pe.direction as string) || "no_change",
    significance: (pe.significance as string) || null,
    method: (pe.method as string) || null,
    foldChange: (pe.fold_change as string) || null,
  }));

  const phenotypeEffects = ((experiment.phenotype_effects as Record<string, unknown>[]) || []).map(ph => ({
    phenotype: (ph.phenotype as string) || "",
    direction: (ph.direction as string) || "no_change",
    foldChange: (ph.fold_change as string) || null,
  }));

  return { pathwayEffects, phenotypeEffects };
}

// ===== 统一提取保存管线 =====

interface SaveExtractionsOptions {
  /** Prisma 事务客户端 */
  tx: any;
  /** 目标论文 ID */
  paperId: string;
  /** 所属项目 ID（用于 TimelineEvent） */
  projectId: string;
  /** 扁平化的实验数组（已含 conclusionIndex / conclusionClaim） */
  experiments: Record<string, unknown>[];
  /** 用于 TimelineEvent 的标题片段 */
  sourceLabel?: string;
}

/**
 * 统一的提取结果保存管线
 *
 * 幂等：先删除该论文的旧 extraction 记录（cascade 自动清理关联表），
 * 再创建新记录。确保"重新提取"不会导致数据翻倍。
 *
 * 所有保存路径（/extractions POST、/extractions/batch POST、/upload/extract POST）
 * 必须通过此函数保存，保证一致性。
 */
export async function saveExtractionsToDB(options: SaveExtractionsOptions): Promise<number> {
  const { tx, paperId, projectId, experiments, sourceLabel } = options;

  // 1. 幂等保护：删除该论文的旧提取记录
  //    Extraction → PathwayEffect / PhenotypeEffect 通过 onDelete: Cascade 自动清理
  const deleted = await tx.extraction.deleteMany({ where: { paperId } });
  if (deleted.count > 0) {
    console.log(`[SaveExtractions] 清除旧记录: ${deleted.count} 条 (paperId: ${paperId.slice(0, 10)})`);
  }

  // 2. 批量创建新记录
  for (const exp of experiments) {
    const record = await tx.extraction.create({
      data: mapExtractionToDB(exp, paperId),
    });

    // 3. 创建关系型通路/表型效果
    const { pathwayEffects, phenotypeEffects } = extractRelationalEffects(exp);

    if (pathwayEffects.length > 0) {
      await tx.pathwayEffect.createMany({
        data: pathwayEffects.map(pe => ({
          extractionId: record.id,
          pathway: pe.pathway,
          direction: pe.direction,
          significance: pe.significance,
          method: pe.method,
          foldChange: pe.foldChange,
        })),
      });
    }

    if (phenotypeEffects.length > 0) {
      await tx.phenotypeEffect.createMany({
        data: phenotypeEffects.map(ph => ({
          extractionId: record.id,
          phenotype: ph.phenotype,
          direction: ph.direction,
          foldChange: ph.foldChange,
        })),
      });
    }
  }

  // 4. 记录时间线事件
  const label = sourceLabel || `${experiments.length} 条数据`;
  await tx.timelineEvent.create({
    data: {
      projectId,
      type: "literature",
      title: deleted.count > 0
        ? `重新提取了 ${label}`
        : `提取了 ${label}`,
      content: { paperId, count: experiments.length, isReExtraction: deleted.count > 0 },
    },
  });

  return experiments.length;
}
