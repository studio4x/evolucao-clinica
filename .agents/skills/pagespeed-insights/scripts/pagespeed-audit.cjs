const https = require('https');
const fs = require('fs');
const path = require('path');

const targetUrl = process.argv[2];
const strategy = process.argv[3] || 'mobile';

if (!targetUrl) {
  console.error('Erro: Por favor, forneça uma URL. Exemplo: node pagespeed-audit.cjs https://exemplo.com [mobile|desktop]');
  process.exit(1);
}

console.log(`Iniciando auditoria PageSpeed Insights para: ${targetUrl} (${strategy})...`);

const apiKey = process.env.PAGESPEED_API_KEY || '';
const apiKeyParam = apiKey ? `&key=${apiKey}` : '';
const apiEndpoint = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(targetUrl)}&category=performance&locale=pt-br&strategy=${strategy}${apiKeyParam}`;

https.get(apiEndpoint, (res) => {
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    try {
      const response = JSON.parse(data);
      if (response.error) {
        console.error('Erro na API PageSpeed:', response.error.message);
        process.exit(1);
      }

      const lighthouse = response.lighthouseResult;
      const categories = lighthouse.categories;
      const performance = categories.performance;
      const score = Math.round(performance.score * 100);

      const audits = lighthouse.audits;
      
      const metrics = {
        fcp: audits['first-contentful-paint']?.displayValue || 'N/A',
        lcp: audits['largest-contentful-paint']?.displayValue || 'N/A',
        tbt: audits['total-blocking-time']?.displayValue || 'N/A',
        cls: audits['cumulative-layout-shift']?.displayValue || 'N/A',
        si: audits['speed-index']?.displayValue || 'N/A',
        interactive: audits['interactive']?.displayValue || 'N/A',
      };

      // Extrai principais oportunidades de melhoria
      const opportunities = [];
      for (const key in audits) {
        const audit = audits[key];
        if (audit.details && audit.details.type === 'opportunity' && audit.details.overallSavingsMs > 0) {
          opportunities.push({
            title: audit.title,
            description: audit.description,
            savingsMs: audit.details.overallSavingsMs,
          });
        }
      }

      opportunities.sort((a, b) => b.savingsMs - a.savingsMs);

      const markdown = `
# Relatório de Auditoria PageSpeed Insights

* **URL Auditada**: ${targetUrl}
* **Dispositivo**: ${strategy.toUpperCase()}
* **Data**: ${new Date().toLocaleString('pt-BR')}
* **Nota de Performance**: **${score}/100**

---

## 📊 Métricas Principais (Lighthouse Core Web Vitals)

| Métrica | Valor | Descrição |
| :--- | :--- | :--- |
| **First Contentful Paint (FCP)** | ${metrics.fcp} | Tempo até o primeiro elemento visual aparecer |
| **Largest Contentful Paint (LCP)** | ${metrics.lcp} | Tempo até o maior conteúdo útil ser desenhado |
| **Total Blocking Time (TBT)** | ${metrics.tbt} | Tempo total de bloqueio de processamento JS |
| **Cumulative Layout Shift (CLS)** | ${metrics.cls} | Estabilidade visual da página |
| **Speed Index (SI)** | ${metrics.si} | Velocidade com que o conteúdo visível é preenchido |
| **Time to Interactive** | ${metrics.interactive} | Tempo até a página ficar totalmente interativa |

---

## 💡 Principais Oportunidades de Otimização

${opportunities.length === 0 ? '* Nenhuma oportunidade de otimização crítica identificada pelo Lighthouse.*' : opportunities.slice(0, 5).map(o => `
### 🔴 ${o.title}
* **Economia Estimada**: ~${(o.savingsMs / 1000).toFixed(2)}s
* **Detalhes**: ${o.description}
`).join('\n')}
`;

      const outputFilename = `pagespeed-report-${strategy}-${Date.now()}.md`;
      const outputPath = path.resolve(process.cwd(), outputFilename);
      fs.writeFileSync(outputPath, markdown.trim());

      console.log(`Auditoria concluída com sucesso!`);
      console.log(`Relatório salvo em: ${outputPath}`);
      console.log(`Nota Geral de Performance: ${score}/100`);
    } catch (err) {
      console.error('Erro ao processar resposta JSON da API:', err);
    }
  });
}).on('error', (err) => {
  console.error('Erro na requisição HTTP:', err.message);
});
