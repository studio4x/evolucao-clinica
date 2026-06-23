export interface PendingEvolution {
  id: string; // uuid da evolução pendente
  patientId: string;
  patientName: string;
  googleDocId: string;
  sessionDate: string;
  audioBlob: Blob;
  audioBlobs?: Blob[];
  mimeType: string;
  source: 'new' | 'share';
  createdAt: string;
  evolutionData: any; // o objeto inicial que vai para o firestore também
  status?: 'draft' | 'pending'; // 'draft' para gravação em progresso/interrompida, 'pending' para pronto para sync offline
  recordingTime?: number; // duração em segundos gravada até agora
}

const DB_NAME = 'EvolutionOfflineSyncDB';
const DB_VERSION = 1;
const STORE_NAME = 'pendingEvolutions';

export const getOfflineDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e: any) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = (e: any) => resolve(e.target.result);
    request.onerror = () => reject(request.error);
  });
};

export const addPendingEvolution = async (item: PendingEvolution) => {
  const db = await getOfflineDB();
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(item);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

export const getPendingEvolutions = async (): Promise<PendingEvolution[]> => {
  const db = await getOfflineDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onsuccess = () => {
      const items: PendingEvolution[] = request.result || [];
      // Filtra rascunhos para que o monitor automático de sincronização offline não tente enviá-los
      resolve(items.filter(item => item.status !== 'draft'));
    };
    request.onerror = () => reject(request.error);
  });
};

export const getDraftEvolutions = async (): Promise<PendingEvolution[]> => {
  const db = await getOfflineDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onsuccess = () => {
      const items: PendingEvolution[] = request.result || [];
      // Retorna apenas rascunhos
      resolve(items.filter(item => item.status === 'draft'));
    };
    request.onerror = () => reject(request.error);
  });
};

export const getPendingEvolutionById = async (id: string): Promise<PendingEvolution | null> => {
  const db = await getOfflineDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(id);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
};

export const removePendingEvolution = async (id: string) => {
  const db = await getOfflineDB();
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};
