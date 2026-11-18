import { SessionVault } from './sessionVault';

export interface SPM8BundleSample {
  hash: string;
  base64Data: string;
  mimeType?: string;
}

export interface SPM8BundleManifest {
  version: 1;
  createdAt: string;
  projectId?: string;
  projectJson: string;
  sampleHashes: string[];
  samples?: SPM8BundleSample[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string' && item.length > 0);
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function decodeBase64(value: string, fallbackMimeType = 'application/octet-stream'): Blob {
  const dataUrlMatch = /^data:([^;,]+)?;base64,(.*)$/s.exec(value);
  const mimeType = dataUrlMatch?.[1] || fallbackMimeType || 'application/octet-stream';
  const encoded = dataUrlMatch ? dataUrlMatch[2] : value;
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
}

function parseManifest(value: unknown): SPM8BundleManifest {
  if (!isRecord(value) || value.version !== 1 || typeof value.createdAt !== 'string' ||
      typeof value.projectJson !== 'string' || !isStringArray(value.sampleHashes) ||
      (value.projectId !== undefined && typeof value.projectId !== 'string') ||
      (value.samples !== undefined && !Array.isArray(value.samples))) {
    throw new Error('Invalid .sp8 bundle manifest.');
  }

  let parsedProject: unknown;
  try {
    parsedProject = JSON.parse(value.projectJson);
  } catch {
    throw new Error('Invalid .sp8 bundle project JSON.');
  }
  if (!isRecord(parsedProject)) throw new Error('Invalid .sp8 bundle project data.');

  let samples: SPM8BundleSample[] | undefined;
  if (Array.isArray(value.samples)) {
    const seen = new Set<string>();
    samples = [];
    for (const sample of value.samples) {
      if (!isRecord(sample) || typeof sample.hash !== 'string' || !sample.hash ||
          typeof sample.base64Data !== 'string' ||
          (sample.mimeType !== undefined && typeof sample.mimeType !== 'string') ||
          seen.has(sample.hash)) {
        throw new Error('Invalid .sp8 bundle sample entry.');
      }
      if (!value.sampleHashes.includes(sample.hash)) {
        throw new Error(`Bundle sample "${sample.hash}" is not listed in sampleHashes.`);
      }
      seen.add(sample.hash);
      samples.push({
        hash: sample.hash,
        base64Data: sample.base64Data,
        ...(typeof sample.mimeType === 'string' ? { mimeType: sample.mimeType } : {}),
      });
    }
    if (seen.size !== value.sampleHashes.length) {
      throw new Error('Bundle is missing one or more referenced sample blobs.');
    }
  }

  return {
    version: 1,
    createdAt: value.createdAt,
    ...(typeof value.projectId === 'string' ? { projectId: value.projectId } : {}),
    projectJson: value.projectJson,
    sampleHashes: value.sampleHashes,
    ...(samples ? { samples } : {}),
  };
}

export class SPM8BundleManager {
  /** Export a project and all referenced sample blobs into a portable .sp8 JSON bundle. */
  public static async exportBundle(projectId: string, projectJson: string, sampleHashes: string[]): Promise<Blob> {
    if (!projectId || typeof projectJson !== 'string' || !Array.isArray(sampleHashes) ||
        !sampleHashes.every((hash) => typeof hash === 'string' && hash.length > 0)) {
      throw new TypeError('A project ID, serialized project, and valid sample hashes are required.');
    }
    parseManifest({
      version: 1,
      createdAt: new Date().toISOString(),
      projectId,
      projectJson,
      sampleHashes: [...new Set(sampleHashes)],
    });

    const uniqueHashes = [...new Set(sampleHashes)];
    const samples: SPM8BundleSample[] = [];
    for (const hash of uniqueHashes) {
      const sample = await SessionVault.getSampleBlob(hash);
      if (!sample) throw new Error(`Cannot export project: sample "${hash}" is missing from the session vault.`);
      samples.push({
        hash,
        base64Data: encodeBase64(new Uint8Array(await sample.arrayBuffer())),
        mimeType: sample.type,
      });
    }

    const bundleData: SPM8BundleManifest = {
      version: 1,
      createdAt: new Date().toISOString(),
      projectId,
      projectJson,
      sampleHashes: uniqueHashes,
      samples,
    };
    return new Blob([JSON.stringify(bundleData, null, 2)], { type: 'application/json' });
  }

  /** Import project JSON and hydrate all bundled sample blobs into IndexedDB. */
  public static async importBundle(file: File): Promise<string> {
    return this.importBundleJson(await file.text());
  }

  public static async importBundleJson(json: string): Promise<string> {
    let raw: unknown;
    try {
      raw = JSON.parse(json);
    } catch {
      throw new Error('Invalid .sp8 bundle JSON.');
    }
    const manifest = parseManifest(raw);
    const project = JSON.parse(manifest.projectJson) as Record<string, unknown>;
    const meta = isRecord(project.meta) ? project.meta : undefined;
    const projectId = manifest.projectId || (typeof meta?.id === 'string' ? meta.id : '') ||
      `imported_project_${Date.now()}`;
    const hydratedSamples = (manifest.samples ?? []).map(({ hash, base64Data, mimeType }) => ({
      hash,
      blob: decodeBase64(base64Data, mimeType),
    }));

    for (const sample of hydratedSamples) {
      await SessionVault.storeSampleBlob(sample.hash, sample.blob);
    }
    await SessionVault.saveProjectSession(projectId, manifest.projectJson);
    return projectId;
  }
}
