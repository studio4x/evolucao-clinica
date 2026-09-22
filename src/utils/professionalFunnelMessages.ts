export type ProfessionalFunnelMessageStage =
  | 'registered'
  | 'first_patient'
  | 'linked_record'
  | 'first_evolution'
  | 'returned'
  | 'paid';

export type ProfessionalFunnelMessageCommercialStatus =
  | 'paid'
  | 'courtesy'
  | 'trial_active'
  | 'trial_expired'
  | 'no_plan';

export type ProfessionalFunnelMessage = {
  subject: string;
  preheader: string;
  paragraphs: string[];
  actionLabel: string;
  actionPath: string;
  whatsappText: string;
};

export type ProfessionalWhatsAppTarget = 'web' | 'desktop';

export const PROFESSIONAL_FUNNEL_WHATSAPP_TARGET_STORAGE_KEY = 'evolucao-clinica:admin-funnel-whatsapp-target';

const APP_ORIGIN = 'https://www.evolucaoclinica.app.br';

const firstNameFrom = (fullName: string) => {
  const firstName = String(fullName || '').trim().split(/\s+/)[0];
  return firstName || 'profissional';
};

const joinWhatsAppMessage = (firstName: string, paragraphs: string[], actionLabel: string, actionPath: string) => [
  `Olá, ${firstName}! Tudo bem?`,
  '',
  ...paragraphs,
  '',
  `${actionLabel}: ${APP_ORIGIN}${actionPath}`,
  '',
  'Se precisar de ajuda, estou à disposição.',
].join('\n');

export function buildProfessionalFunnelMessage(input: {
  fullName: string;
  stage: ProfessionalFunnelMessageStage;
  commercialStatus: ProfessionalFunnelMessageCommercialStatus;
  whatsappVerified?: boolean;
}): ProfessionalFunnelMessage {
  const firstName = firstNameFrom(input.fullName);
  let subject: string;
  let preheader: string;
  let paragraphs: string[];
  let actionLabel: string;
  let actionPath: string;

  switch (input.stage) {
    case 'registered':
      subject = input.whatsappVerified ? 'Continue sua jornada na Evolução Clínica' : 'Vamos concluir seu acesso à Evolução Clínica?';
      preheader = input.whatsappVerified ? 'Seu WhatsApp está confirmado. Continue pelo próximo passo.' : 'Falta apenas validar seu WhatsApp para avançar.';
      paragraphs = input.whatsappVerified
        ? [
          'Seu cadastro na Evolução Clínica já foi criado e seu WhatsApp está confirmado.',
          'Agora você pode continuar a configuração guiada ou conhecer o aplicativo primeiro.',
        ]
        : [
          'Seu cadastro na Evolução Clínica já foi criado.',
          'Falta apenas confirmar seu WhatsApp para liberar o próximo passo e começar a conhecer a plataforma. Essa confirmação leva menos de um minuto.',
        ];
      actionLabel = 'Continuar configuração';
      actionPath = '/onboarding';
      break;
    case 'first_patient':
      subject = 'Conecte o prontuário do seu primeiro paciente';
      preheader = 'Vincule o Google Docs para manter o prontuário organizado.';
      paragraphs = [
        'Seu primeiro paciente já está cadastrado. O próximo passo é vincular o prontuário ao Google Docs.',
        'Assim, as evoluções concluídas poderão ser organizadas automaticamente no documento do paciente.',
      ];
      actionLabel = 'Vincular prontuário';
      actionPath = '/painel/patients';
      break;
    case 'linked_record':
      subject = 'Sua primeira evolução está a um passo';
      preheader = 'O prontuário está conectado e pronto para receber a evolução.';
      paragraphs = [
        'Você já cadastrou um paciente e vinculou o prontuário. Agora falta experimentar o principal fluxo da Evolução Clínica.',
        'Abra o paciente, registre a evolução e deixe a plataforma organizar o texto no prontuário conectado.',
      ];
      actionLabel = 'Criar primeira evolução';
      actionPath = '/painel/patients';
      break;
    case 'first_evolution':
      subject = 'Sua primeira evolução foi concluída';
      preheader = 'Continue usando a plataforma em seus próximos atendimentos.';
      paragraphs = [
        'Parabéns: sua primeira evolução já foi concluída na Evolução Clínica.',
        'Volte no próximo atendimento para consolidar sua rotina e aproveitar melhor o histórico, os prontuários e a organização do dia a dia.',
      ];
      actionLabel = 'Voltar ao aplicativo';
      actionPath = '/painel/dashboard';
      break;
    case 'returned':
      if (input.commercialStatus === 'courtesy') {
        subject = 'Continue aproveitando a Evolução Clínica';
        preheader = 'Sua rotina já está em andamento na plataforma.';
        paragraphs = [
          'Você já utilizou a Evolução Clínica em diferentes dias e avançou pelos principais recursos.',
          'Continue registrando seus atendimentos para manter prontuários e evoluções organizados em um só lugar.',
        ];
        actionLabel = 'Continuar usando';
        actionPath = '/painel/dashboard';
      } else if (input.commercialStatus === 'trial_expired') {
        subject = 'Seu progresso continua salvo na Evolução Clínica';
        preheader = 'Escolha um plano para retomar o acesso completo.';
        paragraphs = [
          'Você já conheceu os principais recursos da Evolução Clínica e todo o seu progresso continua salvo.',
          'Para retomar o acesso completo e continuar organizando seus atendimentos, escolha o plano que melhor combina com sua rotina.',
        ];
        actionLabel = 'Conhecer os planos';
        actionPath = '/painel/subscription';
      } else {
        subject = 'Você já avançou na Evolução Clínica';
        preheader = 'Garanta a continuidade da sua rotina na plataforma.';
        paragraphs = [
          'Você já voltou à plataforma e conheceu os principais recursos na prática.',
          'Conheça os planos disponíveis para manter prontuários, evoluções e sua rotina profissional sempre organizados.',
        ];
        actionLabel = 'Conhecer os planos';
        actionPath = '/painel/subscription';
      }
      break;
    case 'paid':
      subject = 'Seu plano está ativo na Evolução Clínica';
      preheader = 'Continue aproveitando todos os recursos da plataforma.';
      paragraphs = [
        'Seu plano está ativo e sua conta está pronta para continuar acompanhando seus atendimentos.',
        'Conte com a Evolução Clínica para organizar pacientes, prontuários e evoluções. Se precisar, nosso suporte está disponível dentro do aplicativo.',
      ];
      actionLabel = 'Acessar a plataforma';
      actionPath = '/painel/dashboard';
      break;
    default: {
      const unreachable: never = input.stage;
      throw new Error(`Etapa de funil não suportada: ${unreachable}`);
    }
  }

  if (input.commercialStatus === 'trial_expired' && input.stage !== 'paid') {
    const nextGoal: Record<Exclude<ProfessionalFunnelMessageStage, 'paid'>, string> = {
      registered: input.whatsappVerified ? 'continuar a configuração da conta' : 'concluir a configuração da conta',
      first_patient: 'vincular seu primeiro prontuário',
      linked_record: 'concluir sua primeira evolução',
      first_evolution: 'continuar usando a plataforma nos próximos atendimentos',
      returned: 'continuar organizando sua rotina profissional',
    };
    preheader = 'Seu período de teste terminou, mas todo o progresso continua salvo.';
    paragraphs = [
      paragraphs[0],
      `Seu período de teste terminou, mas todo o seu progresso continua salvo. Para ${nextGoal[input.stage]}, escolha um plano e retome o acesso completo.`,
    ];
    actionLabel = 'Retomar acesso';
    actionPath = '/painel/subscription';
  }

  return {
    subject,
    preheader,
    paragraphs,
    actionLabel,
    actionPath,
    whatsappText: joinWhatsAppMessage(firstName, paragraphs, actionLabel, actionPath),
  };
}

const normalizeRefundReason = (reason: string) => String(reason || '')
  .trim()
  .toLocaleLowerCase('pt-BR')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '');

const firstNameFromRefundContact = (fullName: string) => {
  const firstName = String(fullName || '').trim().split(/\s+/)[0];
  return firstName || 'profissional';
};

export function buildRefundWhatsAppMessage(input: { fullName?: string; reason?: string }) {
  const firstName = firstNameFromRefundContact(input.fullName || '');
  const reason = String(input.reason || '').trim() || 'não informou um motivo específico';
  const normalizedReason = normalizeRefundReason(reason);

  let question = 'Qual parte da experiência não funcionou bem para você? Se puder, conte um pouco mais para nos ajudar a melhorar.';

  if (/(dificil|complic|confus|usab|pratic|n[aã]o pratic)/.test(normalizedReason)) {
    question = 'Você poderia me contar qual parte ficou mais difícil ou pouco prática? Foi o cadastro de pacientes, a criação das evoluções, a transcrição, a organização dos registros ou outra etapa?';
  } else if (/(erro|bug|problema|falha|trav|carreg)/.test(normalizedReason)) {
    question = 'Você poderia me dizer em qual tela o problema aconteceu e, se possível, o que apareceu? Assim conseguimos investigar e corrigir com mais precisão.';
  } else if (/(preco|valor|caro|custo)/.test(normalizedReason)) {
    question = 'O que pesou mais para você: o valor da assinatura ou a percepção de que os recursos não compensaram o investimento?';
  } else if (/(recurso|funcional|faltou|falta)/.test(normalizedReason)) {
    question = 'Qual recurso ou possibilidade você sentiu falta? Essa informação ajuda bastante a priorizar nossas melhorias.';
  } else if (/(tempo|usei|utiliz|nao usei|desist)/.test(normalizedReason)) {
    question = 'Você sentiu dificuldade para começar ou acabou não encontrando uma oportunidade de usar a plataforma na sua rotina?';
  }

  return [
    `Olá, ${firstName}! Tudo bem?`,
    '',
    'Aqui é da equipe da Evolução Clínica. Vi que você solicitou o reembolso e informou o seguinte motivo:',
    `"${reason}"`,
    '',
    'Antes de encerrarmos, gostaria muito de entender melhor a sua experiência.',
    question,
    '',
    'Seu retorno é importante para que possamos tornar a plataforma mais simples e útil para profissionais como você. Obrigado!'
  ].join('\n');
}

export function buildProfessionalWhatsAppUrl(phoneNumber: string, message: string, target: ProfessionalWhatsAppTarget = 'web') {
  const normalizedPhone = String(phoneNumber || '').replace(/\D/g, '');
  if (normalizedPhone.length < 8 || normalizedPhone.length > 15) return null;
  const encodedMessage = encodeURIComponent(message);
  return target === 'desktop'
    ? `whatsapp://send?phone=${normalizedPhone}&text=${encodedMessage}`
    : `https://web.whatsapp.com/send?phone=${normalizedPhone}&text=${encodedMessage}`;
}

export function readProfessionalWhatsAppTarget(): ProfessionalWhatsAppTarget {
  if (typeof window === 'undefined') return 'web';
  try {
    return window.localStorage.getItem(PROFESSIONAL_FUNNEL_WHATSAPP_TARGET_STORAGE_KEY) === 'desktop' ? 'desktop' : 'web';
  } catch {
    return 'web';
  }
}

export function persistProfessionalWhatsAppTarget(target: ProfessionalWhatsAppTarget) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(PROFESSIONAL_FUNNEL_WHATSAPP_TARGET_STORAGE_KEY, target);
  } catch {
    // A preferência local não pode interromper o uso do funil.
  }
}
