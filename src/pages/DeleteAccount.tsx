import React from 'react';
import { ArrowLeft, Trash2, Mail, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { LEGAL_APP_NAME, LEGAL_SUPPORT_EMAIL } from '../utils/legal';

export default function DeleteAccount() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-brand-bg py-12 px-6 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto bg-white rounded-3xl shadow-xl shadow-brand-primary/5 border border-brand-primary/5 p-8 md:p-12 relative overflow-hidden">
        {/* Decorative background element */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-brand-primary/5 rounded-full blur-3xl pointer-events-none" />
        
        <button 
          onClick={() => navigate('/')} 
          className="inline-flex items-center space-x-2 text-brand-primary hover:text-brand-primary-hover font-medium transition-colors mb-8 cursor-pointer"
        >
          <ArrowLeft size={18} />
          <span>Voltar para o Início</span>
        </button>

        <div className="flex items-center space-x-3 mb-6">
          <div className="p-3 bg-red-50 rounded-2xl">
            <Trash2 className="w-8 h-8 text-red-600" />
          </div>
          <h1 className="text-3xl font-display font-bold text-brand-primary">
            Exclusão de Conta e Dados
          </h1>
        </div>

        <p className="text-sm text-brand-text-muted mb-8">
          Última atualização: 3 de julho de 2026
        </p>

        <div className="prose prose-slate max-w-none text-brand-text space-y-6 leading-relaxed">
          <p className="text-base md:text-lg">
            Em conformidade com a Lei Geral de Proteção de Dados (LGPD) e as políticas de segurança da Google Play Store, o <strong>{LEGAL_APP_NAME}</strong> assegura a todos os usuários o direito de solicitar a eliminação definitiva de suas contas e de todos os dados pessoais ou clínicos associados.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
            {/* Opção 1: Pelo painel */}
            <div className="bg-brand-bg/50 border border-brand-border/40 p-6 rounded-2xl flex flex-col justify-between">
              <div>
                <h3 className="text-lg font-display font-bold text-brand-primary mb-3">Opção 1: Excluir pelo Painel</h3>
                <p className="text-sm text-brand-text-muted leading-relaxed mb-4">
                  Se você ainda possui acesso à sua conta, a forma mais rápida é fazer login e solicitar a exclusão imediata nas configurações de perfil.
                </p>
              </div>
              <button
                onClick={() => navigate('/login?redirect=/painel/profile')}
                className="w-full py-2.5 px-4 bg-brand-primary hover:bg-brand-primary-hover text-white rounded-xl font-semibold text-sm transition-colors cursor-pointer flex items-center justify-center space-x-2"
              >
                <span>Acessar Painel</span>
                <ExternalLink size={16} />
              </button>
            </div>

            {/* Opção 2: Solicitação Manual */}
            <div className="bg-brand-bg/50 border border-brand-border/40 p-6 rounded-2xl flex flex-col justify-between">
              <div>
                <h3 className="text-lg font-display font-bold text-brand-primary mb-3">Opção 2: Solicitação Manual</h3>
                <p className="text-sm text-brand-text-muted leading-relaxed mb-4">
                  Se você já desinstalou o aplicativo ou não consegue mais fazer login, você pode solicitar a exclusão enviando um e-mail para o nosso suporte.
                </p>
              </div>
              <a
                href={`mailto:${LEGAL_SUPPORT_EMAIL}?subject=Solicitação de Exclusão de Conta - ${LEGAL_APP_NAME}`}
                className="w-full py-2.5 px-4 bg-white border border-brand-border text-brand-text hover:bg-brand-bg rounded-xl font-semibold text-sm transition-colors text-center cursor-pointer flex items-center justify-center space-x-2"
              >
                <Mail size={16} className="text-brand-primary" />
                <span>Solicitar por E-mail</span>
              </a>
            </div>
          </div>

          <section className="space-y-3 mt-8">
            <h2 className="text-xl font-display font-semibold text-brand-primary">O que acontece ao excluir sua conta?</h2>
            <p>
              Ao confirmar a exclusão da sua conta, os seguintes dados serão eliminados de forma definitiva e irreversível dos nossos servidores após um período de processamento de até 5 dias úteis:
            </p>
            <ul className="list-disc pl-5 space-y-2 text-sm md:text-base">
              <li>Seu perfil profissional (nome, e-mail, foto e registros de login).</li>
              <li>Todas as fichas e dados cadastrais dos seus pacientes.</li>
              <li>Histórico completo de evoluções clínicas, relatórios e assinaturas digitais.</li>
              <li>Dados de faturamento e histórico de transações internas.</li>
            </ul>
            <p className="text-brand-text-muted bg-yellow-50 p-4 rounded-xl border border-yellow-200 text-sm mt-4">
              <strong>Aviso Importante:</strong> Esta ação é definitiva. Após a conclusão do processo, nenhuma informação clínica ou histórico de evolução poderá ser recuperado.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-display font-semibold text-brand-primary">Dúvidas e Contato</h2>
            <p>
              Se você tiver qualquer dúvida sobre o processo de exclusão de dados ou sobre a nossa política de privacidade, entre em contato conosco pelo e-mail{' '}
              <a href={`mailto:${LEGAL_SUPPORT_EMAIL}`} className="text-brand-primary hover:underline font-semibold">
                {LEGAL_SUPPORT_EMAIL}
              </a>.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
