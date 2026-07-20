import React, { useEffect, useState } from 'react';
import { supabase } from '../../supabaseClient';
import { showAlert, showConfirm } from '../../store/modalStore';
import {
  Plus,
  Edit,
  Trash2,
  HelpCircle,
  Folder,
  Loader2,
  Check,
  AlertTriangle,
  Search,
  FileText,
  Layers3
} from 'lucide-react';

type FaqCategory = {
  id: string;
  name: string;
  display_order: number;
};

type FaqQuestion = {
  id: string;
  category_id: string;
  question: string;
  answer: string;
  display_order: number;
};

const getPreviewText = (text: string, limit = 220) => {
  if (text.length <= limit) return text;
  return `${text.slice(0, limit).trimEnd()}...`;
};

export default function AdminFaqCrud() {
  const [activeSubTab, setActiveSubTab] = useState<'questions' | 'categories'>('questions');

  const [categories, setCategories] = useState<FaqCategory[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(false);
  const [catName, setCatName] = useState('');
  const [catOrder, setCatOrder] = useState<number>(0);
  const [editingCatId, setEditingCatId] = useState<string | null>(null);

  const [questions, setQuestions] = useState<FaqQuestion[]>([]);
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [questText, setQuestText] = useState('');
  const [questAnswer, setQuestAnswer] = useState('');
  const [questCatId, setQuestCatId] = useState('');
  const [questOrder, setQuestOrder] = useState<number>(0);
  const [editingQuestId, setEditingQuestId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedQuestionCategory, setSelectedQuestionCategory] = useState<string>('all');

  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const [showCatForm, setShowCatForm] = useState(false);
  const [showQuestForm, setShowQuestForm] = useState(false);

  useEffect(() => {
    fetchCategories();
    fetchQuestions();
  }, []);

  const showFeedback = (type: 'success' | 'error', msg: string) => {
    if (type === 'success') {
      setSuccessMsg(msg);
      setErrorMsg('');
    } else {
      setErrorMsg(msg);
      setSuccessMsg('');
    }

    setTimeout(() => {
      setSuccessMsg('');
      setErrorMsg('');
    }, 4000);
  };

  const resetCategoryForm = () => {
    setCatName('');
    setCatOrder(categories.length + 1);
    setEditingCatId(null);
  };

  const resetQuestionForm = () => {
    setQuestText('');
    setQuestAnswer('');
    setQuestCatId(categories[0]?.id || '');
    setQuestOrder(questions.length + 1);
    setEditingQuestId(null);
  };

  const fetchCategories = async () => {
    setLoadingCategories(true);
    try {
      const { data, error } = await supabase
        .from('faq_categories')
        .select('*')
        .order('display_order', { ascending: true });
      if (error) throw error;
      setCategories((data || []) as FaqCategory[]);
    } catch (err: any) {
      console.error('Erro ao buscar categorias:', err);
    } finally {
      setLoadingCategories(false);
    }
  };

  const fetchQuestions = async () => {
    setLoadingQuestions(true);
    try {
      const { data, error } = await supabase
        .from('faq_questions')
        .select('*')
        .order('display_order', { ascending: true });
      if (error) throw error;
      setQuestions((data || []) as FaqQuestion[]);
    } catch (err: any) {
      console.error('Erro ao buscar perguntas:', err);
    } finally {
      setLoadingQuestions(false);
    }
  };

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!catName.trim()) return;
    setActionLoading(true);

    try {
      if (editingCatId) {
        const { error } = await supabase
          .from('faq_categories')
          .update({ name: catName.trim(), display_order: catOrder })
          .eq('id', editingCatId);
        if (error) throw error;
        showFeedback('success', 'Categoria atualizada com sucesso!');
      } else {
        const { error } = await supabase
          .from('faq_categories')
          .insert({ name: catName.trim(), display_order: catOrder });
        if (error) throw error;
        showFeedback('success', 'Categoria criada com sucesso!');
      }

      resetCategoryForm();
      setShowCatForm(false);
      await fetchCategories();
    } catch (err: any) {
      console.error('Erro ao salvar categoria:', err);
      showFeedback('error', `Erro ao salvar categoria: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleEditCategory = (cat: FaqCategory) => {
    setEditingCatId(cat.id);
    setCatName(cat.name);
    setCatOrder(cat.display_order || 0);
    setShowCatForm(true);
  };

  const handleDeleteCategory = async (id: string, name: string) => {
    const confirmed = await showConfirm(`Tem certeza que deseja excluir a categoria "${name}"? ATENÇÃO: Todas as perguntas vinculadas a esta categoria serão excluídas permanentemente.`, {
      title: "Excluir Categoria",
      confirmLabel: "Excluir Tudo",
      cancelLabel: "Cancelar",
      variant: "danger",
      icon: "warning"
    });
    if (!confirmed) return;

    setActionLoading(true);
    try {
      const { error } = await supabase
        .from('faq_categories')
        .delete()
        .eq('id', id);
      if (error) throw error;

      showFeedback('success', 'Categoria e suas perguntas excluídas com sucesso!');
      await fetchCategories();
      await fetchQuestions();
    } catch (err: any) {
      console.error('Erro ao excluir categoria:', err);
      showFeedback('error', `Erro ao excluir categoria: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleSaveQuestion = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!questText.trim() || !questAnswer.trim() || !questCatId) {
      showFeedback('error', 'Preencha todos os campos obrigatórios.');
      return;
    }

    setActionLoading(true);

    try {
      const payload = {
        question: questText.trim(),
        answer: questAnswer.trim(),
        category_id: questCatId,
        display_order: questOrder
      };

      if (editingQuestId) {
        const { error } = await supabase
          .from('faq_questions')
          .update(payload)
          .eq('id', editingQuestId);
        if (error) throw error;
        showFeedback('success', 'Pergunta atualizada com sucesso!');
      } else {
        const { error } = await supabase
          .from('faq_questions')
          .insert(payload);
        if (error) throw error;
        showFeedback('success', 'Pergunta criada com sucesso!');
      }

      resetQuestionForm();
      setShowQuestForm(false);
      await fetchQuestions();
    } catch (err: any) {
      console.error('Erro ao salvar pergunta:', err);
      showFeedback('error', `Erro ao salvar pergunta: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleEditQuestion = (q: FaqQuestion) => {
    setEditingQuestId(q.id);
    setQuestText(q.question);
    setQuestAnswer(q.answer);
    setQuestCatId(q.category_id);
    setQuestOrder(q.display_order || 0);
    setShowQuestForm(true);
  };

  const handleDeleteQuestion = async (id: string) => {
    const confirmed = await showConfirm('Deseja realmente excluir esta pergunta do FAQ?', {
      title: "Excluir Pergunta",
      confirmLabel: "Excluir",
      cancelLabel: "Cancelar",
      variant: "danger",
      icon: "trash"
    });
    if (!confirmed) return;

    setActionLoading(true);
    try {
      const { error } = await supabase
        .from('faq_questions')
        .delete()
        .eq('id', id);
      if (error) throw error;

      showFeedback('success', 'Pergunta excluída com sucesso!');
      await fetchQuestions();
    } catch (err: any) {
      console.error('Erro ao excluir pergunta:', err);
      showFeedback('error', `Erro ao excluir pergunta: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const questionCountByCategory = questions.reduce<Record<string, number>>((acc, question) => {
    acc[question.category_id] = (acc[question.category_id] || 0) + 1;
    return acc;
  }, {});

  const filteredQuestions = questions.filter((q) => {
    const query = searchQuery.trim().toLowerCase();
    const matchesSearch =
      query === '' ||
      q.question.toLowerCase().includes(query) ||
      q.answer.toLowerCase().includes(query);
    const matchesCategory =
      selectedQuestionCategory === 'all' || q.category_id === selectedQuestionCategory;

    return matchesSearch && matchesCategory;
  });

  const groupedFilteredQuestions = categories
    .map((category) => ({
      ...category,
      items: filteredQuestions
        .filter((question) => question.category_id === category.id)
        .sort((a, b) => (a.display_order || 0) - (b.display_order || 0))
    }))
    .filter((group) => group.items.length > 0);

  const currentQuestionCategoryName =
    categories.find((category) => category.id === questCatId)?.name || 'Selecione uma categoria';

  const totalQuestions = questions.length;
  const totalCategories = categories.length;
  const filteredCount = filteredQuestions.length;

  return (
    <div className="space-y-6">
      {(successMsg || errorMsg) && (
        <div className="space-y-3">
          {successMsg && (
            <div className="p-3.5 bg-emerald-50 border border-emerald-100 rounded-xl flex items-center space-x-2 text-sm text-emerald-700 animate-fadeIn">
              <Check className="w-5 h-5 flex-shrink-0 text-emerald-600" />
              <span className="font-medium">{successMsg}</span>
            </div>
          )}

          {errorMsg && (
            <div className="p-3.5 bg-red-50 border border-red-100 rounded-xl flex items-center space-x-2 text-sm text-red-700 animate-fadeIn">
              <AlertTriangle className="w-5 h-5 flex-shrink-0 text-red-600" />
              <span className="font-medium">{errorMsg}</span>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-brand-border bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand-text-muted">Perguntas</p>
              <p className="mt-2 text-3xl font-display font-bold text-brand-primary">{totalQuestions}</p>
            </div>
            <div className="p-3 rounded-2xl bg-brand-primary/10 text-brand-primary">
              <HelpCircle className="w-5 h-5" />
            </div>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-brand-text-muted">
            Total de perguntas e respostas já disponíveis para os profissionais.
          </p>
        </div>

        <div className="rounded-2xl border border-brand-border bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand-text-muted">Categorias</p>
              <p className="mt-2 text-3xl font-display font-bold text-brand-primary">{totalCategories}</p>
            </div>
            <div className="p-3 rounded-2xl bg-emerald-500/10 text-emerald-600">
              <Folder className="w-5 h-5" />
            </div>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-brand-text-muted">
            Estrutura usada para organizar a navegação e a busca dentro do FAQ.
          </p>
        </div>

        <div className="rounded-2xl border border-brand-border bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand-text-muted">Resultado Atual</p>
              <p className="mt-2 text-3xl font-display font-bold text-brand-primary">{filteredCount}</p>
            </div>
            <div className="p-3 rounded-2xl bg-amber-500/10 text-amber-600">
              <Layers3 className="w-5 h-5" />
            </div>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-brand-text-muted">
            Quantidade exibida após aplicar a busca textual e o filtro de categoria.
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-brand-border bg-white p-2 shadow-sm">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button
            onClick={() => {
              setActiveSubTab('questions');
              setShowCatForm(false);
            }}
            className={`rounded-xl px-4 py-3 text-sm font-semibold flex items-center justify-center gap-2 border transition-all cursor-pointer ${
              activeSubTab === 'questions'
                ? 'border-brand-primary bg-brand-primary text-white shadow-sm'
                : 'border-transparent text-brand-text-muted hover:bg-brand-bg hover:text-brand-text'
            }`}
          >
            <HelpCircle size={16} />
            <span>Perguntas e Respostas</span>
          </button>

          <button
            onClick={() => {
              setActiveSubTab('categories');
              setShowQuestForm(false);
            }}
            className={`rounded-xl px-4 py-3 text-sm font-semibold flex items-center justify-center gap-2 border transition-all cursor-pointer ${
              activeSubTab === 'categories'
                ? 'border-brand-primary bg-brand-primary text-white shadow-sm'
                : 'border-transparent text-brand-text-muted hover:bg-brand-bg hover:text-brand-text'
            }`}
          >
            <Folder size={16} />
            <span>Categorias do FAQ</span>
          </button>
        </div>
      </div>

      {activeSubTab === 'questions' && (
        <div className="space-y-6">
          {!showQuestForm ? (
            <>
              <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_280px] gap-4">
                <div className="rounded-2xl border border-brand-border bg-white p-5 shadow-sm space-y-4">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand-text-muted">Explorar Conteúdo</p>
                    <h3 className="mt-1 text-lg font-display font-bold text-brand-primary">Filtre, revise e edite o FAQ com mais contexto</h3>
                    <p className="mt-1 text-sm leading-relaxed text-brand-text-muted">
                      A tabela antiga escondia a maior parte do conteúdo. Agora a leitura fica orientada por categoria e o resumo da resposta aparece sem cortes agressivos.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_240px] gap-3">
                    <div className="relative">
                      <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-text-muted pointer-events-none" />
                      <input
                        type="text"
                        placeholder="Pesquisar por termos na pergunta ou na resposta..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="input-field w-full pl-11 text-sm"
                      />
                    </div>

                    <select
                      value={selectedQuestionCategory}
                      onChange={(e) => setSelectedQuestionCategory(e.target.value)}
                      className="input-field w-full text-sm"
                    >
                      <option value="all">Todas as categorias</option>
                      {categories.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="rounded-2xl border border-brand-border bg-white p-5 shadow-sm flex flex-col justify-between gap-4">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand-text-muted">Ação Principal</p>
                    <h3 className="mt-1 text-lg font-display font-bold text-brand-primary">Nova pergunta</h3>
                    <p className="mt-1 text-sm leading-relaxed text-brand-text-muted">
                      Cadastre uma nova entrada já com ordem e categoria definidas para manter o FAQ organizado.
                    </p>
                  </div>

                  <button
                    onClick={() => {
                      resetQuestionForm();
                      setShowQuestForm(true);
                    }}
                    className="btn-primary py-3 text-sm flex items-center justify-center gap-2 cursor-pointer border-0 shadow"
                  >
                    <Plus size={16} />
                    <span>Adicionar Pergunta</span>
                  </button>
                </div>
              </div>

              {loadingQuestions || loadingCategories ? (
                <div className="py-16 flex justify-center items-center text-brand-text-muted rounded-2xl border border-brand-border bg-white shadow-sm">
                  <Loader2 className="w-8 h-8 animate-spin text-brand-primary mr-3" />
                  <span>Carregando estrutura do FAQ...</span>
                </div>
              ) : groupedFilteredQuestions.length > 0 ? (
                <div className="space-y-4">
                  {groupedFilteredQuestions.map((group) => (
                    <section key={group.id} className="rounded-2xl border border-brand-border bg-white shadow-sm overflow-hidden">
                      <div className="px-5 py-4 border-b border-brand-border bg-brand-bg/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="p-2.5 rounded-xl bg-brand-primary/10 text-brand-primary">
                            <Folder className="w-4 h-4" />
                          </div>
                          <div>
                            <h3 className="text-sm sm:text-base font-display font-bold text-brand-text">{group.name}</h3>
                            <p className="text-xs text-brand-text-muted">
                              {group.items.length} {group.items.length === 1 ? 'pergunta nesta categoria' : 'perguntas nesta categoria'}
                            </p>
                          </div>
                        </div>

                        <span className="inline-flex items-center px-3 py-1 rounded-full bg-white border border-brand-border text-[11px] font-semibold text-brand-text-muted">
                          Ordem base {group.display_order}
                        </span>
                      </div>

                      <div className="divide-y divide-brand-border">
                        {group.items.map((question) => (
                          <article key={question.id} className="p-5 hover:bg-brand-bg/10 transition-colors">
                            <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                              <div className="space-y-3 min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-brand-primary/10 text-brand-primary text-[11px] font-bold">
                                    #{question.display_order}
                                  </span>
                                  <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-brand-bg text-brand-text-muted text-[11px] font-semibold">
                                    {group.name}
                                  </span>
                                </div>

                                <div>
                                  <h4 className="text-sm sm:text-base font-semibold leading-snug text-brand-text">
                                    {question.question}
                                  </h4>
                                  <p className="mt-2 text-sm leading-relaxed text-brand-text-muted whitespace-pre-line">
                                    {getPreviewText(question.answer)}
                                  </p>
                                </div>
                              </div>

                              <div className="flex items-center gap-2 self-start">
                                <button
                                  onClick={() => handleEditQuestion(question)}
                                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl border border-brand-border text-brand-text-muted hover:text-brand-primary hover:border-brand-primary/30 hover:bg-brand-primary/5 transition-colors bg-transparent cursor-pointer"
                                  title="Editar"
                                >
                                  <Edit size={14} />
                                  <span>Editar</span>
                                </button>
                                <button
                                  onClick={() => handleDeleteQuestion(question.id)}
                                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl border border-red-200 text-red-600 hover:bg-red-50 transition-colors bg-transparent cursor-pointer"
                                  title="Excluir"
                                >
                                  <Trash2 size={14} />
                                  <span>Excluir</span>
                                </button>
                              </div>
                            </div>
                          </article>
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              ) : (
                <div className="p-12 text-center border-dashed border-2 border-brand-border rounded-2xl bg-white">
                  <HelpCircle size={40} className="mx-auto text-brand-text-muted/60 mb-2" />
                  <p className="font-semibold text-brand-text">Nenhuma pergunta encontrada</p>
                  <p className="text-sm text-brand-text-muted mt-1 max-w-md mx-auto">
                    Ajuste a busca, troque a categoria selecionada ou cadastre uma nova pergunta para preencher o FAQ.
                  </p>
                </div>
              )}
            </>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_300px] gap-5">
              <div className="card p-6 bg-white border-brand-border">
                <div className="flex items-start justify-between gap-4 mb-5">
                  <div>
                    <h3 className="text-lg font-bold text-brand-primary flex items-center gap-2">
                      <HelpCircle className="text-brand-primary" />
                      <span>{editingQuestId ? 'Editar Pergunta' : 'Nova Pergunta de FAQ'}</span>
                    </h3>
                    <p className="mt-1 text-sm text-brand-text-muted">
                      Preencha a pergunta, escolha a categoria correta e escreva uma resposta clara para a equipe clínica.
                    </p>
                  </div>
                </div>

                <form onSubmit={handleSaveQuestion} className="space-y-5">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-brand-text uppercase tracking-wider block">Pergunta</label>
                    <input
                      type="text"
                      required
                      value={questText}
                      onChange={(e) => setQuestText(e.target.value)}
                      className="input-field w-full text-sm"
                      placeholder="Digite a pergunta frequente..."
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-brand-text uppercase tracking-wider block">Categoria</label>
                      <select
                        value={questCatId}
                        onChange={(e) => setQuestCatId(e.target.value)}
                        className="input-field w-full text-sm"
                        required
                      >
                        <option value="" disabled>Selecione uma categoria...</option>
                        {categories.map((cat) => (
                          <option key={cat.id} value={cat.id}>{cat.name}</option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-brand-text uppercase tracking-wider block">Ordem de Exibição</label>
                      <input
                        type="number"
                        value={questOrder}
                        onChange={(e) => setQuestOrder(parseInt(e.target.value, 10) || 0)}
                        className="input-field w-full text-sm"
                        placeholder="Ex: 1, 2, 3..."
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-brand-text uppercase tracking-wider block">Resposta</label>
                    <textarea
                      required
                      rows={8}
                      value={questAnswer}
                      onChange={(e) => setQuestAnswer(e.target.value)}
                      className="input-field w-full text-sm leading-relaxed"
                      placeholder="Digite a resposta detalhada. Use quebras de linha para separar parágrafos..."
                    />
                  </div>

                  <div className="flex justify-end gap-3 pt-4 border-t border-brand-border">
                    <button
                      type="button"
                      onClick={() => {
                        resetQuestionForm();
                        setShowQuestForm(false);
                      }}
                      className="px-4 py-2.5 text-sm font-semibold text-brand-text-muted hover:text-brand-text border border-brand-border rounded-xl bg-transparent cursor-pointer hover:bg-brand-bg transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={actionLoading}
                      className="btn-primary px-5 py-2.5 text-sm font-bold rounded-xl flex items-center justify-center gap-2 border-0 shadow"
                    >
                      {actionLoading && <Loader2 className="w-4 animate-spin" />}
                      <span>{editingQuestId ? 'Salvar Alterações' : 'Adicionar Pergunta'}</span>
                    </button>
                  </div>
                </form>
              </div>

              <aside className="rounded-2xl border border-brand-border bg-white p-5 shadow-sm space-y-4 h-fit">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand-text-muted">Contexto</p>
                  <h4 className="mt-1 text-base font-display font-bold text-brand-primary">Guia rápido de preenchimento</h4>
                </div>

                <div className="rounded-2xl border border-brand-border bg-brand-bg/30 p-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-brand-text-muted">Categoria Selecionada</p>
                  <p className="mt-1 text-sm font-semibold text-brand-text">{currentQuestionCategoryName}</p>
                </div>

                <div className="rounded-2xl border border-brand-border bg-brand-bg/30 p-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-brand-text-muted">Tamanho da Resposta</p>
                  <p className="mt-1 text-sm font-semibold text-brand-text">{questAnswer.trim().length} caracteres</p>
                  <p className="mt-2 text-xs leading-relaxed text-brand-text-muted">
                    Respostas com começo objetivo e detalhes logo depois ficam melhores para leitura e busca.
                  </p>
                </div>

                <div className="rounded-2xl border border-brand-border bg-brand-bg/30 p-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-brand-text-muted">Ordem Sugerida</p>
                  <p className="mt-1 text-sm font-semibold text-brand-text">#{questOrder || questions.length + 1}</p>
                  <p className="mt-2 text-xs leading-relaxed text-brand-text-muted">
                    Use números baixos para dúvidas mais recorrentes e críticas dentro de cada categoria.
                  </p>
                </div>
              </aside>
            </div>
          )}
        </div>
      )}

      {activeSubTab === 'categories' && (
        <div className="space-y-6">
          {!showCatForm ? (
            <>
              <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_260px] gap-4">
                <div className="rounded-2xl border border-brand-border bg-white p-5 shadow-sm">
                  <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand-text-muted">Organização</p>
                  <h3 className="mt-1 text-lg font-display font-bold text-brand-primary">Estruture o FAQ por temas que façam sentido para o profissional</h3>
                  <p className="mt-1 text-sm leading-relaxed text-brand-text-muted">
                    Cada categoria organiza o Guia de Uso e influencia a experiência de busca. Nomes curtos e objetivos melhoram bastante a navegação.
                  </p>
                </div>

                <div className="rounded-2xl border border-brand-border bg-white p-5 shadow-sm flex items-center">
                  <button
                    onClick={() => {
                      resetCategoryForm();
                      setShowCatForm(true);
                    }}
                    className="btn-primary w-full py-3 text-sm flex items-center justify-center gap-2 cursor-pointer border-0 shadow"
                  >
                    <Plus size={16} />
                    <span>Adicionar Categoria</span>
                  </button>
                </div>
              </div>

              {loadingCategories ? (
                <div className="py-16 flex justify-center items-center text-brand-text-muted rounded-2xl border border-brand-border bg-white shadow-sm">
                  <Loader2 className="w-8 h-8 animate-spin text-brand-primary mr-3" />
                  <span>Carregando categorias...</span>
                </div>
              ) : categories.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {categories.map((category) => {
                    const linkedQuestions = questionCountByCategory[category.id] || 0;

                    return (
                      <div key={category.id} className="rounded-2xl border border-brand-border bg-white p-5 shadow-sm space-y-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="p-3 rounded-2xl bg-brand-primary/10 text-brand-primary">
                              <Folder className="w-5 h-5" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-display font-bold text-brand-text truncate">{category.name}</p>
                              <p className="text-xs text-brand-text-muted">Ordem {category.display_order || 0}</p>
                            </div>
                          </div>

                          <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-brand-bg text-brand-text-muted text-[11px] font-semibold">
                            #{category.display_order || 0}
                          </span>
                        </div>

                        <div className="rounded-2xl border border-brand-border bg-brand-bg/30 p-4">
                          <div className="flex items-center gap-2 text-brand-primary">
                            <FileText className="w-4 h-4" />
                            <span className="text-xs font-bold uppercase tracking-wider">Perguntas Vinculadas</span>
                          </div>
                          <p className="mt-2 text-2xl font-display font-bold text-brand-text">{linkedQuestions}</p>
                          <p className="mt-1 text-xs leading-relaxed text-brand-text-muted">
                            Excluir esta categoria também remove essas perguntas do FAQ.
                          </p>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleEditCategory(category)}
                            className="inline-flex flex-1 items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-semibold rounded-xl border border-brand-border text-brand-text-muted hover:text-brand-primary hover:border-brand-primary/30 hover:bg-brand-primary/5 transition-colors bg-transparent cursor-pointer"
                            title="Editar"
                          >
                            <Edit size={14} />
                            <span>Editar</span>
                          </button>
                          <button
                            onClick={() => handleDeleteCategory(category.id, category.name)}
                            className="inline-flex flex-1 items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-semibold rounded-xl border border-red-200 text-red-600 hover:bg-red-50 transition-colors bg-transparent cursor-pointer"
                            title="Excluir"
                          >
                            <Trash2 size={14} />
                            <span>Excluir</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="p-12 text-center border-dashed border-2 border-brand-border rounded-2xl bg-white">
                  <Folder size={40} className="mx-auto text-brand-text-muted/60 mb-2" />
                  <p className="font-semibold text-brand-text">Nenhuma categoria cadastrada</p>
                  <p className="text-sm text-brand-text-muted mt-1 max-w-md mx-auto">
                    Crie a primeira categoria para organizar melhor o FAQ antes de adicionar novas dúvidas.
                  </p>
                </div>
              )}
            </>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_280px] gap-5">
              <div className="card p-6 bg-white border-brand-border max-w-2xl">
                <h3 className="text-base font-bold text-brand-primary mb-4 flex items-center gap-2">
                  <Folder className="text-brand-primary" />
                  <span>{editingCatId ? 'Editar Categoria' : 'Nova Categoria de FAQ'}</span>
                </h3>

                <form onSubmit={handleSaveCategory} className="space-y-5">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-brand-text uppercase tracking-wider block">Nome da Categoria</label>
                    <input
                      type="text"
                      required
                      value={catName}
                      onChange={(e) => setCatName(e.target.value)}
                      className="input-field w-full text-sm"
                      placeholder="Ex: Primeiros Passos, Financeiro, IA..."
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-brand-text uppercase tracking-wider block">Ordem de Exibição</label>
                    <input
                      type="number"
                      value={catOrder}
                      onChange={(e) => setCatOrder(parseInt(e.target.value, 10) || 0)}
                      className="input-field w-full text-sm"
                      placeholder="Ex: 1, 2, 3..."
                    />
                  </div>

                  <div className="flex justify-end gap-3 pt-4 border-t border-brand-border">
                    <button
                      type="button"
                      onClick={() => {
                        resetCategoryForm();
                        setShowCatForm(false);
                      }}
                      className="px-4 py-2.5 text-sm font-semibold text-brand-text-muted hover:text-brand-text border border-brand-border rounded-xl bg-transparent cursor-pointer hover:bg-brand-bg transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={actionLoading}
                      className="btn-primary px-5 py-2.5 text-sm font-bold rounded-xl flex items-center justify-center gap-2 border-0 shadow"
                    >
                      {actionLoading && <Loader2 className="w-4 animate-spin" />}
                      <span>{editingCatId ? 'Salvar Alterações' : 'Criar Categoria'}</span>
                    </button>
                  </div>
                </form>
              </div>

              <aside className="rounded-2xl border border-brand-border bg-white p-5 shadow-sm space-y-4 h-fit">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand-text-muted">Boas práticas</p>
                  <h4 className="mt-1 text-base font-display font-bold text-brand-primary">Categorias mais fáceis de navegar</h4>
                </div>

                <div className="rounded-2xl border border-brand-border bg-brand-bg/30 p-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-brand-text-muted">Nome</p>
                  <p className="mt-1 text-sm text-brand-text">
                    Prefira rótulos curtos e claros, como “Primeiros Passos” ou “Google Docs”.
                  </p>
                </div>

                <div className="rounded-2xl border border-brand-border bg-brand-bg/30 p-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-brand-text-muted">Impacto da Ordem</p>
                  <p className="mt-1 text-sm text-brand-text">
                    Categorias com ordem menor aparecem primeiro e recebem mais atenção no guia.
                  </p>
                </div>

                <div className="rounded-2xl border border-red-100 bg-red-50 p-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-red-700">Atenção</p>
                  <p className="mt-1 text-sm text-red-700">
                    Excluir uma categoria remove todas as perguntas ligadas a ela. Revise o uso antes de apagar.
                  </p>
                </div>
              </aside>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
