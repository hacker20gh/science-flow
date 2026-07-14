/**
 * 将 LLM 提取结果转换为数据库 Extraction 记录的数据
 */
export function mapExtractionToDB(experiment: Record<string, unknown>, paperId: string) {
  return {
    paperId,
    drugName: (experiment.drug_intervention as Record<string, unknown>)?.name || null,
    drugConc: (experiment.drug_intervention as Record<string, unknown>)?.concentration || null,
    duration: (experiment.drug_intervention as Record<string, unknown>)?.duration || null,
    coTreatment: (experiment.drug_intervention as Record<string, unknown>)?.co_treatment || null,
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
    ic50: experiment.ic50 || null,
  };
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
