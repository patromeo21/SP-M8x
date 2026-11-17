const DB_NAME = 'SPM8xSessionVault';
const DB_VERSION = 1;
const PROJECT_STORE = 'projects';
const SAMPLE_STORE = 'samples';

export class SessionVault {
  private static openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
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

  public static async saveProjectSession(projectId: string, projectJson: string): Promise<void> {
    try {
      const db = await this.openDB();
      const tx = db.transaction(PROJECT_STORE, 'readwrite');
      const store = tx.objectStore(PROJECT_STORE);
      await new Promise<void>((resolve, reject) => {
        const req = store.put({ id: projectId, data: projectJson, updatedAt: Date.now() });
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch (err: any) {
      if (err.name === 'QuotaExceededError') {
        console.error('IndexedDB Quota Exceeded on iPad Safari! Freeing local cache...');
      }
      throw err;
    }
  }

  public static async storeSampleBlob(hash: string, wavBlob: Blob): Promise<void> {
    const db = await this.openDB();
    const tx = db.transaction(SAMPLE_STORE, 'readwrite');
    const store = tx.objectStore(SAMPLE_STORE);
    return new Promise((resolve, reject) => {
      const req = store.put({ hash, blob: wavBlob });
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  public static async getSampleBlob(hash: string): Promise<Blob | null> {
    const db = await this.openDB();
    const tx = db.transaction(SAMPLE_STORE, 'readonly');
    const store = tx.objectStore(SAMPLE_STORE);
    return new Promise((resolve, reject) => {
      const req = store.get(hash);
      req.onsuccess = () => resolve(req.result ? req.result.blob : null);
      req.onerror = () => reject(req.error);
    });
  }
}