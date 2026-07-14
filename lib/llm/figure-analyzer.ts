/**
 * Figure Analysis Module
 *
 * Analyzes page screenshots from a PDF using a multimodal LLM
 * to extract quantitative data from figures and tables.
 * Supplements text-based extraction, does not replace it.
 */

import { z } from "zod";
import { getLLMClient, getModelForFeature, withLLMRetry } from "./client";
import { createToolFromSchema, extractStructuredOutput } from "./json-extractor";
import { trackTokenUsage } from "@/lib/token-tracker";

// ===== Zod Schema =====

const FigureDataSchema = z.object({
  figure_id: z.string().describe("Figure identifier, e.g. Figure 1A, Table 2"),
  figure_type: z.enum([
    "western_blot",
    "flow_cytometry",
    "microscopy",
    "bar_chart",
    "line_graph",
    "table",
    "heatmap",
    "other",
  ]),
  description: z.string().describe("Brief description of the figure content"),
  quantitative_data: z
    .array(
      z.object({
        label: z.string().describe("Data label, e.g. 'p-AKT', 'Apoptosis %'"),
        values: z.array(
          z.object({
            condition: z.string().describe("Experimental condition, e.g. '5 uM cisplatin'"),
            value: z.string().describe("Numeric or semi-quantitative value, e.g. '3.2-fold', '45%', 'strong'"),
          }),
        ),
      }),
    )
    .describe("Quantitative / semi-quantitative data extracted from the figure"),
  key_findings: z.array(z.string()).describe("Key findings from the figure, 1-3 items"),
});

const FigureExtractionSchema = z.object({
  figures: z.array(FigureDataSchema),
});

export type FigureData = z.infer<typeof FigureDataSchema>;
export type FigureExtraction = z.infer<typeof FigureExtractionSchema>;

// ===== Tool =====

const FIGURE_TOOL = createToolFromSchema(
  "extract_figure_data",
  "Extract quantitative data from scientific figures and tables",
  FigureExtractionSchema,
);

// ===== Prompt =====

const FIGURE_PROMPT = `You are analyzing a figure/table from a biomedical paper.

Extract ALL quantitative data visible in the figure:
- Western blot: list each band's relative intensity (strong/moderate/weak or fold-change)
- Flow cytometry: percentage of positive cells in each quadrant
- Bar charts/line graphs: exact values or approximate values from the axis
- Tables: all numeric values with their row/column labels
- Microscopy: any quantification mentioned (cell counts, fluorescence intensity)

For semi-quantitative data (Western blots), rate intensity as: strong (+++), moderate (++), weak (+), absent (-).

Extract EVERY data point visible. Do not summarize or skip "similar" results.`;

// ===== Public API =====

/**
 * Analyze figures from PDF page screenshots using a multimodal LLM.
 *
 * NOTE: This function requires page-level image buffers (PNG).
 * The current PDF pipeline uses `pdf-parse-new` or Docling for text extraction
 * and does not produce page screenshots. This is a reserved interface for when
 * the PDF parser supports page image export.
 *
 * @param imageBuffers - Array of image buffers (one per page), PNG format
 * @param paperTitle  - Paper title for context
 * @returns Extracted figure data from the first 10 pages
 */
export async function analyzeFigures(
  imageBuffers: Buffer[],
  paperTitle: string,
): Promise<FigureExtraction> {
  return withLLMRetry(async () => {
    const client = getLLMClient();
    const model = await getModelForFeature("analysis");

    // Only analyze the first 10 pages (figures are usually concentrated there)
    const pagesToAnalyze = imageBuffers.slice(0, 10);
    const figures: FigureData[] = [];

    for (let i = 0; i < pagesToAnalyze.length; i++) {
      try {
        const base64 = pagesToAnalyze[i].toString("base64");
        const response = await client.messages.create({
          model,
          max_tokens: 2048,
          system: FIGURE_PROMPT,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: `Paper: ${paperTitle}\nPage ${i + 1}. Extract all figure/table data.`,
                },
                {
                  type: "image",
                  source: {
                    type: "base64",
                    media_type: "image/png",
                    data: base64,
                  },
                },
              ],
            },
          ],
          tools: [FIGURE_TOOL],
          tool_choice: { type: "tool", name: "extract_figure_data" },
          _sciflowFeature: "figure-analysis",
        } as never);

        const result = await extractStructuredOutput(response, FigureExtractionSchema, {
          label: "figure-analysis",
        });

        if (result.figures.length > 0) {
          figures.push(...result.figures);
        }
      } catch (error) {
        console.warn(
          `[FigureAnalyzer] Page ${i + 1} analysis failed:`,
          (error as Error)?.message,
        );
      }
    }

    return { figures };
  }, { label: "figure-analysis" });
}

/**
 * Merge figure data into existing extraction results.
 *
 * Converts figure-level quantitative data into pathway_effects and
 * phenotype_effects that can be added to existing experiment entries.
 *
 * NOTE: Currently a stub that returns the existing experiments unchanged.
 * A future implementation will match figure data to the correct experiment
 * by matching labels (e.g. "p-AKT" -> pathway "AKT") and conditions.
 */
export function mergeFigureDataIntoExtraction(
  _figureData: FigureExtraction,
  existingExperiments: Array<Record<string, unknown>>,
): Array<Record<string, unknown>> {
  // TODO: Implement intelligent matching of figure data to experiments
  // Strategy:
  //   1. Match figure quantitative_data labels to pathway_effects[].pathway
  //   2. Match figure conditions to experiment interventions
  //   3. Enrich experiment entries with figure-level numeric values
  return existingExperiments;
}
