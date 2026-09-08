import { LogInfo, Quit } from 'wailsjs/runtime';

// This seam is imported only by the build-tagged native-evidence frontend entrypoint.
export const nativeEvidenceRuntime = {
  logInfo: (message: string): void => LogInfo(message),
  quit: (): void => Quit(),
};
