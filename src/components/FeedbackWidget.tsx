import React, { useState, useEffect } from 'react';
import { MessageSquare, Star, Send, X, CheckCircle2, ShieldAlert, Lightbulb } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { useAuthStore } from '../store/authStore';

export const FeedbackWidget = () => {
  const { user } = useAuthStore();
  
  // Modal states
  const [isOpen, setIsOpen] = useState(false);
  const [rating, setRating] = useState<number>(0);
  const [hoverRating, setHoverRating] = useState<number>(0);
  const [category, setCategory] = useState<'suggestion' | 'bug' | 'new_feature' | 'other'>('suggestion');
  const [message, setMessage] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  
  // Status states
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Busca o nome do usuário logado se ele estiver autenticado
  useEffect(() => {
    if (user) {
      setEmail(user.email || '');
      
      const fetchProfileName = async () => {
        const { data, error } = await supabase
          .from('professionals')
          .select('full_name')
          .eq('id', user.id)
          .single();
        if (!error && data) {
          setName(data.full_name || '');
        }
      };
      fetchProfileName();
    } else {
      setName('');
      setEmail('');
    }
  }, [user, isOpen]);

  // Reseta os estados ao fechar ou após envio bem-sucedido
  const handleClose = () => {
    setIsOpen(false);
    // Só reseta se foi sucesso para não perder o que foi digitado em caso de clique acidental fora
    if (success) {
      setRating(0);
      setCategory('suggestion');
      setMessage('');
      setSuccess(false);
      setError(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (rating === 0) {
      setError('Por favor, selecione uma nota de 1 a 5 estrelas.');
      return;
    }
    if (!message.trim()) {
      setError('Por favor, escreva a sua mensagem.');
      return;
    }
    if (!name.trim() && !user) {
      setError('Por favor, informe seu nome.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { error: insertError } = await supabase
        .from('app_feedback')
        .insert([
          {
            user_id: user?.id || null,
            user_name: name.trim() || 'Anônimo',
            user_email: email.trim() || null,
            rating,
            category,
            message: message.trim(),
            status: 'new'
          }
        ]);

      if (insertError) throw insertError;

      setSuccess(true);
    } catch (err: any) {
      console.error('Erro ao enviar feedback:', err);
      setError(err.message || 'Ocorreu um erro ao enviar sua sugestão. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Botão de Aba Lateral Esquerda (Estilo Feedback/Sugestões) */}
      <button
        onClick={() => setIsOpen(true)}
        className="fixed left-0 top-[45%] -translate-y-1/2 z-[60] bg-[#076c9a] text-white flex flex-col items-center gap-2.5 py-4 px-2 rounded-r-xl shadow-lg border border-l-0 border-white/10 cursor-pointer hover:pr-3.5 hover:bg-[#065b82] transition-all duration-200 select-none group"
        title="Enviar sugestão de melhoria"
      >
        <Lightbulb className="w-4.5 h-4.5 group-hover:animate-pulse text-amber-300 shrink-0" />
        <span 
          className="font-bold text-[9px] uppercase tracking-wider select-none font-sans" 
          style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
        >
          Sugestões
        </span>
      </button>

      {/* Modal Overlay */}
      {isOpen && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[80] animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl border border-gray-100 shadow-2xl max-w-md w-full p-6 relative overflow-hidden animate-in zoom-in-95 duration-200">
            
            {/* Botão de Fechar */}
            <button
              onClick={handleClose}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors p-1.5 rounded-full hover:bg-gray-100 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Tela de Sucesso */}
            {success ? (
              <div className="text-center py-8 space-y-4 animate-in fade-in duration-300">
                <div className="flex justify-center">
                  <div className="p-3 bg-green-50 rounded-full text-green-500">
                    <CheckCircle2 className="w-12 h-12" />
                  </div>
                </div>
                <div>
                  <h3 className="text-xl font-bold text-gray-800 font-display">Obrigado pelo seu feedback!</h3>
                  <p className="text-sm text-gray-500 mt-2 leading-relaxed px-4">
                    Sua sugestão foi salva com sucesso e enviada diretamente para a nossa equipe de desenvolvimento.
                  </p>
                </div>
                <div className="pt-4">
                  <button
                    onClick={handleClose}
                    className="w-full bg-brand-primary text-white py-3 rounded-xl font-bold text-sm hover:opacity-90 transition-all shadow-md cursor-pointer"
                  >
                    Entendido
                  </button>
                </div>
              </div>
            ) : (
              /* Formulário */
              <form onSubmit={handleSubmit} className="space-y-5">
                {/* Cabeçalho */}
                <div className="space-y-1">
                  <h3 className="text-lg font-bold font-display text-brand-primary flex items-center gap-2">
                    <MessageSquare className="w-5 h-5 text-brand-primary" />
                    Sugerir & Avaliar
                  </h3>
                  <p className="text-xs text-gray-500 leading-relaxed">
                    Sua opinião é fundamental para a evolução do aplicativo. Compartilhe sugestões ou relate problemas.
                  </p>
                </div>

                {/* Seleção de Categoria */}
                <div className="space-y-2">
                  <span className="text-xs font-bold text-gray-700">O que você gostaria de enviar?</span>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { id: 'suggestion', label: 'Sugestão' },
                      { id: 'new_feature', label: 'Nova Função' },
                      { id: 'bug', label: 'Reportar Bug' },
                      { id: 'other', label: 'Outro' }
                    ].map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setCategory(item.id as any)}
                        className={`py-2 px-3 text-xs font-semibold rounded-xl border transition-all cursor-pointer text-center ${
                          category === item.id
                            ? 'bg-brand-primary border-brand-primary text-white shadow-sm'
                            : 'bg-gray-50 border-gray-150 text-gray-600 hover:bg-gray-100'
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Estrelas de Avaliação */}
                <div className="space-y-2 text-center py-2 bg-gray-50/50 rounded-2xl border border-gray-100">
                  <span className="text-xs font-bold text-gray-700 block">Sua nota para o aplicativo</span>
                  <div className="flex justify-center space-x-1.5 mt-1.5">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => setRating(star)}
                        onMouseEnter={() => setHoverRating(star)}
                        onMouseLeave={() => setHoverRating(0)}
                        className="p-1 cursor-pointer transition-transform hover:scale-110 active:scale-95"
                      >
                        <Star
                          className={`w-7 h-7 transition-colors ${
                            star <= (hoverRating || rating)
                              ? 'fill-amber-400 text-amber-400'
                              : 'text-gray-300'
                          }`}
                        />
                      </button>
                    ))}
                  </div>
                </div>

                {/* Nome e E-mail (Somente exibidos/editáveis se não estiver logado) */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-600 uppercase">Seu Nome</label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      disabled={!!user}
                      placeholder="Ex: Dra. Ana"
                      className="w-full text-xs p-2.5 rounded-xl border border-gray-200 focus:outline-none focus:border-brand-primary bg-white disabled:bg-gray-50 disabled:text-gray-500 disabled:border-gray-100"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-600 uppercase">Seu E-mail (Opcional)</label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      disabled={!!user}
                      placeholder="Ex: ana@email.com"
                      className="w-full text-xs p-2.5 rounded-xl border border-gray-200 focus:outline-none focus:border-brand-primary bg-white disabled:bg-gray-50 disabled:text-gray-500 disabled:border-gray-100"
                    />
                  </div>
                </div>

                {/* Mensagem */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-600 uppercase">Descrição da Sugestão</label>
                  <textarea
                    rows={4}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    maxLength={1000}
                    placeholder="Descreva aqui sua sugestão, ideia de funcionalidade ou feedback com detalhes..."
                    className="w-full text-xs p-3 rounded-xl border border-gray-200 focus:outline-none focus:border-brand-primary resize-none bg-white"
                    required
                  />
                  <div className="text-right text-[10px] text-gray-400">
                    {message.length}/1000
                  </div>
                </div>

                {/* Exibição de Erro */}
                {error && (
                  <div className="p-3 bg-red-50 text-red-600 rounded-xl flex items-center space-x-2 text-xs animate-in slide-in-from-top-2">
                    <ShieldAlert className="w-4 h-4 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                {/* Botão de Enviar */}
                <div>
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-brand-primary text-white py-3 rounded-xl font-bold text-sm hover:opacity-90 active:scale-98 transition-all flex items-center justify-center space-x-2 shadow-md disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    {loading ? (
                      <span className="w-5 h-5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                    ) : (
                      <>
                        <span>Enviar Sugestão</span>
                        <Send className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
};
