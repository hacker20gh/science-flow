/**
 * Demo 数据：sorafenib 联合 PD-1 在肝癌中的研究
 * 用于展示机制矩阵效果
 */

import type { ExperimentResult } from "@/lib/llm/extraction";

export const DEMO_EXTRATIONS = [
  {
    paperId: "liu-2024",
    paperTitle: "Sorafenib upregulates PD-L1 via NF-κB in HCC cells",
    year: 2024,
    experiments: [
      {
        drug_intervention: { name: "sorafenib", concentration: "2 μM", duration: "24h", co_treatment: null },
        model: { cell_line: "Huh7", species: "Human", passage: "P5-P8" },
        pathway_effects: [
          { pathway: "NF-κB", direction: "up" as const, significance: "p<0.01", method: "Western blot" },
        ],
        phenotype_effects: [
          { phenotype: "PD-L1 expression", direction: "up" as const, fold_change: "2.3x" },
        ],
        controls: ["DMSO vehicle"],
        statistical_test: "One-way ANOVA",
        sample_size: 3,
        conclusion: "Sorafenib 2μM upregulates PD-L1 via NF-κB in Huh7 cells",
        evidence_quote: "Sorafenib treatment (2 μM, 24h) significantly increased PD-L1 expression (2.3-fold, p<0.01, n=3), which was abolished by NF-κB inhibitor pretreatment.",
      } as ExperimentResult,
      {
        drug_intervention: { name: "sorafenib", concentration: "5 μM", duration: "24h", co_treatment: null },
        model: { cell_line: "Huh7", species: "Human", passage: "P5-P8" },
        pathway_effects: [
          { pathway: "NF-κB", direction: "up" as const, significance: "p<0.001", method: "Western blot" },
        ],
        phenotype_effects: [
          { phenotype: "Apoptosis", direction: "up" as const, fold_change: "3.1x" },
        ],
        controls: ["DMSO vehicle"],
        statistical_test: "One-way ANOVA",
        sample_size: 3,
        conclusion: "Higher sorafenib concentration induces more NF-κB activation and apoptosis",
        evidence_quote: "At 5 μM, sorafenib induced a 3.1-fold increase in apoptosis markers.",
      } as ExperimentResult,
    ],
  },
  {
    paperId: "chen-2023",
    paperTitle: "Dual role of sorafenib in HCC immune microenvironment",
    year: 2023,
    experiments: [
      {
        drug_intervention: { name: "sorafenib", concentration: "10 μM", duration: "48h", co_treatment: null },
        model: { cell_line: "HepG2", species: "Human", passage: "P6-P10" },
        pathway_effects: [
          { pathway: "NF-κB", direction: "up" as const, significance: "p<0.05", method: "NF-κB reporter assay" },
        ],
        phenotype_effects: [
          { phenotype: "PD-L1 expression", direction: "down" as const, fold_change: "0.6x" },
          { phenotype: "Cell viability", direction: "down" as const, fold_change: "0.4x" },
        ],
        controls: ["DMSO vehicle", "untreated"],
        statistical_test: "Student's t-test",
        sample_size: 3,
        conclusion: "High-dose sorafenib reduces PD-L1 and induces cell death in HepG2",
        evidence_quote: "10 μM sorafenib treatment for 48h significantly reduced PD-L1 expression (0.6-fold, p<0.05) along with substantial cell death.",
      } as ExperimentResult,
    ],
  },
  {
    paperId: "zhang-2022",
    paperTitle: "Regorafenib modulates immune checkpoint in HCC",
    year: 2022,
    experiments: [
      {
        drug_intervention: { name: "regorafenib", concentration: "2 μM", duration: "24h", co_treatment: null },
        model: { cell_line: "Huh7", species: "Human", passage: "P8-P12" },
        pathway_effects: [
          { pathway: "MAPK", direction: "down" as const, significance: "p<0.01", method: "Phospho-protein array" },
        ],
        phenotype_effects: [
          { phenotype: "PD-L1 expression", direction: "up" as const, fold_change: "1.8x" },
        ],
        controls: ["DMSO vehicle"],
        statistical_test: "Two-way ANOVA",
        sample_size: 4,
        conclusion: "Regorafenib upregulates PD-L1 through MAPK inhibition",
        evidence_quote: "Regorafenib (2 μM, 24h) upregulated PD-L1 (1.8-fold, p<0.01) while inhibiting MAPK signaling.",
      } as ExperimentResult,
    ],
  },
] as const;
