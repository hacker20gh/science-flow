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
  };
}
