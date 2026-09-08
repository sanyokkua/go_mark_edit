import { EventsEmit, EventsOn, LogInfo, Quit } from 'wailsjs/runtime';

export const NATIVE_CLOSE_REQUEST_EVENT = 'application-close-requested';

export interface NativeAutosaveCommit {
  trial: number;
  warmup: boolean;
  sizeBytes: number;
  documentId: string;
  contentRevision: number;
  commitIdentity?: string;
  status: 'committed' | 'missed';
  durationNs?: number;
  diskBytes?: number;
  expectedDiskBytes: number;
  failure?: string;
}

// This seam is imported only by the build-tagged native-evidence frontend entrypoint.
export const nativeEvidenceRuntime = {
  logInfo: (message: string): void => LogInfo(message),
  quit: (): void => Quit(),
  onCloseRequested: (listener: () => void): (() => void) =>
    EventsOn(NATIVE_CLOSE_REQUEST_EVENT, () => listener()),
  acknowledgeAutosaveInput: (input: {
    trial: number;
    warmup: boolean;
    sizeBytes: number;
    documentId: string;
  }): void => EventsEmit('native-evidence-autosave-input', input),
  recordAutosaveMiss: (input: {
    trial: number;
    warmup: boolean;
    sizeBytes: number;
    documentId: string;
  }): void => EventsEmit('native-evidence-autosave-miss', input),
  onAutosaveCommit: (
    listener: (commit: NativeAutosaveCommit) => void,
  ): (() => void) =>
    EventsOn('native-evidence-autosave-commit', (payload: unknown) => {
      if (typeof payload === 'object' && payload !== null) {
        listener(payload as NativeAutosaveCommit);
      }
    }),
};
