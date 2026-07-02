import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { 
  Plus, 
  Edit, 
  Trash2, 
  HelpCircle, 
  Folder, 
  List, 
  Loader2, 
  Check, 
  AlertTriangle,
  ArrowUpDown
} from 'lucide-react';

export default function AdminFaqCrud() {
  const [activeSubTab, setActiveSubTab] = useState<'questions' | 'categories'>('questions');
  
  // Estados para Categorias
  const [categories, setCategories] = useState<any[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(false);
  const [catName, setCatName] = useState('');
  const [catOrder, setCatOrder] = useState<number>(0);
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  
  // Estados para Perguntas
  const [questions, setQuestions] = useState<any[]>([]);
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [questText, setQuestText] = useState('');
  const [questAnswer, setQuestAnswer] = useState('');
  const [questCatId, setQuestCatId] = useState('');
  const [questOrder, setQuestOrder] = useState<number>(0);
  const [editingQuestId, setEditingQuestId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Estados de feedback
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  // Modais de Form
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

  // --- CRUD CATEGORIAS ---
  const fetchCategories = async () => {
    setLoadingCategories(true);
    try {
      const { data, error } = await supabase
        .from('faq_categories')
        .select('*')
        .order('display_order', { ascending: true });
      if (error) throw error;
      setCategories(data || []);
    } catch (err: any) {
      console.error('Erro ao buscar categorias:', err);
    } finally {
      setLoadingCategories(false);
    }
  };

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!catName.trim()) return;
    setActionLoading(true);
    
    try {
      if (editingCatId) {
        // Update
        const { error } = await supabase
          .from('faq_categories')
          .update({ name: catName.trim(), display_order: catOrder })
          .eq('id', editingCatId);
        if (error) throw error;
        showFeedback('success', 'Categoria atualizada com sucesso!');
      } else {
        // Insert
        const { error } = await supabase
          .from('faq_categories')
          .insert({ name: catName.trim(), display_order: catOrder });
        if (error) throw error;
        showFeedback('success', 'Categoria criada com sucesso!');
      }
      
      setCatName('');
      setCatOrder(0);
      setEditingCatId(null);
      setShowCatForm(false);
      await fetchCategories();
    } catch (err: any) {
      console.error('Erro ao salvar categoria:', err);
      showFeedback('error', 'Erro ao salvar categoria: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleEditCategory = (cat: any) => {
    setEditingCatId(cat.id);
    setCatName(cat.name);
    setCatOrder(cat.display_order || 0);
    setShowCatForm(true);
  };

  const handleDeleteCategory = async (id: string, name: string) => {
    if (!window.confirm(`Tem certeza que deseja excluir a categoria "${name}"? ATENÇÃO: Todas as perguntas vinculadas a esta categoria serão excluídas permanentemente.`)) {
      return;
    }
    
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
      showFeedback('error', 'Erro ao excluir categoria: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // --- CRUD PERGUNTAS ---
  const fetchQuestions = async () => {
    setLoadingQuestions(true);
    try {
      const { data, error } = await supabase
        .from('faq_questions')
        .select('*')
        .order('display_order', { ascending: true });
      if (error) throw error;
      setQuestions(data || []);
    } catch (err: any) {
      console.error('Erro ao buscar perguntas:', err);
    } finally {
      setLoadingQuestions(false);
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
        // Update
        const { error } = await supabase
          .from('faq_questions')
          .update(payload)
          .eq('id', editingQuestId);
        if (error) throw error;
        showFeedback('success', 'Pergunta atualizada com sucesso!');
      } else {
        // Insert
        const { error } = await supabase
          .from('faq_questions')
          .insert(payload);
        if (error) throw error;
        showFeedback('success', 'Pergunta criada com sucesso!');
      }

      setQuestText('');
      setQuestAnswer('');
      setQuestCatId('');
      setQuestOrder(0);
      setEditingQuestId(null);
      setShowQuestForm(false);
      await fetchQuestions();
    } catch (err: any) {
      console.error('Erro ao salvar pergunta:', err);
      showFeedback('error', 'Erro ao salvar pergunta: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleEditQuestion = (q: any) => {
    setEditingQuestId(q.id);
    setQuestText(q.question);
    setQuestAnswer(q.answer);
    setQuestCatId(q.category_id);
    setQuestOrder(q.display_order || 0);
    setShowQuestForm(true);
  };

  const handleDeleteQuestion = async (id: string) => {
    if (!window.confirm('Deseja realmente excluir esta pergunta do FAQ?')) {
      return;
    }
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
      showFeedback('error', 'Erro ao excluir pergunta: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // Filtragem de perguntas para busca rápida no painel admin
  const filteredQuestions = questions.filter(q => {
    const matchesSearch = searchQuery.trim() === '' ||
      q.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
      q.answer.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch;
  });

  return (
    <div className="space-y-6">
      {/* Alert Feedbacks */}
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

      {/* Navegação de Abas Internas */}
      <div className="flex border-b border-brand-border">
        <button
          onClick={() => {
            setActiveSubTab('questions');
            setShowCatForm(false);
            setShowQuestForm(false);
          }}
          className={`px-5 py-3 text-sm font-semibold flex items-center space-x-2 border-b-2 transition-all cursor-pointer bg-transparent border-0 ${
            activeSubTab === 'questions'
              ? 'border-brand-primary text-brand-primary'
              : 'border-transparent text-brand-text-muted hover:text-brand-text'
          }`}
        >
          <HelpCircle size={16} />
          <span>Perguntas e Respostas</span>
        </button>
        <button
          onClick={() => {
            setActiveSubTab('categories');
            setShowCatForm(false);
            setShowQuestForm(false);
          }}
          className={`px-5 py-3 text-sm font-semibold flex items-center space-x-2 border-b-2 transition-all cursor-pointer bg-transparent border-0 ${
            activeSubTab === 'categories'
              ? 'border-brand-primary text-brand-primary'
              : 'border-transparent text-brand-text-muted hover:text-brand-text'
          }`}
        >
          <Folder size={16} />
          <span>Categorias de FAQ</span>
        </button>
      </div>

      {/* --- ABA 1: PERGUNTAS E RESPOSTAS --- */}
      {activeSubTab === 'questions' && (
        <div className="space-y-6">
          {!showQuestForm ? (
            <>
              {/* Header de Ações */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <input
                  type="text"
                  placeholder="Pesquisar pergunta ou resposta no FAQ..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="input-field max-w-md w-full text-xs"
                />
                <button
                  onClick={() => {
                    setEditingQuestId(null);
                    setQuestText('');
                    setQuestAnswer('');
                    setQuestCatId(categories[0]?.id || '');
                    setQuestOrder(questions.length + 1);
                    setShowQuestForm(true);
                  }}
                  className="btn-primary py-2.5 text-xs flex items-center gap-1.5 self-start sm:self-auto cursor-pointer border-0 shadow"
                >
                  <Plus size={16} />
                  <span>Adicionar Pergunta</span>
                </button>
              </div>

              {/* Tabela de Perguntas */}
              {loadingQuestions || loadingCategories ? (
                <div className="py-12 flex justify-center items-center text-brand-text-muted">
                  <Loader2 className="w-8 h-8 animate-spin text-brand-primary mr-2" />
                  <span>Carregando FAQ...</span>
                </div>
              ) : filteredQuestions.length > 0 ? (
                <div className="overflow-x-auto rounded-2xl border border-brand-border bg-white shadow-sm">
                  <table className="w-full text-left border-collapse text-sm">
                    <thead>
                      <tr className="bg-brand-bg text-brand-text font-semibold border-b border-brand-border text-xs uppercase tracking-wider">
                        <th className="p-4 w-12 text-center">Ordem</th>
                        <th className="p-4 w-1/3">Pergunta</th>
                        <th className="p-4 w-1/3">Resposta Resumida</th>
                        <th className="p-4">Categoria</th>
                        <th className="p-4 text-center w-24">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-brand-border">
                      {filteredQuestions.map((q) => {
                        const categoryName = categories.find(c => c.id === q.category_id)?.name || 'N/A';
                        return (
                          <tr key={q.id} className="hover:bg-brand-bg/20 transition-colors">
                            <td className="p-4 text-center font-mono font-medium text-xs text-brand-text-muted">{q.display_order}</td>
                            <td className="p-4 font-semibold text-brand-text max-w-xs truncate">{q.question}</td>
                            <td className="p-4 text-brand-text-muted max-w-xs truncate">{q.answer}</td>
                            <td className="p-4">
                              <span className="bg-brand-primary/10 text-brand-primary px-2.5 py-0.5 rounded text-xs font-semibold">
                                {categoryName}
                              </span>
                            </td>
                            <td className="p-4">
                              <div className="flex items-center justify-center space-x-2">
                                <button
                                  onClick={() => handleEditQuestion(q)}
                                  className="p-1.5 text-brand-text-muted hover:text-brand-primary hover:bg-brand-bg rounded-lg border-0 bg-transparent cursor-pointer transition-colors"
                                  title="Editar"
                                >
                                  <Edit size={16} />
                                </button>
                                <button
                                  onClick={() => handleDeleteQuestion(q.id)}
                                  className="p-1.5 text-brand-text-muted hover:text-red-600 hover:bg-red-50 rounded-lg border-0 bg-transparent cursor-pointer transition-colors"
                                  title="Excluir"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-12 text-center border-dashed border-2 border-brand-border rounded-2xl bg-white">
                  <HelpCircle size={40} className="mx-auto text-brand-text-muted/60 mb-2" />
                  <p className="font-semibold text-brand-text">Nenhuma pergunta encontrada</p>
                  <p className="text-xs text-brand-text-muted mt-1">Experimente buscar por outro termo ou cadastre uma nova pergunta.</p>
                </div>
              )}
            </>
          ) : (
            /* Formulário de Pergunta */
            <div className="card p-6 bg-white border-brand-border max-w-2xl">
              <h3 className="text-lg font-bold text-brand-primary mb-4 flex items-center gap-1.5">
                <HelpCircle className="text-brand-primary" />
                <span>{editingQuestId ? 'Editar Pergunta' : 'Nova Pergunta de FAQ'}</span>
              </h3>
              <form onSubmit={handleSaveQuestion} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-brand-text uppercase tracking-wider block">Pergunta</label>
                  <input
                    type="text"
                    required
                    value={questText}
                    onChange={(e) => setQuestText(e.target.value)}
                    className="input-field w-full text-xs"
                    placeholder="Digite a pergunta frequente..."
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-brand-text uppercase tracking-wider block">Categoria</label>
                    <select
                      value={questCatId}
                      onChange={(e) => setQuestCatId(e.target.value)}
                      className="input-field w-full text-xs"
                      required
                    >
                      <option value="" disabled>Selecione uma categoria...</option>
                      {categories.map((cat) => (
                        <option key={cat.id} value={cat.id}>{cat.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-brand-text uppercase tracking-wider block">Ordem de Exibição</label>
                    <input
                      type="number"
                      value={questOrder}
                      onChange={(e) => setQuestOrder(parseInt(e.target.value) || 0)}
                      className="input-field w-full text-xs"
                      placeholder="Ex: 1, 2, 3..."
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-brand-text uppercase tracking-wider block">Resposta</label>
                  <textarea
                    required
                    rows={6}
                    value={questAnswer}
                    onChange={(e) => setQuestAnswer(e.target.value)}
                    className="input-field w-full text-xs leading-relaxed"
                    placeholder="Digite a resposta detalhada. Use quebras de linha para separar parágrafos..."
                  />
                </div>

                <div className="flex justify-end gap-3 pt-3 border-t border-brand-border">
                  <button
                    type="button"
                    onClick={() => setShowQuestForm(false)}
                    className="px-4 py-2 text-xs font-semibold text-brand-text-muted hover:text-brand-text border border-brand-border rounded-xl bg-transparent cursor-pointer hover:bg-brand-bg transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={actionLoading}
                    className="btn-primary px-5 py-2 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 border-0 shadow"
                  >
                    {actionLoading && <Loader2 className="w-3 animate-spin" />}
                    <span>{editingQuestId ? 'Salvar Alterações' : 'Adicionar Pergunta'}</span>
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      )}

      {/* --- ABA 2: CATEGORIAS --- */}
      {activeSubTab === 'categories' && (
        <div className="space-y-6">
          {!showCatForm ? (
            <>
              {/* Header de Ações */}
              <div className="flex justify-end">
                <button
                  onClick={() => {
                    setEditingCatId(null);
                    setCatName('');
                    setCatOrder(categories.length + 1);
                    setShowCatForm(true);
                  }}
                  className="btn-primary py-2.5 text-xs flex items-center gap-1.5 cursor-pointer border-0 shadow animate-fadeIn"
                >
                  <Plus size={16} />
                  <span>Adicionar Categoria</span>
                </button>
              </div>

              {/* Tabela de Categorias */}
              {loadingCategories ? (
                <div className="py-12 flex justify-center items-center text-brand-text-muted">
                  <Loader2 className="w-8 h-8 animate-spin text-brand-primary mr-2" />
                  <span>Carregando categorias...</span>
                </div>
              ) : categories.length > 0 ? (
                <div className="overflow-x-auto rounded-2xl border border-brand-border bg-white shadow-sm max-w-xl">
                  <table className="w-full text-left border-collapse text-sm">
                    <thead>
                      <tr className="bg-brand-bg text-brand-text font-semibold border-b border-brand-border text-xs uppercase tracking-wider">
                        <th className="p-4 w-16 text-center">Ordem</th>
                        <th className="p-4">Nome da Categoria</th>
                        <th className="p-4 text-center w-24">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-brand-border">
                      {categories.map((cat) => (
                        <tr key={cat.id} className="hover:bg-brand-bg/20 transition-colors">
                          <td className="p-4 text-center font-mono font-medium text-xs text-brand-text-muted">{cat.display_order}</td>
                          <td className="p-4 font-semibold text-brand-text">{cat.name}</td>
                          <td className="p-4">
                            <div className="flex items-center justify-center space-x-2">
                              <button
                                onClick={() => handleEditCategory(cat)}
                                className="p-1.5 text-brand-text-muted hover:text-brand-primary hover:bg-brand-bg rounded-lg border-0 bg-transparent cursor-pointer transition-colors"
                                title="Editar"
                              >
                                <Edit size={16} />
                              </button>
                              <button
                                onClick={() => handleDeleteCategory(cat.id, cat.name)}
                                className="p-1.5 text-brand-text-muted hover:text-red-600 hover:bg-red-50 rounded-lg border-0 bg-transparent cursor-pointer transition-colors"
                                title="Excluir"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-12 text-center border-dashed border-2 border-brand-border rounded-2xl bg-white max-w-xl">
                  <Folder size={40} className="mx-auto text-brand-text-muted/60 mb-2" />
                  <p className="font-semibold text-brand-text">Nenhuma categoria cadastrada</p>
                  <p className="text-xs text-brand-text-muted mt-1">Crie a primeira categoria para agrupar suas perguntas.</p>
                </div>
              )}
            </>
          ) : (
            /* Formulário de Categoria */
            <div className="card p-6 bg-white border-brand-border max-w-md">
              <h3 className="text-base font-bold text-brand-primary mb-4 flex items-center gap-1.5">
                <Folder className="text-brand-primary" />
                <span>{editingCatId ? 'Editar Categoria' : 'Nova Categoria de FAQ'}</span>
              </h3>
              <form onSubmit={handleSaveCategory} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-brand-text uppercase tracking-wider block">Nome da Categoria</label>
                  <input
                    type="text"
                    required
                    value={catName}
                    onChange={(e) => setCatName(e.target.value)}
                    className="input-field w-full text-xs"
                    placeholder="Ex: Primeiros Passos, Financeiro, IA..."
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-brand-text uppercase tracking-wider block">Ordem de Exibição</label>
                  <input
                    type="number"
                    value={catOrder}
                    onChange={(e) => setCatOrder(parseInt(e.target.value) || 0)}
                    className="input-field w-full text-xs"
                    placeholder="Ex: 1, 2, 3..."
                  />
                </div>

                <div className="flex justify-end gap-3 pt-3 border-t border-brand-border">
                  <button
                    type="button"
                    onClick={() => setShowCatForm(false)}
                    className="px-4 py-2 text-xs font-semibold text-brand-text-muted hover:text-brand-text border border-brand-border rounded-xl bg-transparent cursor-pointer hover:bg-brand-bg transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={actionLoading}
                    className="btn-primary px-5 py-2 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 border-0 shadow"
                  >
                    {actionLoading && <Loader2 className="w-3 animate-spin" />}
                    <span>{editingCatId ? 'Salvar Alterações' : 'Criar Categoria'}</span>
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
