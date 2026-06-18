import React from 'react';
import { ArrowLeft, FileText } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function TermsOfService() {
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
            <FileText className="w-8 h-8 text-brand-primary" />
          </div>
          <h1 className="text-3xl font-display font-bold text-brand-primary">
            Termos de Serviço
          </h1>
        </div>

        <p className="text-sm text-brand-text-muted mb-8">
          Última atualização: 18 de junho de 2026
        </p>

        <div className="prose prose-slate max-w-none text-brand-text space-y-6 leading-relaxed">
          <section className="space-y-3">
            <h2 className="text-xl font-display font-semibold text-brand-primary">1. Aceitação dos Termos</h2>
            <p>
              Ao acessar e utilizar a plataforma <strong>Evolução Clínica</strong>, disponibilizada pelo <strong>Conexão Seres</strong>, 
              você concorda expressamente em cumprir e estar vinculado a estes Termos de Serviço. Caso não concorde com qualquer 
              uma das condições estabelecidas, você não deve utilizar o nosso aplicativo.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-display font-semibold text-brand-primary">2. Descrição do Serviço</h2>
            <p>
              O <strong>Evolução Clínica</strong> é um software como serviço (SaaS) projetado para profissionais de saúde e terapeutas. 
              A plataforma oferece ferramentas integradas de gravação de áudio, transcrição por Inteligência Artificial, 
              formatação e organização de prontuários clínicos, além de integração de armazenamento na conta do Google Drive do próprio usuário.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-display font-semibold text-brand-primary">3. Responsabilidade do Profissional de Saúde</h2>
            <p>
              Como usuário profissional da plataforma, você declara e garante que:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-sm md:text-base">
              <li>Possui registro profissional ativo no respectivo conselho de classe (CRP, CRM, CREFITO, etc.) aplicável à sua atuação.</li>
              <li>Obteve todos os consentimentos éticos e legais necessários de seus pacientes para realizar gravações e processar informações de saúde em conformidade com o código de ética profissional aplicável.</li>
              <li>É o único responsável pelo conteúdo das transcrições, diagnósticos, tratamentos e relatórios gerados ou mantidos na plataforma.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-display font-semibold text-brand-primary">4. Assinaturas, Pagamentos e Renovação</h2>
            <p>
              O acesso completo aos recursos da plataforma requer a contratação de um plano de assinatura recorrente (mensal, anual ou trial).
            </p>
            <ul className="list-disc pl-5 space-y-1 text-sm md:text-base">
              <li>As assinaturas são cobradas e renovadas automaticamente de acordo com o ciclo de faturamento escolhido.</li>
              <li>O cancelamento da renovação automática pode ser feito a qualquer momento através do painel de controle do usuário, com efeitos a partir do fim do ciclo de faturamento contratado.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-display font-semibold text-brand-primary">5. Limitação de Responsabilidade</h2>
            <p>
              A nossa plataforma utiliza sistemas automatizados de inteligência artificial de última geração. Embora façamos todos os esforços 
              para manter a máxima precisão, <strong>a Inteligência Artificial é uma ferramenta auxiliar e não substitui a revisão e aprovação final humana</strong>. 
              Não nos responsabilizamos por diagnósticos imprecisos ou falhas no tratamento decorrentes de omissões ou erros nas transcrições geradas pela IA.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-display font-semibold text-brand-primary">6. Modificações dos Termos</h2>
            <p>
              Reservamo-nos o direito de modificar estes Termos de Serviço a qualquer momento. Em caso de atualizações materiais, 
              notificaremos os usuários cadastrados através do aplicativo ou e-mail. A continuidade do uso da plataforma após 
              as modificações implica aceitação integral dos novos termos.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
