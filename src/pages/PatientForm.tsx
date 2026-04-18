import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { db, auth, apiKey, projectId } from '../firebase';
import { useAuthStore } from '../store/authStore';
import { v4 as uuidv4 } from 'uuid';
import { FileText, Link as LinkIcon } from 'lucide-react';

declare global {
  interface Window {
    gapi: any;
    google: any;
  }
}

export default function PatientForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { googleAccessToken } = useAuthStore();
  
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    full_name: '',
    notes: '',
    status: 'active',
    google_doc_id: '',
    google_doc_name: '',
    google_doc_url: ''
  });

  useEffect(() => {
    if (id) {
      const fetchPatient = async () => {
        const docRef = doc(db, 'patients', id);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          setFormData({
            full_name: data.full_name || '',
            notes: data.notes || '',
            status: data.status || 'active',
            google_doc_id: data.google_doc_id || '',
            google_doc_name: data.google_doc_name || '',
            google_doc_url: data.google_doc_url || ''
          });
        }
      };
      fetchPatient();
    }
  }, [id]);

  const handlePicker = () => {
    if (!googleAccessToken) {
      alert('Token do Google não encontrado. Por favor, faça login novamente.');
      return;
    }

    try {
      if (!window.gapi) {
        alert('A API do Google ainda não foi carregada. Tente novamente em alguns segundos.');
        return;
      }

      // Load the Picker API
      window.gapi.load('picker', {
        callback: () => {
          try {
            if (!window.google || !window.google.picker) {
              alert('Erro ao inicializar o Google Picker.');
              return;
            }

            const view = new window.google.picker.DocsView(window.google.picker.ViewId.DOCUMENTS)
              .setMimeTypes('application/vnd.google-apps.document');

            const uploadView = new window.google.picker.DocsUploadView();

            const pickerApiKey = import.meta.env.VITE_GOOGLE_PICKER_API_KEY || apiKey;

            const picker = new window.google.picker.PickerBuilder()
              .addView(view)
              .addView(uploadView)
              .setOAuthToken(googleAccessToken)
              .setDeveloperKey(pickerApiKey)
              .setAppId(projectId)
              .setCallback((data: any) => {
                if (data.action === window.google.picker.Action.PICKED) {
                  const doc = data.docs[0];
                  setFormData(prev => ({
                    ...prev,
                    google_doc_id: doc.id,
                    google_doc_name: doc.name,
                    google_doc_url: doc.url
                  }));
                }
              })
              .build();
            picker.setVisible(true);
          } catch (err) {
            console.error("Erro dentro do callback do picker:", err);
            alert("Ocorreu um erro ao abrir o seletor de arquivos.");
          }
        },
        onerror: () => {
          console.error("Erro ao carregar a API do picker");
          alert("Falha ao carregar a interface do Google Drive.");
        }
      });
    } catch (error) {
      console.error("Erro geral no handlePicker:", error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) return;
    
    setLoading(true);
    try {
      const patientId = id || uuidv4();
      const patientData = {
        id: patientId,
        professional_id: auth.currentUser.uid,
        ...formData,
        updated_at: new Date().toISOString()
      };

      if (id) {
        await updateDoc(doc(db, 'patients', id), patientData);
      } else {
        await setDoc(doc(db, 'patients', patientId), {
          ...patientData,
          created_at: new Date().toISOString()
        });
      }
      navigate('/patients');
    } catch (error) {
      console.error("Error saving patient:", error);
      alert("Erro ao salvar paciente.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-display font-semibold text-brand-primary">
        {id ? 'Editar Paciente' : 'Novo Paciente'}
      </h1>

      <form onSubmit={handleSubmit} className="card p-6 space-y-6">
        <div>
          <label className="block text-sm font-medium text-brand-text mb-1">Nome Completo</label>
          <input
            type="text"
            required
            value={formData.full_name}
            onChange={e => setFormData({...formData, full_name: e.target.value})}
            className="input-field p-2"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-brand-text mb-1">Observações</label>
          <textarea
            rows={4}
            value={formData.notes}
            onChange={e => setFormData({...formData, notes: e.target.value})}
            className="input-field p-2"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-brand-text mb-1">Status</label>
          <select
            value={formData.status}
            onChange={e => setFormData({...formData, status: e.target.value})}
            className="input-field p-2"
          >
            <option value="active">Ativo</option>
            <option value="inactive">Inativo</option>
          </select>
        </div>

        <div className="border-t border-brand-border pt-6">
          <h3 className="text-lg font-medium text-brand-text mb-4">Prontuário no Google Docs</h3>
          
          {formData.google_doc_id ? (
            <div className="flex items-center justify-between p-4 bg-brand-primary/5 rounded-xl border border-brand-primary/20">
              <div className="flex items-center space-x-3">
                <FileText className="text-brand-primary" />
                <div>
                  <p className="font-medium text-brand-text">{formData.google_doc_name}</p>
                  <a href={formData.google_doc_url} target="_blank" rel="noopener noreferrer" className="text-sm text-brand-primary hover:text-brand-primary-hover hover:underline flex items-center mt-1">
                    <LinkIcon size={14} className="mr-1" /> Abrir documento
                  </a>
                </div>
              </div>
              <button
                type="button"
                onClick={handlePicker}
                className="btn-outline px-3 py-1.5 text-xs"
              >
                Trocar
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={handlePicker}
              className="w-full flex items-center justify-center space-x-2 p-4 border-2 border-dashed border-brand-border rounded-xl text-brand-text-muted hover:border-brand-primary hover:text-brand-primary transition-colors bg-brand-bg/50 hover:bg-brand-primary/5"
            >
              <FileText size={24} />
              <span className="font-medium">Selecionar prontuário no Google Drive</span>
            </button>
          )}
          <p className="text-xs text-brand-text-muted mt-2">
            Selecione o documento onde as evoluções serão inseridas automaticamente.
          </p>
        </div>

        <div className="flex justify-end space-x-3 pt-6 border-t border-brand-border">
          <button
            type="button"
            onClick={() => navigate('/patients')}
            className="btn-outline"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={loading}
            className="btn-primary"
          >
            {loading ? 'Salvando...' : 'Salvar Paciente'}
          </button>
        </div>
      </form>
    </div>
  );
}
