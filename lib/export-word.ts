/**
 * Word 导出（docx 库在此模块中懒加载）
 */

export async function exportManuscriptToWord(sections: Record<string, string | undefined>): Promise<Blob> {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel } = await import("docx");

  const sectionOrder = ["abstract", "introduction", "methods", "results", "discussion"];
  const sectionTitles: Record<string, string> = {
    abstract: "Abstract",
    introduction: "Introduction",
    methods: "Methods",
    results: "Results",
    discussion: "Discussion",
  };

  const children: InstanceType<typeof Paragraph>[] = [];

  // Title
  children.push(
    new Paragraph({
      text: "Research Article",
      heading: HeadingLevel.TITLE,
      alignment: "center",
    })
  );

  // Author placeholder
  children.push(
    new Paragraph({
      text: "Author Name",
      alignment: "center",
      spacing: { after: 400 },
    })
  );

  // Sections
  for (const section of sectionOrder) {
    const content = sections[section];
    if (content) {
      children.push(
        new Paragraph({
          text: sectionTitles[section],
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 300, after: 150 },
        })
      );

      // Split content into paragraphs
      const paragraphs = content.split("\n\n").filter((p) => p.trim());
      for (const para of paragraphs) {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: para.trim(), size: 24 })], // 12pt = 24 half-points
            spacing: { after: 120 },
          })
        );
      }
    }
  }

  const doc = new Document({
    sections: [{ children }],
  });

  return Packer.toBlob(doc);
}
