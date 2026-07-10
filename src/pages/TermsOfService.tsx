import React from 'react';
import { ArrowLeft, FileText } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { LEGAL_APP_NAME, LEGAL_SUPPORT_EMAIL } from '../utils/legal';

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
          Última atualização: 10 de julho de 2026
        </p>

        <div className="prose prose-slate max-w-none text-brand-text space-y-6 leading-relaxed">
          <section className="space-y-3">
            <h2 className="text-xl font-display font-semibold text-brand-primary">1. Aceitação dos Termos</h2>
            <p>
              Ao acessar ou utilizar o <strong>{LEGAL_APP_NAME}</strong>, você
              concorda com estes Termos de Serviço. Caso não concorde com qualquer condição aqui descrita, não utilize a plataforma.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-display font-semibold text-brand-primary">2. Descrição do Serviço</h2>
            <p>
              O <strong>{LEGAL_APP_NAME}</strong> é um software como serviço projetado para profissionais de saúde e terapeutas. A plataforma
              oferece gravação de áudio, transcrição por inteligência artificial, organização de prontuários e integração com o Google Drive
              do próprio usuário.
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
              <li>É o único responsável pelo conteúdo inserido na plataforma, incluindo transcrições, evoluções, relatórios, diagnósticos e condutas clínicas.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-display font-semibold text-brand-primary">4. Uso permitido e restrições</h2>
            <p>
              Você concorda em utilizar o serviço apenas para fins lícitos e profissionais. É proibido tentar acessar dados de terceiros sem autorização,
              comprometer a segurança do sistema, distribuir conteúdo malicioso ou usar a plataforma para atividades ilegais, antiéticas ou fora
              do objetivo declarado do produto.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-display font-semibold text-brand-primary">5. Transcrição por IA, limites técnicos e uso justo</h2>
            <p>
              Para preservar a estabilidade da plataforma, a segurança operacional e a previsibilidade de custos, a funcionalidade de transcrição
              de áudio está sujeita a limites técnicos e comerciais.
            </p>
            <ul className="list-disc pl-5 space-y-1 text-sm md:text-base">
              <li>Cada evolução aceita áudios de até 20 minutos e até 20 MB por arquivo.</li>
              <li>O uso da rota de transcrição pode ser limitado a até 5 solicitações por minuto por profissional autenticado.</li>
              <li>As transcrições de áudio estão sujeitas a política de uso justo de até 1.200 minutos por mês por profissional, salvo contratação de capacidade adicional.</li>
              <li>Ao atingir o limite mensal vigente, novas transcrições poderão ser bloqueadas até a renovação do ciclo ou aquisição de pacote complementar.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-display font-semibold text-brand-primary">6. Assinaturas, cancelamento e reembolso</h2>
            <p>
              O acesso integral ao serviço pode depender de plano de assinatura ativo. As condições comerciais, renovação, cobrança e cancelamento
              são exibidas no aplicativo no momento da contratação e podem ser atualizadas conforme a oferta vigente.
            </p>
            <p>
              Quando aplicável, cancelamentos e reembolsos seguem a legislação brasileira de proteção ao consumidor e as regras informadas no painel
              do usuário ou no fluxo de pagamento.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-display font-semibold text-brand-primary">7. Serviços de terceiros e inteligência artificial</h2>
            <p>
              A plataforma integra serviços de terceiros, inclusive provedores de autenticação, armazenamento, infraestrutura e IA.
              O uso desses serviços é restrito à execução das funcionalidades solicitadas pelo usuário.
            </p>
            <p>
              A inteligência artificial atua como ferramenta auxiliar. O profissional permanece responsável pela revisão, validação e uso final
              de qualquer conteúdo gerado.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-display font-semibold text-brand-primary">8. Limitação de responsabilidade</h2>
            <p>
              Não garantimos que a plataforma estará livre de interrupções, falhas ocasionais ou indisponibilidades de terceiros. Na extensão
              permitida pela lei, não nos responsabilizamos por decisões clínicas, administrativas ou financeiras tomadas exclusivamente com base
              em conteúdo gerado automaticamente.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-display font-semibold text-brand-primary">9. Alterações e contato</h2>
            <p>
              Podemos atualizar estes Termos de Serviço periodicamente. Mudanças materiais poderão ser comunicadas no aplicativo ou por e-mail.
              O uso contínuo após a publicação das alterações significa aceitação dos novos termos.
            </p>
            <p>
              Dúvidas sobre estes Termos podem ser enviadas para{' '}
              <a href={`mailto:${LEGAL_SUPPORT_EMAIL}`} className="text-brand-primary hover:underline">
                {LEGAL_SUPPORT_EMAIL}
              </a>.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
