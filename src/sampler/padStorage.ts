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
  audioKey?: string;
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
    (record.audioKey === undefined || typeof record.audioKey === 'string') &&
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
    metadata.onsuccess = () => {
      if (metadata.result?.sampleKey !== sampleKey) {
        reject(new Error(`Saved audio for ${id} changed.`));
        return;
      }
      const request = tx.objectStore(AUDIO).get(metadata.result.audioKey ?? id);
      request.onsuccess = () => {
        if (request.result instanceof Blob) resolve(request.result);
        else reject(new Error(`Saved audio for ${id} is missing.`));
      };
      request.onerror = () => reject(request.error ?? new Error(`Could not read audio for ${id}.`));
    };
    metadata.onerror = () => reject(metadata.error ?? new Error(`Could not read audio for ${id}.`));
  });
}

function enqueue(work: () => Promise<void>): Promise<void> {
  const operation = writes.then(work);
  writes = operation.catch(() => undefined);
  return operation;
}

function writePad(pad: StoredPad, audio?: Blob): Promise<void> {
  return enqueue(async () => {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(audio ? [METADATA, AUDIO] : [METADATA], 'readwrite');
      let saveError: Error | null = null;
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(saveError ?? tx.error ?? new Error('Sample save was interrupted.'));
      tx.onerror = () => reject(tx.error ?? new Error('Could not save sample.'));
      const store = tx.objectStore(METADATA);
      if (audio) {
        const all = store.getAll();
        all.onsuccess = () => {
          const previous = (all.result as StoredPad[]).find((item) => item.id === pad.id);
          const audioKey = `source:${pad.sampleKey}`;
          store.put({ ...pad, audioKey });
          const audioStore = tx.objectStore(AUDIO);
          audioStore.put(audio, audioKey);
          if (previous) {
            const oldKey = previous.audioKey ?? previous.id;
            if (oldKey !== audioKey && !(all.result as StoredPad[]).some(
              (item) => item.id !== pad.id && (item.audioKey ?? item.id) === oldKey,
            )) audioStore.delete(oldKey);
          }
        };
      } else {
        const request = store.get(pad.id);
        request.onsuccess = () => {
          if (request.result?.sampleKey !== pad.sampleKey) {
            saveError = new Error(`The sample for ${pad.id} was not saved.`);
            tx.abort();
          } else {
            store.put({ ...pad, ...(request.result.audioKey ? { audioKey: request.result.audioKey } : {}) });
          }
        };
      }
    });
  });
}

export function saveSample(pad: StoredPad, audio: Blob): Promise<void> {
  return writePad(pad, audio);
}

export function savePadSettings(pad: StoredPad): Promise<void> {
  return writePad(pad);
}

/** Assign all slices in one transaction, converting a legacy pad's audio on demand. */
export function saveSlices(sourceId: string, sampleKey: string, slices: StoredPad[]): Promise<void> {
  return enqueue(async () => {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([METADATA, AUDIO], 'readwrite');
      const pads = tx.objectStore(METADATA);
      const audio = tx.objectStore(AUDIO);
      let failure: Error | null = null;
      const abort = (message: string) => { failure = new Error(message); tx.abort(); };
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(failure ?? tx.error ?? new Error('Slice assignment was interrupted.'));
      tx.onerror = () => reject(tx.error ?? new Error('Could not save slices.'));
      const request = pads.getAll();
      request.onsuccess = () => {
        const existing = request.result as StoredPad[];
        const source = existing.find((pad) => pad.id === sourceId);
        if (!source || source.sampleKey !== sampleKey) {
          abort(`Source pad ${sourceId} changed. Try again.`);
          return;
        }
        if (!slices.length || new Set(slices.map((pad) => pad.id)).size !== slices.length ||
            slices.some((pad) => pad.sampleKey !== sampleKey || existing.some((item) => item.id === pad.id))) {
          abort('A destination pad is occupied. No slices were assigned.');
          return;
        }
        const oldKey = source.audioKey ?? source.id;
        const audioKey = source.audioKey ?? `source:${sampleKey}`;
        const audioRequest = audio.get(oldKey);
        audioRequest.onsuccess = () => {
          if (!(audioRequest.result instanceof Blob)) {
            abort(`Saved audio for ${sourceId} is missing.`);
            return;
          }
          if (!source.audioKey) {
            audio.put(audioRequest.result, audioKey);
            audio.delete(oldKey);
            pads.put({ ...source, audioKey });
          }
          for (const slice of slices) pads.put({ ...slice, audioKey });
        };
      };
    });
  });
}
