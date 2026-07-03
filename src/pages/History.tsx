import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../supabaseClient';
import { useAuthStore } from '../store/authStore';
import { Link } from 'react-router-dom';
import { Clock, CheckCircle, AlertCircle, RefreshCw, Loader2, Trash2, FileText, User, Shield, Printer, Download } from 'lucide-react';
import { jsPDF } from 'jspdf';
import { GoogleGenAI } from "@google/genai";
import { appendToGoogleDoc } from '../services/googleDocs';
import { GOOGLE_SCOPE_SETS, hasGoogleScopes, requestGoogleOAuth, getCurrentGoogleOAuthRedirectUrl } from '../services/googleAuth';
import { useSiteConfig } from '../hooks/useSiteConfig';

const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = (reader.result as string).split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

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

const hexToRgb = (hex: string) => {
  const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
  const fullHex = hex.replace(shorthandRegex, (_, r, g, b) => r + r + g + g + b + b);
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(fullHex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
};

export default function History() {
  const siteConfig = useSiteConfig();
  const [evolutions, setEvolutions] = useState<any[]>([]);
  const [patientsMap, setPatientsMap] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [isClearing, setIsClearing] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const { user, googleAccessToken, googleGrantedScopes, setGoogleAccessToken } = useAuthStore();
  const hasClinicalAccess = Boolean(googleAccessToken) && hasGoogleScopes(googleGrantedScopes, GOOGLE_SCOPE_SETS.clinicalDocs);

  const [professional, setProfessional] = useState<any>(null);
  const [printMode, setPrintMode] = useState<'prontuario' | 'report' | null>(null);
  const [printDocType, setPrintDocType] = useState('');
  const [printPeriodLabel, setPrintPeriodLabel] = useState('');
  const [printSignatureInfo, setPrintSignatureInfo] = useState<any>(null);
  const [prontuarioDocContent, setProntuarioDocContent] = useState('');
  const [printPatientName, setPrintPatientName] = useState('');

  const fetchHistory = async () => {
    if (!user) return;
    try {
      const { data: evos, error: evosError } = await supabase
        .from('evolutions')
        .select('*')
        .eq('professional_id', user.id)
        .eq('transcription_status', 'completed')
        .order('created_at', { ascending: false });
      
      if (evosError) throw evosError;
      
      // Fetch patient details for each evolution
      const pMap: Record<string, any> = { ...patientsMap };
      const patientIds = [...new Set((evos || []).map(e => e.patient_id))];
      
      for (const pid of patientIds) {
        if (pMap[pid]) continue;
        const { data: pData, error: pError } = await supabase
          .from('patients')
          .select('*')
          .eq('id', pid)
          .single();
        if (!pError && pData) {
          pMap[pid] = pData;
        }
      }
      
      setPatientsMap(pMap);
      setEvolutions(evos || []);

      const { data: profData, error: profError } = await supabase
        .from('professionals')
        .select('full_name, professional_title, professional_register')
        .eq('id', user.id)
        .single();
      if (!profError && profData) {
        setProfessional(profData);
      }
    } catch (error) {
      console.error("Error fetching history:", error);
    } finally {
      setLoading(false);
    }
  };

  const generateEvolutionPDF = (evo: any, pat: any, prof: any, logoBase64?: string | null) => {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 20; // 2cm Margem Esquerda
    const contentWidth = pageWidth - (2 * margin); // 2cm Margem Direita (20mm)

    const primaryRgb = hexToRgb(siteConfig.colors?.primary || '#005C13') || { r: 0, g: 92, b: 19 };

    // Cabecalho Timbrado
    let taglineX = margin;
    const appName = siteConfig.pwa_app_name || "Evolução Clínica";

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
    doc.text('Evolução Clínica', margin, 38);

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
    doc.text(`Data da Sessão: ${new Date(evo.created_at).toLocaleString('pt-BR')}`, margin + contentWidth / 2, y);
    
    y += 8;
    doc.setDrawColor(231, 229, 228);
    doc.setLineWidth(0.2);
    doc.line(margin, y, pageWidth - 20, y);

    // Conteúdo da Evolução
    y += 10;
    
    const lines = (evo.transcription_text || evo.content || '').split('\n');
    
    for (const line of lines) {
      if (y > 270) {
        doc.addPage();
        y = 20; // reset y
      }

      const trimmed = line.trim();
      if (!trimmed) {
        y += 4;
        continue;
      }

      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(28, 25, 22);
      
      const splitText = doc.splitTextToSize(trimmed, contentWidth);
      
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

    // Carimbo de Assinatura se estiver assinado
    if (evo.status === 'signed') {
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
      doc.text(`Assinado por: ${evo.signed_by_name || prof?.full_name} (${evo.signed_by_register || prof?.professional_register})`, margin + 5, y + 14);
      
      const formattedDate = new Date(evo.signature_date || evo.created_at).toLocaleString('pt-BR');
      doc.text(`Data/Hora: ${formattedDate}`, margin + 5, y + 20);
      doc.text(`IP de Origem: ${evo.signature_ip || '127.0.0.1'}   |   Algoritmo: SHA-256`, margin + 5, y + 26);
      
      doc.setFont('Courier', 'normal');
      doc.setFontSize(7);
      doc.text(`Hash: ${evo.signature_hash || ''}`, margin + 5, y + 32);
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
      doc.setTextColor(120, 113, 108);

      const pageText = `Página ${i} de ${totalPages}`;
      
      if (evo.status === 'signed') {
        const shortHash = evo.signature_hash ? `${evo.signature_hash.substring(0, 16)}...` : '';
        const formattedDate = new Date(evo.signature_date || evo.created_at).toLocaleDateString('pt-BR');
        
        // Linha 1: Dados do profissional
        const line1 = `Assinado Digitalmente por: ${evo.signed_by_name || prof?.full_name} (${evo.signed_by_register || prof?.professional_register})`;
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

  const handlePrintEvolution = (evo: any) => {
    const evolutionText = (evo.transcription_text || evo.content || '').trim();

    if (!evolutionText) {
      alert('Esta evolução não possui conteúdo para impressão.');
      return;
    }

    const patient = patientsMap[evo.patient_id];
    setPrintPatientName(patient?.full_name || 'Paciente');
    const originalTitle = document.title;
    const cleanPatientName = (patient?.full_name || 'Paciente').replace(/\s+/g, '_');
    const cleanDate = new Date(evo.created_at).toLocaleDateString('pt-BR').replace(/\//g, '-');
    document.title = `Evolucao_Clinica_${cleanPatientName}_${cleanDate}`;

    setPrintMode('prontuario');
    setPrintDocType('Evolução Clínica');
    setPrintPeriodLabel('');
    setProntuarioDocContent(`Data da evolução: ${formatDateTime(evo.created_at)}\n\n${evolutionText}`);
    
    if (evo.status === 'signed') {
      setPrintSignatureInfo({
        method: evo.signature_method,
        date: evo.signature_date,
        ip: evo.signature_ip,
        hash: evo.signature_hash,
        name: evo.signed_by_name || professional?.full_name,
        register: evo.signed_by_register || professional?.professional_register
      });
    } else {
      setPrintSignatureInfo(null);
    }

    setTimeout(() => {
      window.print();
      document.title = originalTitle;
      setPrintMode(null);
    }, 200);
  };

  useEffect(() => {
    fetchHistory();
  }, [user]);

  const handleReprocess = async (evo: any) => {
    if (!user) return;
    
    let currentToken = googleAccessToken;

    // 1. Check for Google Token
    if (!currentToken || !hasClinicalAccess) {
      try {
        const { error } = await requestGoogleOAuth({
          requiredScopes: 'clinicalDocs',
          currentGrantedScopes: googleGrantedScopes,
          redirectTo: getCurrentGoogleOAuthRedirectUrl()
        });
        if (error) throw error;
        return;
      } catch (error) {
        console.error("Re-auth error:", error);
        alert("Erro ao autenticar com o Google.");
        return;
      }
    }

    const patient = patientsMap[evo.patient_id];
    if (!patient || !patient.google_doc_id) {
      alert("Paciente ou prontuário não encontrado.");
      return;
    }

    setProcessingId(evo.id);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 300000); // 5 minutes timeout
    
    const maxRetries = 2;
    let retryCount = 0;

    const attemptProcess = async () => {
      try {
        // 1. Fetch audio and transcribe with Gemini (Frontend)
        console.log("Iniciando transcrição no frontend...");
        
        const apiKey = process.env.GEMINI_API_KEY_REAL
          || process.env.GEMINI_API_KEY
          || import.meta.env.VITE_GEMINI_API_KEY_REAL
          || import.meta.env.VITE_GEMINI_API_KEY
          || '';

        if (!apiKey) {
          throw new Error("Chave da API Gemini não encontrada no ambiente.");
        }

        const audioResponse = await fetch(evo.audio_url);
        if (!audioResponse.ok) throw new Error("Falha ao baixar áudio para reprocessamento.");
        const audioBlob = await audioResponse.blob();
        
        const ai = new GoogleGenAI({ apiKey });
        const base64Audio = await blobToBase64(audioBlob);
        
        const prompt = `Transcreva integralmente este áudio clínico em português do Brasil, preservando o sentido do relato da terapeuta ocupacional. Corrija apenas vícios de fala, repetições desnecessárias e ruídos de linguagem. Não invente informações. Entregue um texto corrido, claro, profissional e pronto para ser inserido em prontuário clínico.`;

        const geminiResponse = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: {
            parts: [
              { text: prompt },
              { inlineData: { data: base64Audio, mimeType: audioBlob.type || 'audio/webm' } }
            ]
          }
        });

        const transcription = geminiResponse.text;
        if (!transcription) {
          throw new Error("A IA não retornou nenhuma transcrição.");
        }

        console.log("Transcrição concluída. Inserindo no Google Docs...");

        // 2. Insert transcription to Google Docs directly from frontend
        await appendToGoogleDoc(
          currentToken!,
          patient.google_doc_id,
          evo.session_date,
          transcription,
          {
            sessionTime: (evo as any).session_time || undefined,
            evolutionId: evo.id
          }
        );

        // Update Supabase with success
        const { error: updateError } = await supabase
          .from('evolutions')
          .update({
            transcription_status: 'completed',
            transcription_text: transcription,
            google_doc_append_status: 'completed',
            google_doc_append_at: new Date().toISOString(),
            error_message: null,
            updated_at: new Date().toISOString()
          })
          .eq('id', evo.id);
        if (updateError) throw updateError;

        // Gravando log de uso no Supabase
        const usageMetadata = (geminiResponse as any).usageMetadata;
        if (usageMetadata) {
          const promptTokens = usageMetadata.promptTokenCount || 0;
          const candidatesTokens = usageMetadata.candidatesTokenCount || 0;
          const totalTokens = usageMetadata.totalTokenCount || 0;
          const costUsd = (promptTokens * 0.00000030) + (candidatesTokens * 0.00000250);

          await supabase.from('usage_logs').insert({
            professional_id: user.id,
            model: "gemini-2.5-flash",
            prompt_tokens: promptTokens,
            candidates_tokens: candidatesTokens,
            total_tokens: totalTokens,
            cost_usd: costUsd,
            audio_duration_seconds: evo.audio_duration_seconds || 0,
            created_at: new Date().toISOString()
          });
        }

        clearTimeout(timeoutId);
        await fetchHistory();
        alert("Evolução reprocessada com sucesso!");
      } catch (error: any) {
        if (error.name === 'AbortError' || error.message?.includes('aborted')) {
          const abortError = new Error("O processamento demorou muito tempo ou foi cancelado pelo navegador.");
          abortError.name = 'AbortError';
          throw abortError;
        }

        if (retryCount < maxRetries && (error.message === 'Failed to fetch' || error.message?.includes('network'))) {
          retryCount++;
          console.log(`Retrying process-evolution... Attempt ${retryCount}`);
          await new Promise(resolve => setTimeout(resolve, 2000 * retryCount));
          return attemptProcess();
        }
        throw error;
      }
    };

    try {
      // Update status to processing
      const { error: updateError } = await supabase
        .from('evolutions')
        .update({
          transcription_status: 'processing',
          google_doc_append_status: 'pending',
          updated_at: new Date().toISOString()
        })
        .eq('id', evo.id);
      if (updateError) throw updateError;

      await attemptProcess();
    } catch (error: any) {
      clearTimeout(timeoutId);
      console.error("Reprocessing error:", error);
      
      let msg = error.message || "Erro desconhecido";
      if (error.name === 'AbortError') {
        msg = "O processamento demorou muito tempo e foi cancelado.";
      } else if (msg.includes('401') || msg.includes('UNAUTHENTICATED') || msg.includes('Invalid Credentials')) {
        msg = "Sua sessão do Google expirou. Por favor, renove a autenticação clicando no botão 'Renovar Autenticação Google' no topo da página.";
        setGoogleAccessToken(null);
      }
      
      const { error: updateError } = await supabase
        .from('evolutions')
        .update({
          transcription_status: 'failed',
          error_message: msg,
          updated_at: new Date().toISOString()
        })
        .eq('id', evo.id);
      if (updateError) throw updateError;
      
      await fetchHistory();
      alert(`Erro ao reprocessar: ${msg}`);
    } finally {
      setProcessingId(null);
    }
  };

  const handleClearEvolutions = async () => {
    setIsClearing(true);
    try {
      const { error } = await supabase
        .from('evolutions')
        .delete()
        .eq('professional_id', user.id);
      if (error) throw error;
      setEvolutions([]);
      setShowClearConfirm(false);
    } catch (error) {
      console.error("Error clearing evolutions:", error);
      alert("Erro ao limpar evoluções.");
    } finally {
      setIsClearing(false);
    }
  };

  const formatDateTime = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) return <div className="p-8 text-center">Carregando histórico...</div>;

  return (
    <>
      <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-display font-semibold text-brand-primary">Histórico de Evoluções</h1>
        {evolutions.length > 0 && (
          <button 
            onClick={() => setShowClearConfirm(true)}
            className="text-red-600 hover:text-red-700 flex items-center space-x-1 text-sm font-medium transition-colors"
          >
            <Trash2 size={18} />
            <span>Limpar Histórico</span>
          </button>
        )}
      </div>

      {showClearConfirm && (
        <div className="bg-red-50 border rounded-2xl p-6 border-red-100 shadow-sm">
          <p className="text-red-900 font-medium mb-2">Deseja limpar todo o seu histórico de evoluções?</p>
          <p className="text-sm text-red-700 mb-4">
            Esta ação removerá o histórico de <strong>todos os pacientes</strong> apenas aqui na plataforma. 
            O conteúdo já inserido no Google Docs <strong>NÃO</strong> será afetado.
          </p>
          <div className="flex space-x-3">
            <button 
              onClick={handleClearEvolutions}
              disabled={isClearing}
              className="bg-red-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-red-700 disabled:opacity-50 flex items-center space-x-2 transition-colors"
            >
              {isClearing && <Loader2 size={14} className="animate-spin" />}
              <span>Confirmar Limpeza</span>
            </button>
            <button 
              onClick={() => setShowClearConfirm(false)}
              className="btn-outline"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      <div className="card">
        <div className="divide-y divide-brand-border">
          {evolutions.length === 0 ? (
            <div className="p-8 text-center text-brand-text-muted">
              Nenhuma evolução registrada.
            </div>
          ) : (
            evolutions.map((evo) => {
              const patient = patientsMap[evo.patient_id];
              return (
                <div key={evo.id} className="p-6 hover:bg-brand-bg transition-colors">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <div className="flex items-center space-x-2 mb-1">
                        <Clock size={16} className="text-brand-text-muted" />
                        <span className="font-medium text-brand-text text-sm">{formatDateTime(evo.created_at)}</span>
                        {evo.status === 'signed' ? (
                          <span className="text-[10px] bg-emerald-100 text-emerald-800 font-semibold px-2 py-0.5 rounded-full flex items-center gap-1">
                            <Shield size={10} />
                            <span>Assinado</span>
                          </span>
                        ) : (
                          <span className="text-[10px] bg-amber-100 text-amber-800 font-semibold px-2 py-0.5 rounded-full">
                            Rascunho
                          </span>
                        )}
                      </div>
                      <Link to={`/painel/patients/${evo.patient_id}`} className="text-brand-primary hover:text-brand-primary-hover hover:underline font-semibold text-lg">
                        {patient?.full_name || 'Paciente Desconhecido'}
                      </Link>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      {evo.status === 'signed' && (
                        <button
                          type="button"
                          onClick={async () => {
                            let logoBase64 = null;
                            if (siteConfig.logo_light_url) {
                              try {
                                logoBase64 = await getBase64ImageFromUrl(siteConfig.logo_light_url);
                              } catch (err) {
                                console.error("Error preloading logo:", err);
                              }
                            }
                            const doc = generateEvolutionPDF(evo, patient, professional, logoBase64);
                            const cleanPatientName = (patient?.full_name || 'Paciente').replace(/\s+/g, '_');
                            const cleanDate = new Date(evo.created_at).toLocaleDateString('pt-BR').replace(/\//g, '-');
                            doc.save(`Evolucao_Clinica_${cleanPatientName}_${cleanDate}.pdf`);
                          }}
                          className="btn-outline py-1.5 px-3 text-xs flex items-center space-x-1.5 border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 cursor-pointer font-semibold"
                          title="Baixar PDF do Prontuário Assinado"
                        >
                          <Download size={14} />
                          <span>Baixar PDF</span>
                        </button>
                      )}
                      
                      <button
                        type="button"
                        onClick={() => handlePrintEvolution(evo)}
                        className="btn-outline py-1.5 px-3 text-xs flex items-center space-x-1.5 border-brand-border bg-white text-brand-text hover:bg-gray-50 cursor-pointer"
                        title="Imprimir evolução"
                      >
                        <Printer size={14} />
                        <span>Imprimir</span>
                      </button>

                      {patient?.google_doc_id && (
                        <a
                          href={`https://docs.google.com/document/d/${patient.google_doc_id}/edit`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn-outline py-1.5 px-3 text-xs flex items-center space-x-1.5 border-brand-primary/20 text-brand-primary hover:bg-brand-primary/5 cursor-pointer"
                        >
                          <FileText size={14} />
                          <span>Acessar Documento</span>
                        </a>
                      )}
                      <Link
                        to={`/painel/patients/${evo.patient_id}`}
                        className="btn-primary py-1.5 px-3 text-xs flex items-center space-x-1.5 cursor-pointer"
                      >
                        <User size={14} />
                        <span>Acessar Paciente</span>
                      </Link>
                    </div>
                  </div>
                  
                  {evo.transcription_text && (
                    <div className="mt-4 text-sm text-brand-text-muted bg-brand-bg p-4 rounded-xl border border-brand-border space-y-2">
                      <p className="line-clamp-2">{evo.transcription_text}</p>
                      {evo.status === 'signed' && (
                        <div className="text-[10px] text-emerald-700 flex items-center space-x-1.5 pt-2 border-t border-emerald-100/50">
                          <Shield size={12} className="text-emerald-500 shrink-0" />
                          <span>Assinado Digitalmente ({evo.signature_method === 'govbr' ? 'Gov.br' : 'Chave do App'}) em {formatDateTime(evo.signature_date)}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>

    {/* Portal de Impressão de prontuário/relatório (fora do #root do App) */}
    {printMode && createPortal(
      <div id="print-area">
        {/* Logo/Timbre fictício */}
        <div className="flex justify-between items-center border-b-2 border-brand-primary pb-3 mb-6">
          <div className="flex items-center gap-4">
            {siteConfig.logo_light_url ? (
              <div className="bg-white p-1 rounded border border-stone-100 flex items-center justify-center">
                <img src={siteConfig.logo_light_url} alt="Logo" className="h-10 object-contain bg-white" style={{ backgroundColor: '#ffffff' }} />
              </div>
            ) : (
              <h1 className="text-xl font-display font-bold text-brand-primary leading-none">{siteConfig.pwa_app_name || "Evolução Clínica"}</h1>
            )}
            <div className="border-l border-stone-300 pl-4 py-0.5 flex flex-col justify-center">
              <span className="text-[20px] font-bold text-stone-800 leading-tight" style={{ fontFamily: 'Outfit, ui-sans-serif, system-ui, sans-serif' }}>
                Plataforma Inteligente de Acompanhamento Terapêutico
              </span>
              <span className="text-[10px] text-stone-500 font-medium leading-none mt-1">
                Emitido por evolucaoclinica.app.br
              </span>
            </div>
          </div>
          <div className="text-right text-xs shrink-0">
            <p className="font-bold text-brand-text">Paciente: {printPatientName}</p>
          </div>
        </div>

        <div className="flex justify-between items-start text-xs border-b border-brand-border pb-4 mb-6">
          <div>
            <p className="font-semibold text-brand-text uppercase tracking-wider text-[10px] text-brand-text-muted mb-1">Documento</p>
            <p className="font-semibold text-sm text-brand-primary">{printDocType}</p>
          </div>
          <div className="text-right">
            <p className="font-semibold text-brand-text uppercase tracking-wider text-[10px] text-brand-text-muted mb-1">Profissional Responsável</p>
            <p className="font-semibold text-brand-text">{professional?.full_name}</p>
            {professional?.professional_register && (
              <p className="text-brand-text-muted text-[10px]">{professional.professional_register}</p>
            )}
          </div>
        </div>

        {/* Conteudo Dinâmico */}
        <div className="whitespace-pre-wrap font-sans text-sm text-stone-800 leading-relaxed">
          {prontuarioDocContent}
        </div>

        {/* Assinatura / Rodapé */}
        {printSignatureInfo ? (
          <div className="mt-12 pt-4 border-t-2 border-dashed border-emerald-300 bg-emerald-50/50 p-4 rounded-xl text-xs space-y-2 text-stone-800" style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}>
            <div className="flex items-center space-x-2 text-emerald-700 font-bold">
              <Shield size={14} className="text-emerald-600" />
              <span>DOCUMENTO ASSINADO DIGITALMENTE VIA CHAVE DO APLICATIVO</span>
            </div>
            <p>O profissional acima declarou a autoria deste registro clínico no sistema em conformidade com as diretrizes do conselho federal de sua categoria.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[10px] text-stone-600 font-mono mt-2 bg-white/70 p-2.5 rounded-lg border border-emerald-100">
              <p><strong>Assinado por:</strong> {printSignatureInfo.name || professional?.full_name} ({printSignatureInfo.register || professional?.professional_register})</p>
              <p><strong>Data/Hora Assinatura:</strong> {new Date(printSignatureInfo.date).toLocaleString('pt-BR')}</p>
              <p><strong>IP de Origem:</strong> {printSignatureInfo.ip}</p>
              <p className="sm:col-span-2 break-all"><strong>Hash SHA-256:</strong> {printSignatureInfo.hash}</p>
            </div>
          </div>
        ) : (
          <div className="mt-16 pt-8 flex flex-col items-center" style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}>
            <div className="w-48 border-b border-brand-text-muted/30"></div>
            <p className="text-xs font-semibold text-brand-text mt-2">{professional?.full_name}</p>
            <p className="text-[10px] text-brand-text-muted">{professional?.professional_register}</p>
          </div>
        )}
      </div>,
      document.body
    )}
    </>
  );
}
