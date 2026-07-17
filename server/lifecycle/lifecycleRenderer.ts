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
      if (!listOpen) {
        html.push("<ul style=\"margin:0 0 20px 0;padding-left:20px;color:#334155;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;\">");
        listOpen = true;
      }
      html.push(`<li style=\"margin-bottom:8px;font-size:15px;line-height:1.7;\">${safeInlineMarkdown(listItem[1])}</li>`);
      continue;
    }
    closeList();
    if (trimmed.startsWith("### ")) {
      html.push(`<h3 style=\"margin:24px 0 12px 0;font-size:17px;font-weight:800;color:#0f172a;font-family:'Outfit',sans-serif;letter-spacing:-0.2px;\">${safeInlineMarkdown(trimmed.slice(4))}</h3>`);
    } else if (trimmed.startsWith("## ")) {
      html.push(`<h2 style=\"margin:28px 0 14px 0;font-size:19px;font-weight:800;color:#0f172a;font-family:'Outfit',sans-serif;letter-spacing:-0.3px;\">${safeInlineMarkdown(trimmed.slice(3))}</h2>`);
    } else if (trimmed.startsWith("# ")) {
      html.push(`<h1 style=\"margin:32px 0 16px 0;font-size:22px;font-weight:800;color:#0f172a;font-family:'Outfit',sans-serif;letter-spacing:-0.4px;\">${safeInlineMarkdown(trimmed.slice(2))}</h1>`);
    } else {
      html.push(`<p style=\"margin:0 0 16px 0;font-size:15px;line-height:1.7;color:#334155;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;\">${safeInlineMarkdown(trimmed)}</p>`);
    }
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
