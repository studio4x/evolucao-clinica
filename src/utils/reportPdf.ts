import { jsPDF } from 'jspdf';

const hexToRgb = (hex: string) => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
};

export const generateReportPDF = (
  rep: any,
  pat: any,
  prof: any,
  siteConfig: any,
  logoBase64?: string | null
) => {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 20; // 2cm Margem Esquerda
  const contentWidth = pageWidth - (2 * margin); // 2cm Margem Direita (20mm)

  const primaryRgb = hexToRgb(siteConfig?.colors?.primary || '#005C13') || { r: 0, g: 92, b: 19 };

  // Cabecalho Timbrado
  let taglineX = margin;
  const appName = siteConfig?.pwa_app_name || "Evolução Clínica";

  if (logoBase64) {
    // Garantir fundo branco sob o logo
    doc.setFillColor(255, 255, 255);
    doc.rect(margin, 11, 40, 14, 'F');
    
    try {
      doc.addImage(logoBase64, 'PNG', margin, 11, 40, 14, undefined, 'FAST');
    } catch (err) {
      console.error("Error drawing logo in PDF:", err);
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(18);
      doc.setTextColor(primaryRgb.r, primaryRgb.g, primaryRgb.b);
      doc.text(appName, margin, 20);
    }
    
    // Linha divisória vertical
    doc.setDrawColor(200, 195, 190); // stone-300
    doc.setLineWidth(0.25);
    doc.line(margin + 44, 11, margin + 44, 25);
    
    taglineX = margin + 48;
  } else {
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(18);
    doc.setTextColor(primaryRgb.r, primaryRgb.g, primaryRgb.b);
    doc.text(appName, margin, 20);
    
    const appNameWidth = doc.getTextWidth(appName);
    
    // Linha divisória vertical
    doc.setDrawColor(200, 195, 190); // stone-300
    doc.setLineWidth(0.25);
    doc.line(margin + appNameWidth + 5, 11, margin + appNameWidth + 5, 25);
    
    taglineX = margin + appNameWidth + 9;
  }

  // Tagline na mesma linha com tipografia Outfit/Helvetica Bold 11, e subtexto abaixo
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(28, 25, 22); // text-stone-800
  doc.text("Plataforma Inteligente de Acompanhamento Terapêutico", taglineX, 16);
  
  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(120, 113, 108); // text-stone-500
  doc.text("Emitido por evolucaoclinica.app.br", taglineX, 21);

  doc.setDrawColor(primaryRgb.r, primaryRgb.g, primaryRgb.b);
  doc.setLineWidth(0.5);
  doc.line(margin, 28, pageWidth - 20, 28);

  // Identificação do Documento
  doc.setFontSize(12);
  doc.setFont('Helvetica', 'bold');
  doc.setTextColor(primaryRgb.r, primaryRgb.g, primaryRgb.b);
  const docTitle = rep.type === 'evolution_report' ? 'Relatório de Evolução Clínico' : 'Plano de Desenvolvimento Individual (PDI)';
  doc.text(docTitle, margin, 38);

  // Tabela de Dados
  doc.setFontSize(9);
  doc.setFont('Helvetica', 'normal');
  doc.setTextColor(28, 25, 22); // text-color
  
  let y = 46;
  doc.text(`Paciente: ${pat?.full_name || 'Não informado'}`, margin, y);
  doc.text(`Profissional: ${prof?.full_name || 'Não informado'}`, margin + contentWidth / 2, y);
  
  y += 6;
  if (prof?.professional_register) {
    doc.text(`Registro Profissional: ${prof.professional_register}`, margin, y);
  }
  doc.text(`Período de Análise: ${rep.period_label || 'Não informado'}`, margin + contentWidth / 2, y);
  
  y += 8;
  doc.setDrawColor(231, 229, 228);
  doc.setLineWidth(0.2);
  doc.line(margin, y, pageWidth - 20, y);

  // Conteúdo do Relatório
  y += 10;
  
  // Dividir o conteudo em linhas de markdown
  const lines = (rep.content || '').split('\n');
  
  for (const line of lines) {
    if (y > 270) {
      doc.addPage();
      y = 20; // reset y
    }

    const trimmed = line.trim();
    if (!trimmed) {
      y += 4; // espaco em branco
      continue;
    }

    if (trimmed.startsWith('# ')) {
      y += 4;
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(14);
      doc.setTextColor(primaryRgb.r, primaryRgb.g, primaryRgb.b);
      doc.text(trimmed.substring(2), margin, y);
      y += 8;
    } else if (trimmed.startsWith('## ')) {
      y += 3;
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(primaryRgb.r, primaryRgb.g, primaryRgb.b);
      doc.text(trimmed.substring(3), margin, y);
      y += 6;
    } else if (trimmed.startsWith('---')) {
      y += 2;
      doc.setDrawColor(231, 229, 228);
      doc.line(margin, y, pageWidth - 20, y);
      y += 4;
    } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(28, 25, 22);
      
      const text = trimmed.substring(2).replace(/\*\*([^*]+)\*\*/g, '$1');
      const splitText = doc.splitTextToSize(text, contentWidth - 6);
      
      for (let i = 0; i < splitText.length; i++) {
        if (y > 270) {
          doc.addPage();
          y = 20;
        }
        if (i === 0) {
          doc.text("•", margin, y);
          doc.text(splitText[i], margin + 5, y);
        } else {
          doc.text(splitText[i], margin + 5, y);
        }
        y += 5.5;
      }
      y += 1.5;
    } else {
      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(28, 25, 22);
      
      const text = trimmed.replace(/\*\*([^*]+)\*\*/g, '$1');
      const splitText = doc.splitTextToSize(text, contentWidth);
      
      for (let i = 0; i < splitText.length; i++) {
        if (y > 270) {
          doc.addPage();
          y = 20;
        }
        doc.text(splitText[i], margin, y);
        y += 5.5;
      }
      y += 2;
    }
  }

  // Carimbo de Assinatura se estiver assinado
  if (rep.status === 'signed') {
    y += 12;
    if (y > 230) {
      doc.addPage();
      y = 30;
    }
    
    // Caixa de Assinatura
    doc.setFillColor(240, 253, 244); // bg-emerald-50
    doc.setDrawColor(167, 243, 208); // border-emerald-200
    doc.setLineWidth(0.3);
    doc.rect(margin, y, contentWidth, 38, 'FD');

    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(4, 120, 87); // text-emerald-700
    doc.text("DOCUMENTO ASSINADO DIGITALMENTE VIA CHAVE DO APLICATIVO", margin + 5, y + 6);

    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(55, 65, 81);
    doc.text(`Assinado por: ${rep.signed_by_name} (${rep.signed_by_register})`, margin + 5, y + 14);
    
    const formattedDate = new Date(rep.signature_date).toLocaleString('pt-BR');
    doc.text(`Data/Hora: ${formattedDate}`, margin + 5, y + 20);
    doc.text(`IP de Origem: ${rep.signature_ip}   |   Algoritmo: SHA-256`, margin + 5, y + 26);
    
    doc.setFont('Courier', 'normal');
    doc.setFontSize(7);
    doc.text(`Hash: ${rep.signature_hash}`, margin + 5, y + 32);
  } else {
    // Rodapé normal de assinatura manual
    y += 20;
    if (y > 250) {
      doc.addPage();
      y = 30;
    }
    doc.setDrawColor(87, 83, 78);
    doc.setLineWidth(0.3);
    doc.line(pageWidth / 2 - 30, y, pageWidth / 2 + 30, y);
    
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(28, 25, 22);
    doc.text(prof?.full_name || 'Profissional de Saúde', pageWidth / 2, y + 5, { align: 'center' });
    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(prof?.professional_register || '', pageWidth / 2, y + 9, { align: 'center' });
  }

  // Rodapé de Assinatura Corrente em Todas as Páginas
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    
    // Desenhar uma linha sutil acima do rodape
    doc.setDrawColor(231, 229, 228);
    doc.setLineWidth(0.2);
    doc.line(margin, 281, pageWidth - 20, 281);

    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(120, 113, 108); // text-stone-500

    const pageText = `Página ${i} de ${totalPages}`;
    
    if (rep.status === 'signed') {
      const shortHash = rep.signature_hash ? `${rep.signature_hash.substring(0, 16)}...` : '';
      const formattedDate = new Date(rep.signature_date).toLocaleDateString('pt-BR');
      
      // Linha 1: Dados do profissional
      const line1 = `Assinado Digitalmente por: ${rep.signed_by_name} (${rep.signed_by_register})`;
      doc.text(line1, margin, 285);
      
      // Linha 2: Data, Hash e Página
      const line2 = `Data: ${formattedDate} | Hash: ${shortHash}`;
      doc.text(line2, margin, 289);
      
      doc.text(pageText, pageWidth - 20 - doc.getTextWidth(pageText), 289);
    } else {
      const line1 = `Rascunho de Documento - Não possui validade jurídica antes de ser assinado`;
      doc.text(line1, margin, 285);
      doc.text(pageText, pageWidth - 20 - doc.getTextWidth(pageText), 289);
    }
  }

  return doc;
};
