import React, { useState, useEffect } from 'react';
import { MessageSquare, Star, Send, CheckCircle2, ShieldAlert, Lightbulb, ArrowLeft, Lock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuthStore } from '../store/authStore';

export default function Feedback() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  
  const [rating, setRating] = useState<number>(0);
  const [hoverRating, setHoverRating] = useState<number>(0);
  const [category, setCategory] = useState<'suggestion' | 'bug' | 'new_feature' | 'other'>('suggestion');
  const [message, setMessage] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    }
  }, [user]);

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

  const handleReset = () => {
    setRating(0);
    setCategory('suggestion');
    setMessage('');
    setSuccess(false);
    setError(null);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-16">
      {/* Botão Voltar & Cabeçalho */}
      <div className="flex flex-col space-y-4">
        <button
          onClick={() => navigate('/painel/dashboard')}
          className="inline-flex items-center text-brand-text-muted hover:text-brand-primary text-xs font-semibold gap-1.5 transition-colors self-start cursor-pointer"
        >
          <ArrowLeft size={14} />
          Voltar para o Painel
        </button>

        <div className="space-y-1">
          <h1 className="text-3xl font-display font-bold text-brand-primary flex items-center gap-2.5">
            <Lightbulb className="w-8 h-8 text-amber-500 shrink-0" />
            Sugestões & Avaliações
          </h1>
          <p className="text-brand-text-muted text-sm max-w-xl">
            Sua opinião é fundamental para a evolução do aplicativo. Compartilhe sugestões, ideias de novas funções ou relate problemas.
          </p>
        </div>
      </div>

      {success ? (
        /* Tela de Sucesso */
        <div className="card p-8 md:p-12 text-center space-y-6 bg-white border border-brand-border rounded-2xl shadow-sm animate-in fade-in duration-300">
          <div className="flex justify-center">
            <div className="p-4 bg-green-50 rounded-full text-green-500">
              <CheckCircle2 className="w-16 h-16" />
            </div>
          </div>
          <div className="space-y-2">
            <h3 className="text-2xl font-bold text-gray-800 font-display">Obrigado pelo seu feedback!</h3>
            <p className="text-sm text-brand-text-muted leading-relaxed max-w-md mx-auto">
              Sua sugestão foi salva com sucesso e enviada diretamente para a nossa equipe de desenvolvimento.
            </p>
          </div>
          <div className="pt-4 flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={() => navigate('/painel/dashboard')}
              className="px-6 py-3 bg-brand-primary text-white rounded-xl font-bold text-sm hover:opacity-90 transition-all shadow-md cursor-pointer"
            >
              Voltar ao Dashboard
            </button>
            <button
              onClick={handleReset}
              className="px-6 py-3 bg-gray-100 text-gray-700 rounded-xl font-bold text-sm hover:bg-gray-250 transition-all cursor-pointer"
            >
              Enviar Outra Sugestão
            </button>
          </div>
        </div>
      ) : (
        /* Formulário */
        <form onSubmit={handleSubmit} className="card p-6 md:p-8 bg-white border border-brand-border rounded-2xl shadow-sm space-y-6">
          {/* Seleção de Categoria */}
          <div className="space-y-3">
            <span className="text-sm font-bold text-gray-700 block">O que você gostaria de enviar?</span>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
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
                  className={`py-3 px-2 text-xs font-bold rounded-xl border transition-all cursor-pointer text-center ${
                    category === item.id
                      ? 'bg-brand-primary border-brand-primary text-white shadow-sm'
                      : 'bg-brand-bg/50 border-brand-border/60 text-brand-text-muted hover:bg-brand-bg hover:text-brand-primary'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {/* Estrelas de Avaliação */}
          <div className="space-y-3 text-center py-4 bg-brand-bg/30 rounded-2xl border border-brand-border/40">
            <span className="text-sm font-bold text-gray-700 block">Sua nota para o aplicativo</span>
            <div className="flex justify-center space-x-2 mt-2">
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
                    className={`w-9 h-9 transition-colors ${
                      star <= (hoverRating || rating)
                        ? 'fill-amber-400 text-amber-400'
                        : 'text-gray-300'
                    }`}
                  />
                </button>
              ))}
            </div>
          </div>

          {/* Nome e E-mail (Identificação Automática) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">Seu Nome</label>
              <div className="relative">
                <input
                  type="text"
                  value={name}
                  disabled
                  placeholder="Seu Nome"
                  className="w-full text-xs p-3.5 pr-10 rounded-xl border border-gray-200 bg-gray-50 text-gray-500 disabled:opacity-80"
                />
                <Lock className="w-4 h-4 text-gray-400 absolute right-3 top-3.5" />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">Seu E-mail</label>
              <div className="relative">
                <input
                  type="email"
                  value={email}
                  disabled
                  placeholder="Seu E-mail"
                  className="w-full text-xs p-3.5 pr-10 rounded-xl border border-gray-200 bg-gray-50 text-gray-500 disabled:opacity-80"
                />
                <Lock className="w-4 h-4 text-gray-400 absolute right-3 top-3.5" />
              </div>
            </div>
          </div>

          {/* Mensagem */}
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">Descrição da Sugestão</label>
            <textarea
              rows={6}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={1000}
              placeholder="Descreva aqui sua sugestão, ideia de funcionalidade ou feedback com detalhes..."
              className="w-full text-xs p-4 rounded-xl border border-gray-200 focus:outline-none focus:border-brand-primary resize-none bg-white focus:ring-1 focus:ring-brand-primary font-sans"
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
          <div className="pt-2">
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-brand-primary text-white py-3.5 rounded-xl font-bold text-sm hover:opacity-90 active:scale-98 transition-all flex items-center justify-center space-x-2 shadow-md disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
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
  );
}
