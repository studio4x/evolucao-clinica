import React from 'react';
import { ArrowLeft, Shield } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function PrivacyPolicy() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-brand-bg py-12 px-6 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto bg-white rounded-3xl shadow-xl shadow-brand-primary/5 border border-brand-primary/5 p-8 md:p-12 relative overflow-hidden">
        {/* Decorative background element */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-brand-primary/5 rounded-full blur-3xl pointer-events-none" />
        
        <button 
          onClick={() => navigate(-1)} 
          className="inline-flex items-center space-x-2 text-brand-primary hover:text-brand-primary-hover font-medium transition-colors mb-8 cursor-pointer"
        >
          <ArrowLeft size={18} />
          <span>Voltar</span>
        </button>

        <div className="flex items-center space-x-3 mb-6">
          <div className="p-3 bg-brand-primary/10 rounded-2xl">
            <Shield className="w-8 h-8 text-brand-primary" />
          </div>
          <h1 className="text-3xl font-display font-bold text-brand-primary">
            Política de Privacidade
          </h1>
        </div>

        <p className="text-sm text-brand-text-muted mb-8">
          Última atualização: 18 de junho de 2026
        </p>

        <div className="prose prose-slate max-w-none text-brand-text space-y-6 leading-relaxed">
          <section className="space-y-3">
            <h2 className="text-xl font-display font-semibold text-brand-primary">1. Informações Gerais</h2>
            <p>
              A sua privacidade é de extrema importância para nós. Esta Política de Privacidade descreve como a plataforma 
              <strong> Evolução Clínica</strong> coleta, utiliza, processa e protege as suas informações e os dados de seus pacientes, 
              em conformidade com a Lei Geral de Proteção de Dados (LGPD) e demais regulamentações vigentes.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-display font-semibold text-brand-primary">2. Coleta de Dados e Finalidade</h2>
            <p>
              Coletamos informações necessárias para a prestação de nossos serviços de transcrição, organização e estruturação 
              de prontuários clínicos e evoluções através de Inteligência Artificial:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-sm md:text-base">
              <li><strong>Dados de Acesso:</strong> Nome e e-mail via autenticação do Google para criar e gerenciar a sua conta de profissional de saúde.</li>
              <li><strong>Dados de Áudio e Texto:</strong> Gravações de áudio e transcrições fornecidas por você para a geração de resumos e relatórios de evolução clínica.</li>
              <li><strong>Prontuários e Documentos:</strong> Informações de pacientes inseridas na plataforma e subsequentemente salvas ou sincronizadas no seu Google Drive / Google Docs.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-display font-semibold text-brand-primary">3. Compartilhamento e Processamento por Inteligência Artificial</h2>
            <p>
              Os dados de voz e texto de evoluções clínicas são processados por modelos de Inteligência Artificial para realizar a 
              transcrição e a formatação estruturada do prontuário.
            </p>
            <p className="text-brand-text-muted bg-brand-bg p-4 rounded-xl border border-brand-border/50 text-sm">
              <strong>Importante:</strong> Não compartilhamos dados pessoais com terceiros para fins publicitários ou comerciais. 
              As APIs de Inteligência Artificial utilizadas cumprem com rígidos padrões de segurança e confidencialidade.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-display font-semibold text-brand-primary">4. Integração com o Google Workspace</h2>
            <p>
              A nossa plataforma solicita permissões para ler, gravar e organizar arquivos no seu Google Drive / Google Docs. 
              Essas permissões são utilizadas estritamente para salvar as evoluções clínicas dos seus pacientes na estrutura de pastas 
              que você escolher, mantendo o controle total dos documentos em sua própria conta do Google.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-display font-semibold text-brand-primary">5. Segurança dos Dados</h2>
            <p>
              Adotamos medidas técnicas, administrativas e organizacionais para proteger os dados pessoais contra acessos não autorizados, 
              perda, alteração ou destruição. Todas as comunicações são criptografadas via HTTPS (SSL/TLS).
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-display font-semibold text-brand-primary">6. Seus Direitos (LGPD)</h2>
            <p>
              Você possui os direitos garantidos pela LGPD, incluindo a confirmação do processamento, acesso, correção de dados incompletos ou inexatos, 
              e a eliminação de dados pessoais de nossa base de dados (salvo quando a retenção for obrigatória por lei ou regulação médica).
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-display font-semibold text-brand-primary">7. Contato</h2>
            <p>
              Para esclarecer dúvidas sobre esta Política de Privacidade ou exercer seus direitos de privacidade, entre em contato 
              conosco através do e-mail de suporte ou canais oficiais do <strong>Conexão Seres</strong>.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
