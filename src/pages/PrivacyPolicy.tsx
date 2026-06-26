import React from 'react';
import { ArrowLeft, Shield } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { LEGAL_APP_NAME, LEGAL_SUPPORT_EMAIL } from '../utils/legal';

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
          Última atualização: 26 de junho de 2026
        </p>

        <div className="prose prose-slate max-w-none text-brand-text space-y-6 leading-relaxed">
          <section className="space-y-3">
            <h2 className="text-xl font-display font-semibold text-brand-primary">1. Controlador e escopo</h2>
            <p>
              Esta Política descreve como o <strong>{LEGAL_APP_NAME}</strong> coleta,
              usa, compartilha, armazena e protege informações tratadas na plataforma, em conformidade com a LGPD e demais normas aplicáveis.
              Para fins desta política, atuamos como controlador dos dados relacionados à conta e ao funcionamento do serviço.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-display font-semibold text-brand-primary">2. Dados que coletamos</h2>
            <p>
              Coletamos apenas os dados necessários para operar a conta, entregar as funcionalidades do aplicativo e manter a segurança:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-sm md:text-base">
              <li><strong>Dados de conta:</strong> nome, e-mail, foto de perfil e identificadores recebidos na autenticação com Google.</li>
              <li><strong>Dados operacionais:</strong> preferências, registros de uso, logs técnicos, tokens de sessão e configurações do dispositivo.</li>
              <li><strong>Dados clínicos inseridos por você:</strong> áudios, transcrições, evoluções, documentos e informações de pacientes cadastradas na plataforma.</li>
              <li><strong>Dados de pagamento e assinatura:</strong> informações de plano, status financeiro e eventos de cobrança gerenciados pelos provedores contratados.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-display font-semibold text-brand-primary">3. Finalidades de uso</h2>
            <p>
              Utilizamos os dados para autenticar o usuário, gerar transcrições, organizar evoluções clínicas, armazenar arquivos no Google Drive
              do próprio profissional, oferecer suporte, faturamento, prevenção a fraude e manutenção do serviço.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-display font-semibold text-brand-primary">4. Compartilhamento e operadores</h2>
            <p>
              Não vendemos dados pessoais nem usamos informações clínicas para publicidade. Compartilhamos dados somente com provedores
              necessários para a operação do serviço, incluindo autenticação, infraestrutura, armazenamento, e processamento de IA.
              Isso pode incluir Google, Supabase e outros prestadores técnicos contratados para executar funcionalidades específicas.
            </p>
            <p className="text-brand-text-muted bg-brand-bg p-4 rounded-xl border border-brand-border/50 text-sm">
              As permissões do Google Workspace são usadas somente para criar, ler, organizar e gravar documentos e arquivos na conta do próprio
              usuário, conforme as ações solicitadas dentro do aplicativo.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-display font-semibold text-brand-primary">5. Cookies, sessão e retenção</h2>
            <p>
              Usamos cookies e armazenamento local estritamente necessários para manter a sessão, lembrar preferências, registrar o estado de
              autenticação e melhorar a experiência do app. Não utilizamos cookies para publicidade comportamental.
            </p>
            <p>
              Os dados são mantidos enquanto a conta estiver ativa e pelo período necessário para cumprir obrigações legais, resolver disputas,
              preservar a segurança e atender solicitações do próprio usuário.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-display font-semibold text-brand-primary">6. Segurança e direitos do titular</h2>
            <p>
              Adotamos medidas técnicas e organizacionais para proteger os dados contra acesso não autorizado, alteração, perda ou divulgação
              indevida. Você pode solicitar acesso, correção, portabilidade, anonimização, eliminação ou revogação de consentimento,
              quando aplicável.
            </p>
            <p>
              O profissional pode revogar permissões concedidas ao Google diretamente na conta Google e também solicitar suporte para remoção
              ou exportação dos dados tratados pela plataforma, respeitados os limites legais e regulatórios aplicáveis.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-display font-semibold text-brand-primary">7. Contato</h2>
            <p>
              Para dúvidas sobre esta política, solicitações relacionadas à privacidade ou exercício de direitos, entre em contato com
              a equipe do <strong>{LEGAL_APP_NAME}</strong> pelo e-mail{' '}
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
