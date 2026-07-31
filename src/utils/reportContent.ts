const GENERATED_DOCUMENT_INTRODUCTION = /^# (?:Relatório de Evolução Clínica|Plano de Desenvolvimento Individual \(PDI\))\s*\n[\s\S]*?^---\s*$(?:\r?\n)?/m;

/**
 * The PDF and print templates already render the document identification.
 * Older AI reports contain that same block at the beginning of their Markdown,
 * so remove only this known generated introduction before rendering the body.
 */
export const getReportBodyContent = (content: string | null | undefined) =>
  (content || '').replace(GENERATED_DOCUMENT_INTRODUCTION, '').trim();
