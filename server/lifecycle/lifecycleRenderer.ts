import { renderLifecycleTemplate, type LifecycleTemplateContext } from "./templates/tokenRegistry.js";

export function escapeLifecycleHtml(value: unknown): string {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function safeInlineMarkdown(value: string): string {
  return escapeLifecycleHtml(value)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
}

export function renderSafeLifecycleMarkdown(markdown: string): string {
  const lines = String(markdown || "").split(/\r?\n/);
  const html: string[] = [];
  let listOpen = false;
  const closeList = () => { if (listOpen) { html.push("</ul>"); listOpen = false; } };
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) { closeList(); continue; }
    const listItem = trimmed.match(/^[-*]\s+(.+)$/);
    if (listItem) {
      if (!listOpen) { html.push("<ul style=\"padding-left:20px;\">"); listOpen = true; }
      html.push(`<li>${safeInlineMarkdown(listItem[1])}</li>`);
      continue;
    }
    closeList();
    if (trimmed.startsWith("### ")) html.push(`<h3>${safeInlineMarkdown(trimmed.slice(4))}</h3>`);
    else if (trimmed.startsWith("## ")) html.push(`<h2>${safeInlineMarkdown(trimmed.slice(3))}</h2>`);
    else if (trimmed.startsWith("# ")) html.push(`<h1>${safeInlineMarkdown(trimmed.slice(2))}</h1>`);
    else html.push(`<p>${safeInlineMarkdown(trimmed)}</p>`);
  }
  closeList();
  return html.join("\n");
}

export function resolveLifecycleUrl(origin: string, route: string | null | undefined): string {
  const value = String(route || "/painel/dashboard").trim();
  if (value.startsWith("/")) return `${origin.replace(/\/$/, "")}${value}`;
  if (/^https:\/\/evolucaoclinica\.app\.br(?:\/|$)/i.test(value)) return value;
  return `${origin.replace(/\/$/, "")}/painel/dashboard`;
}

export function renderLifecycleMessage(input: {
  subjectTemplate: string;
  preheaderTemplate?: string | null;
  bodyTemplate: string;
  ctaLabelTemplate?: string | null;
  ctaRouteTemplate?: string | null;
  context: LifecycleTemplateContext;
}): { subject: string; preheader: string; text: string; bodyHtml: string; ctaLabel: string; ctaRoute: string } {
  const subject = renderLifecycleTemplate(input.subjectTemplate, input.context).trim() || "Uma nova orientação do Evolução Clínica";
  const preheader = renderLifecycleTemplate(input.preheaderTemplate, input.context).trim();
  const text = renderLifecycleTemplate(input.bodyTemplate, input.context).trim();
  const ctaLabel = renderLifecycleTemplate(input.ctaLabelTemplate, input.context).trim() || "Acessar a plataforma";
  const ctaRoute = renderLifecycleTemplate(input.ctaRouteTemplate, input.context).trim() || "/painel/dashboard";
  return { subject, preheader, text, bodyHtml: renderSafeLifecycleMarkdown(text), ctaLabel, ctaRoute };
}
