export type LifecycleTemplateContext = Record<string, string | number | null | undefined>;

export const LIFECYCLE_TOKEN_REGISTRY = {
  primeiro_nome: (context: LifecycleTemplateContext) => context.primeiro_nome || "Profissional",
  nome_completo: (context: LifecycleTemplateContext) => context.nome_completo || context.primeiro_nome || "Profissional",
  profissao: (context: LifecycleTemplateContext) => context.profissao || "profissional",
  quantidade_pacientes: (context: LifecycleTemplateContext) => context.quantidade_pacientes ?? 0,
  quantidade_prontuarios: (context: LifecycleTemplateContext) => context.quantidade_prontuarios ?? 0,
  quantidade_evolucoes: (context: LifecycleTemplateContext) => context.quantidade_evolucoes ?? 0,
  quantidade_audios: (context: LifecycleTemplateContext) => context.quantidade_audios ?? 0,
  quantidade_documentos: (context: LifecycleTemplateContext) => context.quantidade_documentos ?? 0,
  quantidade_recursos: (context: LifecycleTemplateContext) => context.quantidade_recursos ?? 0,
  plano_atual: (context: LifecycleTemplateContext) => context.plano_atual || "seu plano atual",
  data_fim_teste: (context: LifecycleTemplateContext) => context.data_fim_teste || "a data informada na sua conta",
  dias_restantes_teste: (context: LifecycleTemplateContext) => context.dias_restantes_teste ?? 0,
  proxima_acao: (context: LifecycleTemplateContext) => context.proxima_acao || "continuar na plataforma",
  link_acao: (context: LifecycleTemplateContext) => context.link_acao || "/painel/dashboard",
  link_suporte: (context: LifecycleTemplateContext) => context.link_suporte || "/painel/support"
} as const;

export function renderLifecycleTemplate(template: string | null | undefined, context: LifecycleTemplateContext): string {
  const source = String(template || "");
  return source.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, token: string) => {
    const resolver = LIFECYCLE_TOKEN_REGISTRY[token as keyof typeof LIFECYCLE_TOKEN_REGISTRY];
    if (!resolver) return "";
    const value = resolver(context);
    if (value === null || value === undefined || value === "" || value === "NaN") return "";
    return String(value);
  }).replace(/\b(null|undefined|NaN)\b/g, "").replace(/[ \t]{2,}/g, " ");
}

export function getUnresolvedLifecycleTokens(template: string | null | undefined): string[] {
  const tokens = [...String(template || "").matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g)].map((match) => match[1]);
  return tokens.filter((token) => !(token in LIFECYCLE_TOKEN_REGISTRY));
}
