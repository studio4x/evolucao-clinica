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
          Última atualização: 12 de julho de 2026
        </p>

        <div className="prose prose-slate max-w-none text-brand-text space-y-6 leading-relaxed">
          <section className="space-y-3">
            <h2 className="text-xl font-display font-semibold text-brand-primary">1. Controlador e escopo</h2>
            <p>
              Esta Política descreve como o <strong>{LEGAL_APP_NAME}</strong> coleta,
              usa, compartilha, armazena e protege informações tratadas na plataforma, em conformidade com a LGPD e demais normas aplicáveis.
              Para fins desta política, atuamos como controlador dos dados relacionados à conta e ao funcionamento do serviço.
            </p>
            <p>
              Esta política também descreve, de forma específica, como tratamos dados obtidos por meio das APIs do Google e do Google Workspace
              quando o usuário decide conectar sua conta Google ao aplicativo.
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
              <li><strong>Metadados de consumo de IA:</strong> duração do áudio enviado, quantidade de solicitações, carimbos de data/hora e métricas necessárias para rate limiting, prevenção de abuso e política de uso justo.</li>
              <li><strong>Dados clínicos inseridos por você:</strong> áudios, transcrições, evoluções, documentos e informações de pacientes cadastradas na plataforma.</li>
              <li><strong>Dados de pagamento e assinatura:</strong> informações de plano, status financeiro e eventos de cobrança gerenciados pelos provedores contratados.</li>
            </ul>
            <p>
              Quando você conecta sua conta Google, também podemos acessar dados específicos do Google estritamente necessários para as funções que você ativar no produto.
            </p>
            <ul className="list-disc pl-5 space-y-1 text-sm md:text-base">
              <li><strong>Autenticação Google:</strong> identificadores básicos da conta, nome, e-mail e foto de perfil, conforme disponibilizados no fluxo de login.</li>
              <li><strong>Google Drive:</strong> arquivos e pastas criados, selecionados, organizados ou manipulados pelo próprio usuário dentro do fluxo clínico da plataforma.</li>
              <li><strong>Google Docs:</strong> conteúdo dos documentos vinculados ao prontuário clínico, quando o usuário cria, lê, atualiza, exporta ou sincroniza documentos pela plataforma.</li>
              <li><strong>Google Calendar:</strong> eventos da agenda em modo somente leitura, apenas quando o usuário ativa a integração de agenda.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-display font-semibold text-brand-primary">3. Finalidades de uso</h2>
            <p>
              Utilizamos os dados para autenticar o usuário, gerar transcrições, organizar evoluções clínicas, armazenar arquivos no Google Drive
              do próprio profissional, oferecer suporte, faturamento, prevenção a fraude, aplicar controles de segurança e uso justo, e manter a
              previsibilidade operacional do serviço.
            </p>
            <p>
              No caso dos dados obtidos via Google, o tratamento ocorre apenas para fornecer recursos visíveis e solicitados pelo próprio usuário dentro da interface do aplicativo.
            </p>
            <ul className="list-disc pl-5 space-y-1 text-sm md:text-base">
              <li><strong>Drive:</strong> criar, localizar, organizar, mover e manter pastas e arquivos clínicos vinculados ao fluxo do app.</li>
              <li><strong>Docs:</strong> criar prontuários, inserir evoluções, atualizar conteúdo, ler documentos vinculados e gerar exportações ou relatórios relacionados ao fluxo clínico.</li>
              <li><strong>Calendar:</strong> consultar eventos para relacionar compromissos aos pacientes ativos e apoiar a rotina clínica; não criamos, editamos nem excluímos eventos da agenda.</li>
            </ul>
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
            <p>
              Não vendemos dados brutos ou derivados obtidos do Google. Também não transferimos esses dados a terceiros para publicidade,
              corretagem de dados ou finalidades desconectadas das funcionalidades centrais da plataforma.
            </p>
            <p>
              Quando o usuário aciona recursos de IA ou automação, trechos estritamente necessários de áudios, transcrições, evoluções ou documentos
              podem ser processados por provedores técnicos contratados para executar a funcionalidade solicitada pelo próprio usuário.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-display font-semibold text-brand-primary">5. Proteção e segurança dos dados</h2>
            <p>
              Adotamos medidas técnicas e organizacionais para proteger os dados contra acesso não autorizado, alteração, perda ou divulgação indevida.
              Isso inclui controles de autenticação, segregação lógica por usuário, uso de tokens autorizados, comunicação segura com APIs e
              controles operacionais voltados à integridade e à confidencialidade das informações.
            </p>
            <p>
              O acesso humano aos dados é limitado às situações estritamente necessárias para suporte técnico, investigação de falhas, prevenção de abuso,
              cumprimento de obrigação legal ou solicitação explícita do próprio usuário.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-display font-semibold text-brand-primary">6. Cookies, sessão, retenção e exclusão</h2>
            <p>
              Usamos cookies e armazenamento local estritamente necessários para manter a sessão, lembrar preferências, registrar o estado de
              autenticação e melhorar a experiência do app. Não utilizamos cookies para publicidade comportamental.
            </p>
            <p>
              Os dados são mantidos enquanto a conta estiver ativa e pelo período necessário para cumprir obrigações legais, resolver disputas,
              preservar a segurança e atender solicitações do próprio usuário.
            </p>
            <p>
              O usuário pode solicitar a exclusão da conta e dos dados associados pelo painel da plataforma ou por solicitação de suporte.
              Quando aplicável, também pode revogar diretamente na própria conta Google as permissões concedidas ao aplicativo.
            </p>
            <p>
              A revogação do acesso Google interrompe as operações futuras dependentes dessa autorização. A exclusão da conta ou dos dados tratados
              pela plataforma seguirá os prazos técnicos e legais aplicáveis ao ambiente operacional do serviço.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-display font-semibold text-brand-primary">7. Direitos do titular</h2>
            <p>
              Você pode solicitar acesso, correção, portabilidade, anonimização, eliminação ou revogação de consentimento, quando aplicável.
            </p>
            <p>
              O profissional pode revogar permissões concedidas ao Google diretamente na conta Google e também solicitar suporte para remoção
              ou exportação dos dados tratados pela plataforma, respeitados os limites legais e regulatórios aplicáveis.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-display font-semibold text-brand-primary">8. Dados do Google Workspace e uso limitado</h2>
            <p>
              O uso de dados brutos ou derivados recebidos das APIs do Google Workspace estará em conformidade com a Política de Dados do Usuário dos
              Serviços de API do Google, incluindo os requisitos de Uso Limitado (Limited Use).
            </p>
            <p>
              Atualmente, o aplicativo solicita apenas os escopos OAuth necessários para as funcionalidades ativas e voltadas ao usuário.
              As permissões adicionais são apresentadas de forma incremental, somente quando o usuário acessa o recurso correspondente.
            </p>
            <ul className="list-disc pl-5 space-y-1 text-sm md:text-base">
              <li><strong>`https://www.googleapis.com/auth/drive.file`</strong>: criar, abrir, editar, organizar e manter somente os arquivos e pastas que o usuário utiliza com o aplicativo.</li>
              <li><strong>`https://www.googleapis.com/auth/documents`</strong>: ler e atualizar o conteúdo dos Google Docs vinculados ao prontuário e aos documentos clínicos operados pela plataforma.</li>
              <li><strong>`https://www.googleapis.com/auth/calendar.events.readonly`</strong>: consultar eventos do Google Calendar em modo somente leitura quando o usuário ativa a sincronização opcional de agenda.</li>
            </ul>
            <ul className="list-disc pl-5 space-y-1 text-sm md:text-base">
              <li>Esses dados são usados somente para entregar ou aprimorar recursos voltados ao usuário e claramente apresentados na interface do aplicativo.</li>
              <li>Esses dados não são vendidos e não são usados para publicidade direcionada.</li>
              <li>O aplicativo não utiliza dados das APIs do Google Workspace para desenvolver, melhorar ou treinar modelos próprios generalizados de IA ou ML.</li>
              <li>Se recursos de IA forem acionados pelo usuário, o tratamento ocorrerá apenas na medida necessária para executar a função solicitada dentro da plataforma.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-display font-semibold text-brand-primary">9. Contato</h2>
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
