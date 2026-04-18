import React from 'react';
import { Users, Mic, FileText, CheckCircle2, Share2, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function Tutorial() {
  const navigate = useNavigate();

  const steps = [
    {
      icon: Users,
      title: 'Cadastrar Pacientes',
      description: 'Cadastre seus pacientes e vincule ou crie o prontuário no Google Docs com um clique.',
      color: 'bg-blue-500'
    },
    {
      icon: Mic,
      title: 'Gravar ou Enviar Áudio',
      description: 'Grave o relato da sessão diretamente no app ou envie um arquivo de áudio gravado previamente.',
      color: 'bg-green-500'
    },
    {
      icon: Share2,
      title: 'Compartilhar do WhatsApp',
      description: 'Compartilhe áudios recebidos ou gravados no WhatsApp diretamente com o app Evolução Clínica.',
      color: 'bg-brand-primary'
    },
    {
      icon: FileText,
      title: 'Transcrição com IA',
      description: 'Nossa IA transcreve, corrige e formata o texto para um padrão clínico profissional.',
      color: 'bg-purple-500'
    },
    {
      icon: CheckCircle2,
      title: 'Atualização Automática',
      description: 'O texto formatado é inserido automaticamente no início do Google Doc do paciente.',
      color: 'bg-orange-500'
    }
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-12">
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-display font-bold text-brand-primary">Guia de Uso</h1>
        <p className="text-brand-text-muted text-lg max-w-2xl mx-auto">
          Aprenda a tirar o máximo proveito da ferramenta e economizar horas de trabalho burocrático.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {steps.map((step, index) => {
          const Icon = step.icon;
          return (
            <div key={index} className="card p-6 flex flex-col md:flex-row items-center md:items-start space-y-4 md:space-y-0 md:space-x-6 hover:shadow-lg transition-shadow border-l-4 border-l-brand-primary">
              <div className={`${step.color} p-4 rounded-2xl text-white shadow-lg`}>
                <Icon size={32} />
              </div>
              <div className="flex-1 text-center md:text-left">
                <h3 className="text-xl font-display font-semibold text-brand-text flex items-center justify-center md:justify-start">
                  <span className="opacity-30 mr-2">0{index + 1}.</span>
                  {step.title}
                </h3>
                <p className="mt-2 text-brand-text-muted leading-relaxed italic">
                  "{step.description}"
                </p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="card p-8 bg-brand-primary text-white text-center space-y-6 overflow-hidden relative">
        <div className="absolute top-0 right-0 opacity-10 -mr-12 -mt-12">
          <CheckCircle2 size={240} />
        </div>
        <h2 className="text-2xl font-display font-bold relative z-10">Pronto para começar?</h2>
        <p className="opacity-90 relative z-10">Crie seu primeiro paciente e automatize seus atendimentos hoje mesmo.</p>
        <button 
          onClick={() => navigate('/patients/new')}
          className="bg-white text-brand-primary px-8 py-3 rounded-xl font-bold hover:bg-brand-bg transition-colors flex items-center space-x-2 mx-auto relative z-10"
        >
          <span>Cadastrar Novo Paciente</span>
          <ArrowRight size={20} />
        </button>
      </div>
    </div>
  );
}
