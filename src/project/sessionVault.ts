const DB_NAME = 'SPM8xSessionVault';
const DB_VERSION = 1;
const PROJECT_STORE = 'projects';
const SAMPLE_STORE = 'samples';

export class SessionVault {
  private static openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        request.result.onversionchange = () => request.result.close();
        resolve(request.result);
      };
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(PROJECT_STORE)) {
          db.createObjectStore(PROJECT_STORE, { keyPath: 'id' });
        }

        if (!db.objectStoreNames.contains(SAMPLE_STORE)) {
          db.createObjectStore(SAMPLE_STORE, { keyPath: 'hash' });
        }
      };
    });
  }

  private static async request<T>(
    storeName: string,
    mode: IDBTransactionMode,
    createRequest: (store: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T> {
    const db = await this.openDB();
    return new Promise<T>((resolve, reject) => {
      let settled = false;
      const tx = db.transaction(storeName, mode);
      const req = createRequest(tx.objectStore(storeName));
      const fail = (error: DOMException | null) => {
        if (settled) return;
        settled = true;
        db.close();
        reject(error ?? new Error('IndexedDB transaction failed.'));
      };

      req.onerror = () => fail(req.error);
      tx.onerror = () => fail(tx.error);
      tx.onabort = () => fail(tx.error);
      tx.oncomplete = () => {
        if (settled) return;
        settled = true;
        const result = req.result;
        db.close();
        resolve(result);
      };
    });
  }

  public static async saveProjectSession(projectId: string, projectJson: string): Promise<void> {
    if (!projectId || typeof projectJson !== 'string') {
      throw new TypeError('A project ID and serialized project are required.');
    }
    try {
      await this.request(PROJECT_STORE, 'readwrite', (store) =>
        store.put({ id: projectId, data: projectJson, updatedAt: Date.now() }),
      );
    } catch (err) {
      if (err instanceof Error && err.name === 'QuotaExceededError') {
        console.error('IndexedDB quota exceeded while saving the project session.');
      }
      throw err;
    }
  }

  public static async storeSampleBlob(hash: string, wavBlob: Blob): Promise<void> {
    if (!hash || !(wavBlob instanceof Blob)) {
      throw new TypeError('A sample hash and Blob are required.');
    }
    await this.request(SAMPLE_STORE, 'readwrite', (store) =>
      store.put({ hash, blob: wavBlob }),
    );
  }

  public static async getSampleBlob(hash: string): Promise<Blob | null> {
    if (!hash) throw new TypeError('A sample hash is required.');
    const result = await this.request<{ hash: string; blob: Blob } | undefined>(
      SAMPLE_STORE,
      'readonly',
      (store) => store.get(hash),
    );
    return result?.blob ?? null;
  }
}

export const sessionVault = {
  saveProjectSession: SessionVault.saveProjectSession.bind(SessionVault),
  storeSampleBlob: SessionVault.storeSampleBlob.bind(SessionVault),
  getSampleBlob: SessionVault.getSampleBlob.bind(SessionVault),
};