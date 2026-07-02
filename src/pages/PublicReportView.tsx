import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2, ShieldCheck, ShieldAlert, Download, FileText, Check, Copy } from 'lucide-react';
import { generateReportPDF } from '../utils/reportPdf';

const getBase64ImageFromUrl = async (url: string): Promise<string> => {
  const res = await fetch(url);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

export default function PublicReportView() {
  const { reportId } = useParams<{ reportId: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<any>(null);
  const [downloading, setDownloading] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const fetchReport = async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/public/reports/${reportId}`);
        const result = await res.json();

        if (!res.ok) {
          throw new Error(result.error || 'Não foi possível carregar o documento público.');
        }

        setData(result);
      } catch (err: any) {
        console.error('Erro ao buscar relatório público:', err);
        setError(err.message || 'Documento não encontrado ou indisponível.');
      } finally {
        setLoading(false);
      }
    };

    if (reportId) {
      fetchReport();
    }
  }, [reportId]);

  const handleCopyHash = () => {
    if (!data?.report?.signature_hash) return;
    navigator.clipboard.writeText(data.report.signature_hash);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadPDF = async () => {
    if (!data) return;
    setDownloading(true);
    try {
      const { report, patient, professional, brandSettings } = data;
      
      let logoBase64 = null;
      if (brandSettings?.logo_light_url) {
        try {
          logoBase64 = await getBase64ImageFromUrl(brandSettings.logo_light_url);
        } catch (err) {
          console.error("Erro ao pré-carregar logo:", err);
        }
      }

      // Configuração fake do siteConfig baseada nas configurações públicas
      const siteConfig = {
        pwa_app_name: brandSettings?.company_name || "Evolução Clínica",
        colors: {
          primary: brandSettings?.primary_color || "#005C13"
        }
      };

      const doc = generateReportPDF(report, patient, professional, siteConfig, logoBase64);
      const cleanPatientName = (patient?.full_name || 'Paciente').replace(/\s+/g, '_');
      const docLabel = report.type === 'evolution_report' ? 'Relatorio_Evolucao' : 'PDI';
      doc.save(`${docLabel}_${cleanPatientName}.pdf`);
    } catch (err) {
      console.error("Erro ao gerar PDF:", err);
      alert("Não foi possível gerar o PDF. Tente novamente.");
    } finally {
      setDownloading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-stone-50 flex flex-col items-center justify-center p-4">
        <div className="text-center space-y-4">
          <Loader2 className="w-10 h-10 animate-spin text-emerald-600 mx-auto" />
          <p className="text-sm font-medium text-stone-600">Verificando autenticidade do documento...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center p-4">
        <div className="bg-white border border-stone-200 shadow-xl rounded-3xl p-8 max-w-md w-full text-center space-y-6">
          <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center mx-auto text-red-500 border border-red-100">
            <ShieldAlert size={32} />
          </div>
          <div className="space-y-2">
            <h1 className="text-xl font-bold text-stone-800">Documento Indisponível</h1>
            <p className="text-sm text-stone-500 leading-relaxed">
              O documento solicitado não foi encontrado ou não está homologado. Por razões de privacidade e segurança (LGPD), apenas relatórios fechados e assinados digitalmente são disponibilizados para consulta pública.
            </p>
          </div>
          <div className="pt-2">
            <a
              href="/"
              className="inline-flex items-center justify-center w-full px-5 py-2.5 bg-stone-900 hover:bg-stone-800 text-white font-medium text-sm rounded-xl transition-colors"
            >
              Voltar ao Início
            </a>
          </div>
        </div>
      </div>
    );
  }

  const { report, patient, professional } = data;
  const formattedDate = new Date(report.signature_date || report.created_at).toLocaleString('pt-BR');
  const docLabel = report.type === 'evolution_report' ? 'Relatório de Evolução Clínico' : 'Plano de Desenvolvimento Individual (PDI)';

  return (
    <div className="min-h-screen bg-gradient-to-tr from-stone-100 via-stone-50 to-emerald-50/30 flex items-center justify-center p-4 font-sans">
      <div className="bg-white/80 backdrop-blur-md border border-stone-200/60 shadow-xl rounded-3xl p-6 sm:p-8 max-w-lg w-full space-y-6">
        
        {/* Cabeçalho */}
        <div className="text-center space-y-3">
          <div className="w-16 h-16 bg-emerald-50 rounded-2xl flex items-center justify-center mx-auto text-emerald-600 border border-emerald-100 animate-pulse">
            <ShieldCheck size={36} />
          </div>
          <div className="space-y-1">
            <span className="text-[10px] uppercase font-bold tracking-widest text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-100/50">
              Assinatura Válida
            </span>
            <h1 className="text-xl font-extrabold text-stone-800 pt-1">Autenticidade Garantida</h1>
            <p className="text-xs text-stone-500 max-w-xs mx-auto">
              Este documento foi assinado digitalmente e possui validade jurídica em conformidade com as normas regulamentares.
            </p>
          </div>
        </div>

        {/* Informações do Documento */}
        <div className="bg-stone-50/70 border border-stone-100 rounded-2xl p-4 space-y-3">
          <div className="flex justify-between items-center py-2 border-b border-stone-200/50 text-xs">
            <span className="text-stone-500 font-medium">Documento</span>
            <span className="text-stone-800 font-semibold text-right max-w-[200px] truncate" title={docLabel}>
              {docLabel}
            </span>
          </div>

          <div className="flex justify-between items-center py-2 border-b border-stone-200/50 text-xs">
            <span className="text-stone-500 font-medium">Paciente</span>
            <span className="text-stone-800 font-semibold text-right truncate max-w-[200px]">
              {patient?.full_name || 'Não informado'}
            </span>
          </div>

          <div className="flex justify-between items-start py-2 border-b border-stone-200/50 text-xs">
            <span className="text-stone-500 font-medium pt-0.5">Profissional</span>
            <div className="text-right">
              <p className="text-stone-800 font-semibold">{professional?.full_name || 'Não informado'}</p>
              {professional?.professional_register && (
                <p className="text-[10px] text-stone-400 font-medium">{professional.professional_register}</p>
              )}
            </div>
          </div>

          <div className="flex justify-between items-center py-2 border-b border-stone-200/50 text-xs">
            <span className="text-stone-500 font-medium">Assinado em</span>
            <span className="text-stone-800 font-semibold">{formattedDate}</span>
          </div>

          <div className="flex justify-between items-center py-2 text-xs">
            <span className="text-stone-500 font-medium">IP de Origem</span>
            <span className="text-stone-700 font-mono font-medium">{report.signature_ip || '---'}</span>
          </div>
        </div>

        {/* Bloco de Criptografia Hash */}
        <div className="bg-emerald-50/30 border border-emerald-100/50 rounded-2xl p-4 space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider">Hash de Integridade (SHA-256)</span>
            <button
              onClick={handleCopyHash}
              className="text-emerald-700 hover:text-emerald-800 transition-colors p-1 bg-white hover:bg-emerald-50 border border-emerald-200/50 rounded-lg text-[10px] flex items-center space-x-1"
              title="Copiar Hash Completo"
            >
              {copied ? <Check size={10} /> : <Copy size={10} />}
              <span>{copied ? 'Copiado!' : 'Copiar'}</span>
            </button>
          </div>
          <p className="text-[10px] font-mono text-stone-600 bg-white/70 border border-stone-200/40 rounded-xl p-2.5 break-all leading-normal">
            {report.signature_hash}
          </p>
        </div>

        {/* Botão de Ação */}
        <div className="space-y-3">
          <button
            onClick={handleDownloadPDF}
            disabled={downloading}
            className="w-full flex items-center justify-center space-x-2 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm rounded-xl shadow-lg shadow-emerald-600/10 hover:shadow-emerald-700/20 active:scale-[0.99] transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {downloading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Gerando PDF...</span>
              </>
            ) : (
              <>
                <Download size={16} />
                <span>Baixar Relatório Oficial (PDF)</span>
              </>
            )}
          </button>

          <p className="text-[9px] text-center text-stone-400">
            Segurança de ponta a ponta fornecida por Evolução Clínica.
          </p>
        </div>

      </div>
    </div>
  );
}
