/**
 * 期刊指标查询
 * 数据源：文献泡泡 API (byteslink.cn) + 本地缓存
 *
 * 返回：影响因子、JCR 分区、中科院分区、预警名单
 */

// 本地缓存（Top 200 常见生物医学期刊）
const LOCAL_JOURNAL_DB: Record<string, { if: number; jcr: string; cas: string; warn?: boolean }> = {
  "Nature": { if: 64.8, jcr: "Q1", cas: "1区" },
  "Science": { if: 56.9, jcr: "Q1", cas: "1区" },
  "Cell": { if: 45.5, jcr: "Q1", cas: "1区" },
  "The New England Journal of Medicine": { if: 158.5, jcr: "Q1", cas: "1区" },
  "The Lancet": { if: 98.4, jcr: "Q1", cas: "1区" },
  "Journal of Clinical Oncology": { if: 45.3, jcr: "Q1", cas: "1区" },
  "Cancer Cell": { if: 48.8, jcr: "Q1", cas: "1区" },
  "Nature Medicine": { if: 82.9, jcr: "Q1", cas: "1区" },
  "Cancer Research": { if: 12.5, jcr: "Q1", cas: "2区" },
  "Oncogene": { if: 8.0, jcr: "Q1", cas: "2区" },
  "Journal of Hepatology": { if: 26.8, jcr: "Q1", cas: "1区" },
  "Hepatology": { if: 14.0, jcr: "Q1", cas: "2区" },
  "Clinical Cancer Research": { if: 11.5, jcr: "Q1", cas: "2区" },
  "Molecular Cancer": { if: 27.7, jcr: "Q1", cas: "1区" },
  "Nucleic Acids Research": { if: 14.9, jcr: "Q1", cas: "2区" },
  "Cell Death & Differentiation": { if: 13.7, jcr: "Q1", cas: "2区" },
  "Autophagy": { if: 13.3, jcr: "Q1", cas: "2区" },
  "Cell Death & Disease": { if: 9.0, jcr: "Q1", cas: "2区" },
  "Cancers": { if: 5.2, jcr: "Q2", cas: "3区" },
  "Frontiers in Oncology": { if: 4.7, jcr: "Q2", cas: "3区" },
  "International Journal of Molecular Sciences": { if: 5.6, jcr: "Q2", cas: "3区" },
  "PLOS ONE": { if: 3.7, jcr: "Q2", cas: "3区" },
  "Scientific Reports": { if: 4.6, jcr: "Q2", cas: "3区" },
  "Biochemical and Biophysical Research Communications": { if: 3.3, jcr: "Q3", cas: "4区" },
  "Oncology Letters": { if: 3.1, jcr: "Q3", cas: "4区" },
  "Molecular Medicine Reports": { if: 3.4, jcr: "Q3", cas: "4区" },
  "International Journal of Oncology": { if: 5.2, jcr: "Q2", cas: "3区" },
  "Oncology Reports": { if: 4.1, jcr: "Q2", cas: "3区" },
  "Tumor Biology": { if: 3.6, jcr: "Q3", cas: "4区", warn: true },
  "Anticancer Research": { if: 2.0, jcr: "Q4", cas: "4区", warn: true },
  "Experimental and Therapeutic Medicine": { if: 3.4, jcr: "Q3", cas: "4区", warn: true },
  "Oncology Research": { if: 4.9, jcr: "Q2", cas: "3区" },
  "Cancer Science": { if: 5.0, jcr: "Q2", cas: "3区" },
  "Cancer Letters": { if: 9.7, jcr: "Q1", cas: "2区" },
  "Biochimica et Biophysica Acta - Reviews on Cancer": { if: 11.2, jcr: "Q1", cas: "2区" },
  "Seminars in Cancer Biology": { if: 12.9, jcr: "Q1", cas: "2区" },
  "Cancer and Metastasis Reviews": { if: 9.1, jcr: "Q1", cas: "2区" },
  "British Journal of Cancer": { if: 8.8, jcr: "Q1", cas: "2区" },
  "European Journal of Cancer": { if: 8.2, jcr: "Q1", cas: "2区" },
  "Annals of Oncology": { if: 56.7, jcr: "Q1", cas: "1区" },
  "JAMA Oncology": { if: 28.4, jcr: "Q1", cas: "1区" },
  "Journal of Experimental & Clinical Cancer Research": { if: 11.3, jcr: "Q1", cas: "2区" },
  "Theranostics": { if: 12.4, jcr: "Q1", cas: "2区" },
  "Signal Transduction and Targeted Therapy": { if: 40.8, jcr: "Q1", cas: "1区" },
  "Cell Reports": { if: 8.8, jcr: "Q1", cas: "2区" },
  "Nature Communications": { if: 16.6, jcr: "Q1", cas: "1区" },
  "PNAS": { if: 11.1, jcr: "Q1", cas: "1区" },
  "eLife": { if: 7.7, jcr: "Q1", cas: "2区" },
  "EMBO Journal": { if: 11.4, jcr: "Q1", cas: "2区" },
  "Genes & Development": { if: 7.5, jcr: "Q1", cas: "2区" },
  "Molecular Cell": { if: 14.5, jcr: "Q1", cas: "1区" },
  "Genome Biology": { if: 17.9, jcr: "Q1", cas: "1区" },
  "Genome Research": { if: 11.1, jcr: "Q1", cas: "2区" },
  "RNA": { if: 5.0, jcr: "Q2", cas: "3区" },
  "RNA Biology": { if: 4.0, jcr: "Q2", cas: "3区" },
  "Journal of Biological Chemistry": { if: 4.8, jcr: "Q2", cas: "3区" },
  "Biochemistry": { if: 3.1, jcr: "Q3", cas: "4区" },
  "FEBS Letters": { if: 3.5, jcr: "Q3", cas: "4区" },
  "Biochemical Journal": { if: 4.4, jcr: "Q2", cas: "3区" },
  "Cellular and Molecular Life Sciences": { if: 8.0, jcr: "Q1", cas: "2区" },
  "Journal of Cell Science": { if: 5.2, jcr: "Q2", cas: "3区" },
  "Journal of Cell Biology": { if: 7.8, jcr: "Q1", cas: "2区" },
  "Development": { if: 4.0, jcr: "Q2", cas: "3区" },
  "Developmental Biology": { if: 3.6, jcr: "Q3", cas: "4区" },
  "Nature Cell Biology": { if: 17.3, jcr: "Q1", cas: "1区" },
  "Cell Stem Cell": { if: 23.9, jcr: "Q1", cas: "1区" },
  "Stem Cell Reports": { if: 5.9, jcr: "Q2", cas: "3区" },
  "Cell Research": { if: 44.8, jcr: "Q1", cas: "1区" },
  "Nature Reviews Cancer": { if: 78.5, jcr: "Q1", cas: "1区" },
  "Nature Reviews Drug Discovery": { if: 122.7, jcr: "Q1", cas: "1区" },
  "Nature Reviews Molecular Cell Biology": { if: 81.3, jcr: "Q1", cas: "1区" },
  "Nature Reviews Immunology": { if: 100.3, jcr: "Q1", cas: "1区" },
  "Nature Biotechnology": { if: 46.9, jcr: "Q1", cas: "1区" },
  "Trends in Biochemical Sciences": { if: 13.8, jcr: "Q1", cas: "2区" },
  "Trends in Cell Biology": { if: 13.0, jcr: "Q1", cas: "2区" },
  "Trends in Genetics": { if: 11.9, jcr: "Q1", cas: "2区" },
  "Current Opinion in Cell Biology": { if: 7.8, jcr: "Q1", cas: "2区" },
  "Current Opinion in Genetics & Development": { if: 4.8, jcr: "Q2", cas: "3区" },
  "Annual Review of Biochemistry": { if: 11.5, jcr: "Q1", cas: "2区" },
  "Annual Review of Cell and Developmental Biology": { if: 9.8, jcr: "Q1", cas: "2区" },
  "Annual Review of Genetics": { if: 8.7, jcr: "Q1", cas: "2区" },
  "Chemical Reviews": { if: 62.1, jcr: "Q1", cas: "1区" },
  "Chemical Society Reviews": { if: 46.2, jcr: "Q1", cas: "1区" },
  "Angewandte Chemie International Edition": { if: 16.6, jcr: "Q1", cas: "1区" },
  "Journal of the American Chemical Society": { if: 15.0, jcr: "Q1", cas: "1区" },
  "Advanced Materials": { if: 29.4, jcr: "Q1", cas: "1区" },
  "Advanced Functional Materials": { if: 19.0, jcr: "Q1", cas: "1区" },
  "ACS Nano": { if: 17.1, jcr: "Q1", cas: "1区" },
  "Nano Letters": { if: 10.8, jcr: "Q1", cas: "2区" },
  "Biomaterials": { if: 14.0, jcr: "Q1", cas: "1区" },
  "Acta Biomaterialia": { if: 10.6, jcr: "Q1", cas: "2区" },
  "Journal of Controlled Release": { if: 11.4, jcr: "Q1", cas: "2区" },
  "Drug Resistance Updates": { if: 15.8, jcr: "Q1", cas: "1区" },
  "Pharmacology & Therapeutics": { if: 12.1, jcr: "Q1", cas: "2区" },
  "Drug Discovery Today": { if: 7.8, jcr: "Q1", cas: "2区" },
  "Trends in Pharmacological Sciences": { if: 10.9, jcr: "Q1", cas: "2区" },
  "Clinical Pharmacology & Therapeutics": { if: 6.7, jcr: "Q1", cas: "2区" },
  "British Journal of Pharmacology": { if: 7.3, jcr: "Q1", cas: "2区" },
  "Journal of Pharmacology and Experimental Therapeutics": { if: 4.0, jcr: "Q2", cas: "3区" },
  "Biochemical Pharmacology": { if: 6.1, jcr: "Q2", cas: "3区" },
  "Neuropharmacology": { if: 5.6, jcr: "Q2", cas: "3区" },
  "Psychopharmacology": { if: 3.8, jcr: "Q2", cas: "3区" },
  "Neuroscience": { if: 3.7, jcr: "Q3", cas: "4区" },
  "Brain Research": { if: 3.6, jcr: "Q3", cas: "4区" },
  "Journal of Neuroscience": { if: 6.2, jcr: "Q1", cas: "2区" },
  "Neuron": { if: 17.2, jcr: "Q1", cas: "1区" },
  "Nature Neuroscience": { if: 21.2, jcr: "Q1", cas: "1区" },
  "Cell Reports Medicine": { if: 14.3, jcr: "Q1", cas: "1区" },
  "Science Translational Medicine": { if: 19.2, jcr: "Q1", cas: "1区" },
  "Nature Reviews Disease Primers": { if: 65.1, jcr: "Q1", cas: "1区" },
  "Lancet Oncology": { if: 41.6, jcr: "Q1", cas: "1区" },
  "Lancet Digital Health": { if: 36.6, jcr: "Q1", cas: "1区" },
  "JAMA": { if: 120.7, jcr: "Q1", cas: "1区" },
  "BMJ": { if: 105.5, jcr: "Q1", cas: "1区" },
  "PLOS Medicine": { if: 15.8, jcr: "Q1", cas: "1区" },
  "BMC Medicine": { if: 12.7, jcr: "Q1", cas: "2区" },
  "BMC Cancer": { if: 4.6, jcr: "Q2", cas: "3区" },
  "BMC Genomics": { if: 4.5, jcr: "Q2", cas: "3区" },
  "BMC Bioinformatics": { if: 3.0, jcr: "Q3", cas: "4区" },
  "Bioinformatics": { if: 5.8, jcr: "Q1", cas: "2区" },
  "Briefings in Bioinformatics": { if: 13.9, jcr: "Q1", cas: "1区" },
  "GigaScience": { if: 7.7, jcr: "Q1", cas: "2区" },
  "Patterns": { if: 7.4, jcr: "Q1", cas: "2区" },
  "Cell Systems": { if: 9.3, jcr: "Q1", cas: "2区" },
  "Cell Genomics": { if: 11.5, jcr: "Q1", cas: "2区" },
  "Molecular Systems Biology": { if: 8.4, jcr: "Q1", cas: "2区" },
  "Genome Medicine": { if: 12.3, jcr: "Q1", cas: "2区" },
  "npj Genomic Medicine": { if: 7.0, jcr: "Q1", cas: "2区" },
  "Nature Genetics": { if: 31.7, jcr: "Q1", cas: "1区" },
  "Nature Methods": { if: 36.1, jcr: "Q1", cas: "1区" },
  "Nature Protocols": { if: 13.1, jcr: "Q1", cas: "2区" },
  "Nature Chemical Biology": { if: 12.9, jcr: "Q1", cas: "2区" },
  "Nature Immunology": { if: 27.7, jcr: "Q1", cas: "1区" },
  "Nature Metabolism": { if: 18.9, jcr: "Q1", cas: "1区" },
  "Nature Aging": { if: 17.0, jcr: "Q1", cas: "1区" },
  "Nature Microbiology": { if: 28.3, jcr: "Q1", cas: "1区" },
  "Nature Reviews Microbiology": { if: 76.0, jcr: "Q1", cas: "1区" },
  "Nature Reviews Chemistry": { if: 42.8, jcr: "Q1", cas: "1区" },
  "Nature Reviews Materials": { if: 83.1, jcr: "Q1", cas: "1区" },
  "Nature Reviews Electrical Engineering": { if: 42.0, jcr: "Q1", cas: "1区" },
  "Nature Reviews Physics": { if: 39.8, jcr: "Q1", cas: "1区" },
  "Nature Reviews Earth & Environment": { if: 49.7, jcr: "Q1", cas: "1区" },
  "Nature Sustainability": { if: 27.6, jcr: "Q1", cas: "1区" },
  "Nature Energy": { if: 56.7, jcr: "Q1", cas: "1区" },
  "Nature Catalysis": { if: 42.8, jcr: "Q1", cas: "1区" },
  "Nature Reviews Bioengineering": { if: 38.1, jcr: "Q1", cas: "1区" },
  "Cell Reports Methods": { if: 5.0, jcr: "Q2", cas: "3区" },
  "iScience": { if: 5.8, jcr: "Q1", cas: "2区" },
  "Science Advances": { if: 13.6, jcr: "Q1", cas: "1区" },
  "Cell Reports Physical Science": { if: 8.9, jcr: "Q1", cas: "2区" },
  "Matter": { if: 15.0, jcr: "Q1", cas: "1区" },
  "One Earth": { if: 16.2, jcr: "Q1", cas: "1区" },
  "Cell Reports Sustainability": { if: 5.3, jcr: "Q1", cas: "2区" },
  "Cell Biomaterials": { if: 10.2, jcr: "Q1", cas: "2区" },
  "Med": { if: 12.8, jcr: "Q1", cas: "1区" },
  "Cell Host & Microbe": { if: 20.6, jcr: "Q1", cas: "1区" },
  "Cell Chemical Biology": { if: 8.6, jcr: "Q1", cas: "2区" },
  "Immunity": { if: 25.5, jcr: "Q1", cas: "1区" },
  "Science Immunology": { if: 24.8, jcr: "Q1", cas: "1区" },
  "Cell Reports Immunology": { if: 7.3, jcr: "Q1", cas: "2区" },
  "Journal of Immunology": { if: 4.4, jcr: "Q2", cas: "3区" },
  "Journal of Allergy and Clinical Immunology": { if: 14.3, jcr: "Q1", cas: "1区" },
  "Allergy": { if: 14.7, jcr: "Q1", cas: "1区" },
  "Clinical & Experimental Allergy": { if: 5.1, jcr: "Q2", cas: "3区" },
  "International Archives of Allergy and Immunology": { if: 3.3, jcr: "Q3", cas: "4区" },
  "Annals of the Rheumatic Diseases": { if: 27.4, jcr: "Q1", cas: "1区" },
  "Arthritis & Rheumatology": { if: 13.7, jcr: "Q1", cas: "2区" },
  "Rheumatology": { if: 5.5, jcr: "Q1", cas: "2区" },
  "Journal of Autoimmunity": { if: 12.8, jcr: "Q1", cas: "2区" },
  "Autoimmunity Reviews": { if: 12.9, jcr: "Q1", cas: "2区" },
  "Autoimmunity": { if: 0, jcr: "Q4", cas: "4区", warn: true },
  "Lupus": { if: 3.1, jcr: "Q3", cas: "4区" },
  "Scandinavian Journal of Immunology": { if: 3.0, jcr: "Q3", cas: "4区" },
  "Immunology Letters": { if: 3.8, jcr: "Q3", cas: "4区" },
  "International Immunology": { if: 4.0, jcr: "Q2", cas: "3区" },
  "Immunology": { if: 7.8, jcr: "Q1", cas: "2区" },
  "Clinical Immunology": { if: 8.6, jcr: "Q1", cas: "2区" },
  "Journal of Clinical Investigation": { if: 15.9, jcr: "Q1", cas: "1区" },
  "EMBO Molecular Medicine": { if: 11.1, jcr: "Q1", cas: "2区" },
  "Genes & Immunity": { if: 5.0, jcr: "Q2", cas: "3区" },
  "Mucosal Immunology": { if: 8.0, jcr: "Q1", cas: "2区" },
  "Journal of Leukocyte Biology": { if: 5.6, jcr: "Q2", cas: "3区" },
  "Leukemia": { if: 12.8, jcr: "Q1", cas: "2区" },
  "Blood": { if: 21.0, jcr: "Q1", cas: "1区" },
  "Cancer Immunology Research": { if: 10.0, jcr: "Q1", cas: "2区" },
  "Journal for ImmunoTherapy of Cancer": { if: 10.3, jcr: "Q1", cas: "2区" },
  "OncoImmunology": { if: 7.3, jcr: "Q1", cas: "2区" },
  "Cancer Immunology, Immunotherapy": { if: 5.0, jcr: "Q2", cas: "3区" },
  "Journal of Immunotherapy": { if: 4.4, jcr: "Q2", cas: "3区" },
  "Seminars in Immunology": { if: 10.9, jcr: "Q1", cas: "2区" },
  "Trends in Immunology": { if: 16.0, jcr: "Q1", cas: "1区" },
  "Current Opinion in Immunology": { if: 7.8, jcr: "Q1", cas: "2区" },
  "Annual Review of Immunology": { if: 28.2, jcr: "Q1", cas: "1区" },
};

export interface JournalMetrics {
  journal: string;
  impactFactor: number | null;
  jcrQuartile: string | null;   // Q1, Q2, Q3, Q4
  casZone: string | null;       // 1区, 2区, 3区, 4区
  isWarning: boolean;           // 预警期刊
}

// 内存缓存
const metricsCache = new Map<string, JournalMetrics>();

/**
 * 批量查询期刊指标
 * 先查本地数据库，本地没有再尝试 API
 */
export async function getJournalMetrics(journalNames: string[]): Promise<Map<string, JournalMetrics>> {
  const results = new Map<string, JournalMetrics>();
  const needApi: string[] = [];

  // 1. 先查本地数据库
  for (const name of journalNames) {
    if (!name) continue;
    const normalized = name.trim();

    // 检查内存缓存
    if (metricsCache.has(normalized)) {
      results.set(normalized, metricsCache.get(normalized)!);
      continue;
    }

    // 模糊匹配本地数据库
    const localMatch = findLocalMatch(normalized);
    if (localMatch) {
      const metrics: JournalMetrics = {
        journal: normalized,
        impactFactor: localMatch.if,
        jcrQuartile: localMatch.jcr,
        casZone: localMatch.cas,
        isWarning: localMatch.warn || false,
      };
      metricsCache.set(normalized, metrics);
      results.set(normalized, metrics);
    } else {
      needApi.push(normalized);
    }
  }

  // 2. 如果有需要 API 查询的期刊，尝试 Byteslink API
  if (needApi.length > 0) {
    try {
      const apiResults = await queryByteslinkAPI(needApi);
      for (const [name, metrics] of apiResults) {
        metricsCache.set(name, metrics);
        results.set(name, metrics);
      }
    } catch {
      // API 失败不影响结果，只是没有额外数据
    }
  }

  return results;
}

function findLocalMatch(name: string): { if: number; jcr: string; cas: string; warn?: boolean } | null {
  const lower = name.toLowerCase();

  // 精确匹配
  for (const [key, value] of Object.entries(LOCAL_JOURNAL_DB)) {
    if (key.toLowerCase() === lower) return value;
  }

  // 模糊匹配（包含关系）
  for (const [key, value] of Object.entries(LOCAL_JOURNAL_DB)) {
    if (lower.includes(key.toLowerCase()) || key.toLowerCase().includes(lower)) return value;
  }

  return null;
}

/**
 * Byteslink API 查询（可选，需要 API Key）
 */
async function queryByteslinkAPI(journals: string[]): Promise<Map<string, JournalMetrics>> {
  const results = new Map<string, JournalMetrics>();
  const apiKey = process.env.BYTESLINK_API_KEY;
  if (!apiKey) return results;

  try {
    const res = await fetch("https://api.byteslink.cn/api/v1/journal/metrics", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ journals }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) return results;
    const data = await res.json();

    // 解析响应
    if (data?.data && typeof data.data === "object") {
      for (const [name, info] of Object.entries(data.data as Record<string, Record<string, unknown>>)) {
        results.set(name, {
          journal: name,
          impactFactor: (info.if as number) || null,
          jcrQuartile: (info.jcr as string) || null,
          casZone: (info.cas as string) || null,
          isWarning: (info.warn as boolean) || false,
        });
      }
    }
  } catch {
    // 静默失败
  }

  return results;
}
