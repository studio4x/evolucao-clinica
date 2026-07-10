---
name: google-pagespeed-insights
description: Skill local para obter auditorias em tempo real do Google PageSpeed Insights sobre qualquer URL, permitindo monitoramento de Core Web Vitals e identificação de gargalos móveis.
---

# Google PageSpeed Insights Skill

Esta skill fornece instruções e scripts para que o Antigravity execute auditorias de desempenho em tempo real usando a API oficial pública do Google PageSpeed Insights.

## 🚀 Como Usar a Skill

Quando o usuário solicitar uma auditoria de performance em qualquer URL, você deve:

1. Executar o script utilitário em Node.js localizado em `.agents/skills/pagespeed-insights/scripts/pagespeed-audit.cjs`.
2. Passar a URL e a estratégia (mobile ou desktop) como argumentos.
3. Exemplo de comando no terminal:
   ```bash
   node .agents/skills/pagespeed-insights/scripts/pagespeed-audit.cjs https://www.evolucaoclinica.app.br/ mobile
   ```
4. O script fará uma requisição HTTP segura para a API do Google, processará os Core Web Vitals (FCP, LCP, TBT, CLS) e gerará um arquivo de relatório em Markdown chamado `pagespeed-report-<strategy>-<timestamp>.md` na raiz do workspace.
5. Leia o relatório gerado e apresente os resultados finais detalhados para o usuário.
