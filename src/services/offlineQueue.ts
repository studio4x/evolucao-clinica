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
  localAudioCreatedAt?: string; // autoridade local imutável para retenção do Blob
  evolutionData: any; // o objeto inicial que vai para o firestore também
  status?: 'draft' | 'pending'; // 'draft' para gravação em progresso/interrompida, 'pending' para pronto para sync offline
  recordingTime?: number; // duração em segundos gravada até agora
  sessionTime?: string;
}

const DB_NAME = 'EvolutionOfflineSyncDB';
const DB_VERSION = 1;
const STORE_NAME = 'pendingEvolutions';
export const LOCAL_AUDIO_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

export const getLocalAudioRetentionStartedAt = (item: Pick<PendingEvolution, 'createdAt' | 'localAudioCreatedAt'>) =>
  item.localAudioCreatedAt || item.createdAt;

export const isLocalAudioExpired = (
  item: Pick<PendingEvolution, 'createdAt' | 'localAudioCreatedAt'>,
  now = Date.now(),
) => {
  const startedAt = new Date(getLocalAudioRetentionStartedAt(item)).getTime();
  return !Number.isFinite(startedAt) || startedAt + LOCAL_AUDIO_RETENTION_MS <= now;
};

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
  await readAndPurgeExpiredLocalAudio();
  const db = await getOfflineDB();
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const existingRequest = store.get(item.id);
    existingRequest.onsuccess = () => {
      const existing = existingRequest.result as PendingEvolution | undefined;
      const localAudioCreatedAt = existing?.localAudioCreatedAt || existing?.createdAt || item.localAudioCreatedAt || item.createdAt;
      const request = store.put({ ...item, localAudioCreatedAt });
      request.onerror = () => reject(request.error);
    };
    existingRequest.onerror = () => reject(existingRequest.error);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
};

const readAndPurgeExpiredLocalAudio = async (): Promise<PendingEvolution[]> => {
  const db = await getOfflineDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();
    let retained: PendingEvolution[] = [];
    request.onsuccess = () => {
      const items: PendingEvolution[] = request.result || [];
      retained = items.filter(item => !isLocalAudioExpired(item));
      for (const item of items) {
        if (isLocalAudioExpired(item)) store.delete(item.id);
      }
    };
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => resolve(retained);
    transaction.onerror = () => reject(transaction.error);
  });
};

export const getPendingEvolutions = async (): Promise<PendingEvolution[]> => {
  const items = await readAndPurgeExpiredLocalAudio();
  // Filtra rascunhos para que o monitor automático de sincronização offline não tente enviá-los
  return items.filter(item => item.status !== 'draft');
};

export const getDraftEvolutions = async (): Promise<PendingEvolution[]> => {
  const items = await readAndPurgeExpiredLocalAudio();
  return items.filter(item => item.status === 'draft');
};

export const getPendingEvolutionById = async (id: string): Promise<PendingEvolution | null> => {
  const items = await readAndPurgeExpiredLocalAudio();
  return items.find(item => item.id === id) || null;
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
