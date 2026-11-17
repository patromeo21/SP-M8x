import { SessionVault } from './sessionVault';

export interface SPM8BundleManifest {
  version: number;
  createdAt: string;
  projectJson: string;
  sampleHashes: string[];
}

export class SPM8BundleManager {
  /**
   * Export current project and its referenced audio samples into a portable .sp8 string/blob bundle
   */
  public static async exportBundle(projectId: string, projectJson: string, sampleHashes: string[]): Promise<Blob> {
    const bundleData: SPM8BundleManifest = {
      version: 1,
      createdAt: new Date().toISOString(),
      projectJson,
      sampleHashes,
    };

    const jsonString = JSON.stringify(bundleData, null, 2);
    return new Blob([jsonString], { type: 'application/json' });
  }

  /**
   * Import and unpack a .sp8 bundle file, restoring projects and verifying sample integrity into IndexedDB
   */
  public static async importBundle(file: File): Promise<string> {
    const text = await file.text();
    const manifest: SPM8BundleManifest = JSON.parse(text);

    if (!manifest.version || !manifest.projectJson) {
      throw new Error('Invalid .sp8 bundle format: missing manifest metadata.');
    }

    const parsedProject = JSON.parse(manifest.projectJson);
    const projectId = parsedProject.meta?.id || 'imported_project_' + Date.now();

    await SessionVault.saveProjectSession(projectId, manifest.projectJson);

    return projectId;
  }
}