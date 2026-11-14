export type PlaybackMode = 'one-shot' | 'gate' | 'loop';

export interface StoredPad {
  id: string;
  sampleKey: string;
  name: string;
  startPct: number;
  endPct: number;
  pitch: number;
  loop: boolean;
  playbackMode?: PlaybackMode;
}

const DATABASE = 'sp-m8x-samples';
const METADATA = 'pads';
const AUDIO = 'audio';

let database: Promise<IDBDatabase> | null = null;
let writes: Promise<void> = Promise.resolve();

function openDatabase(): Promise<IDBDatabase> {
  if (!database) {
    database = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DATABASE, 1);
      let blocked = false;
      request.onupgradeneeded = () => {
        request.result.createObjectStore(METADATA, { keyPath: 'id' });
        request.result.createObjectStore(AUDIO);
      };
      request.onsuccess = () => {
        const db = request.result;
        if (blocked) {
          db.close();
          return;
        }
        db.onversionchange = () => {
          db.close();
          database = null;
        };
        resolve(db);
      };
      request.onerror = () => reject(request.error ?? new Error('Could not open sample storage.'));
      request.onblocked = () => {
        blocked = true;
        reject(new Error('Sample storage is blocked by another tab.'));
      };
    }).catch((error: unknown) => {
      database = null;
      throw error;
    });
  }
  return database;
}

function validPad(value: unknown): value is StoredPad {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Partial<StoredPad>;
  return typeof record.id === 'string' && /^[A-D](?:[1-9]|1[0-6])$/.test(record.id) &&
    typeof record.name === 'string' &&
    typeof record.sampleKey === 'string' &&
    typeof record.startPct === 'number' && Number.isFinite(record.startPct) &&
    typeof record.endPct === 'number' && Number.isFinite(record.endPct) &&
    typeof record.pitch === 'number' && Number.isFinite(record.pitch) &&
    typeof record.loop === 'boolean' &&
    (record.playbackMode === undefined || record.playbackMode === 'one-shot' ||
      record.playbackMode === 'gate' || record.playbackMode === 'loop');
}

export async function readStoredPads(): Promise<StoredPad[]> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db.transaction(METADATA, 'readonly').objectStore(METADATA).getAll();
    request.onsuccess = () => {
      const records: unknown[] = request.result;
      if (!records.every(validPad)) {
        reject(new Error('Saved pad metadata is invalid.'));
      } else {
        resolve(records);
      }
    };
    request.onerror = () => reject(request.error ?? new Error('Could not read saved pads.'));
  });
}

export async function readStoredAudio(id: string, sampleKey: string): Promise<Blob> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([METADATA, AUDIO], 'readonly');
    const metadata = tx.objectStore(METADATA).get(id);
    const request = tx.objectStore(AUDIO).get(id);
    request.onsuccess = () => {
      if (metadata.result?.sampleKey !== sampleKey) reject(new Error(`Saved audio for ${id} changed.`));
      else if (request.result instanceof Blob) resolve(request.result);
      else reject(new Error(`Saved audio for ${id} is missing.`));
    };
    request.onerror = () => reject(request.error ?? new Error(`Could not read audio for ${id}.`));
  });
}

function writePad(pad: StoredPad, audio?: Blob): Promise<void> {
  const operation = writes.then(async () => {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(audio ? [METADATA, AUDIO] : [METADATA], 'readwrite');
      let saveError: Error | null = null;
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(saveError ?? tx.error ?? new Error('Sample save was interrupted.'));
      tx.onerror = () => reject(tx.error ?? new Error('Could not save sample.'));
      const store = tx.objectStore(METADATA);
      if (audio) {
        store.put(pad);
        tx.objectStore(AUDIO).put(audio, pad.id);
      } else {
        const request = store.get(pad.id);
        request.onsuccess = () => {
          if (request.result?.sampleKey !== pad.sampleKey) {
            saveError = new Error(`The sample for ${pad.id} was not saved.`);
            tx.abort();
          } else {
            store.put(pad);
          }
        };
      }
    });
  });
  writes = operation.catch(() => undefined);
  return operation;
}

export function saveSample(pad: StoredPad, audio: Blob): Promise<void> {
  return writePad(pad, audio);
}

export function savePadSettings(pad: StoredPad): Promise<void> {
  return writePad(pad);
}
