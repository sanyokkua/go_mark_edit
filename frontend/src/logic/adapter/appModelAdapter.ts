import { guardArity } from './bridgeGuard';
import { unwrapPromise } from './envelope';
import type {
  AppModelState,
  AppStatePatch,
  DocViewInput,
  UILayout,
} from '../store/appModelTypes';

interface VoidResult {
  error?: import('../utils/parseError').WireError;
}

interface StateResult {
  data?: AppModelState;
  error?: import('../utils/parseError').WireError;
}

export interface AppModelBindings {
  getState: () => Promise<StateResult>;
  updateBuffer: (documentId: string, content: string) => Promise<VoidResult>;
  setDocView: (documentId: string, view: DocViewInput) => Promise<VoidResult>;
  setUILayout: (layout: UILayout) => Promise<VoidResult>;
}

export interface AppModelRuntime {
  eventsOn: (
    eventName: string,
    callback: (payload: unknown) => void,
  ) => () => void;
}

export interface AppModelAdapter {
  getState: () => Promise<AppModelState>;
  updateBuffer: (documentId: string, content: string) => Promise<void>;
  setDocView: (documentId: string, view: DocViewInput) => Promise<void>;
  setUILayout: (layout: UILayout) => Promise<void>;
  subscribeStatePatches: (
    onPatch: (patch: AppStatePatch) => void,
  ) => () => void;
}

function isAppStatePatch(payload: unknown): payload is AppStatePatch {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'revision' in payload &&
    typeof payload.revision === 'number'
  );
}

export function createAppModelAdapter(
  bindings: AppModelBindings,
  runtime: AppModelRuntime,
): AppModelAdapter {
  const getState = guardArity('AppModelHandler.GetState', bindings.getState);
  const updateBuffer = guardArity(
    'AppModelHandler.UpdateBuffer',
    bindings.updateBuffer,
  );
  const setDocView = guardArity(
    'AppModelHandler.SetDocView',
    bindings.setDocView,
  );
  const setUILayout = guardArity(
    'AppModelHandler.SetUILayout',
    bindings.setUILayout,
  );
  let disposeStatePatches: (() => void) | undefined;

  return {
    async getState(): Promise<AppModelState> {
      return unwrapPromise(getState());
    },
    async updateBuffer(documentId: string, content: string): Promise<void> {
      return unwrapPromise(updateBuffer(documentId, content));
    },
    async setDocView(documentId: string, view: DocViewInput): Promise<void> {
      return unwrapPromise(setDocView(documentId, view));
    },
    async setUILayout(layout: UILayout): Promise<void> {
      return unwrapPromise(setUILayout(layout));
    },
    subscribeStatePatches(onPatch: (patch: AppStatePatch) => void): () => void {
      if (disposeStatePatches !== undefined) {
        return disposeStatePatches;
      }

      const unsubscribe = runtime.eventsOn(
        'state:patch',
        (payload: unknown) => {
          if (isAppStatePatch(payload)) {
            onPatch(payload);
          }
        },
      );
      const dispose = (): void => {
        if (disposeStatePatches !== dispose) {
          return;
        }
        unsubscribe();
        disposeStatePatches = undefined;
      };
      disposeStatePatches = dispose;
      return dispose;
    },
  };
}
