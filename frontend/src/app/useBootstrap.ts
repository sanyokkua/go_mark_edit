import { useCallback, useEffect, useRef, useState } from 'react';

import type { AppModelAdapter } from '../logic/adapter/appModelAdapter';
import { setBootstrapStatus as setCommandBootstrapStatus } from '../logic/adapter/command';
import type { SettingsAdapter } from '../logic/adapter/services';
import type { WindowAdapter } from '../logic/adapter/windowAdapter';
import {
  bootstrapAppModelProjection,
  disposeAppModelProjection,
  type AppModelBootstrapResult,
} from '../logic/store/appModelProjection';
import {
  bootstrapSettingsProjection,
  disposeSettingsProjection,
} from '../logic/store/settingsProjection';

export type BootstrapStep = 'bridge' | 'model' | 'settings' | 'window-ready';

export interface StartupFailure {
  category: string;
  step: BootstrapStep;
  timedOut: boolean;
}

export interface BootstrapAdapters {
  appModelAdapter: AppModelAdapter;
  applicationAdapter: { retryStartup: () => Promise<void> };
  settingsAdapter: SettingsAdapter;
  windowAdapter: Pick<WindowAdapter, 'windowReady'>;
}

export interface UseBootstrapOptions {
  bootstrapModel?: (
    adapter: AppModelAdapter,
  ) => Promise<AppModelBootstrapResult>;
  bootstrapSettings?: (adapter: SettingsAdapter) => Promise<void>;
  loadAdapters?: () => Promise<BootstrapAdapters>;
  onReady?: (
    result: Extract<AppModelBootstrapResult, { status: 'ready' }>,
  ) => void;
}

export interface BootstrapController {
  failure: StartupFailure | null;
  isRetrying: boolean;
  result: Extract<AppModelBootstrapResult, { status: 'ready' }> | null;
  retry: () => void;
  status: 'loading' | 'ready' | 'failed';
}

const STARTUP_TIMEOUT_MS = 10_000;
const STARTUP_STEPS: readonly BootstrapStep[] = [
  'bridge',
  'model',
  'settings',
  'window-ready',
];

class StartupStepError extends Error {
  readonly category: string;
  readonly step: BootstrapStep;
  readonly timedOut: boolean;

  constructor(step: BootstrapStep, category: string, timedOut = false) {
    super(`${step} startup step failed`);
    this.category = category;
    this.step = step;
    this.timedOut = timedOut;
  }
}

const defaultLoadAdapters = async (): Promise<BootstrapAdapters> =>
  import('../logic/adapter');

function categoryFrom(error: unknown): string {
  if (error instanceof StartupStepError) {
    return error.category;
  }
  if (typeof error === 'object' && error !== null) {
    const candidate = error as { category?: unknown; code?: unknown };
    if (
      typeof candidate.category === 'string' &&
      candidate.category.trim() !== ''
    ) {
      return candidate.category;
    }
    if (typeof candidate.code === 'string' && candidate.code.trim() !== '') {
      return candidate.code;
    }
  }
  return 'internal';
}

function stepError(
  error: unknown,
  currentStep: BootstrapStep,
): StartupStepError {
  if (error instanceof StartupStepError) {
    return error;
  }
  return new StartupStepError(currentStep, categoryFrom(error));
}

function withTimeout<T>(
  operation: () => Promise<T>,
  step: BootstrapStep,
): Promise<T> {
  return new Promise<T>((resolve, reject): void => {
    let settled = false;
    const timer = globalThis.setTimeout((): void => {
      settled = true;
      reject(new StartupStepError(step, 'timeout', true));
    }, STARTUP_TIMEOUT_MS);

    let operationPromise: Promise<T>;
    try {
      operationPromise = Promise.resolve(operation());
    } catch (error) {
      globalThis.clearTimeout(timer);
      settled = true;
      reject(error);
      return;
    }

    void operationPromise.then(
      (value): void => {
        if (settled) return;
        settled = true;
        globalThis.clearTimeout(timer);
        resolve(value);
      },
      (error: unknown): void => {
        if (settled) return;
        settled = true;
        globalThis.clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export function useBootstrap(
  options: UseBootstrapOptions = {},
): BootstrapController {
  const loadAdapters = options.loadAdapters ?? defaultLoadAdapters;
  const bootstrapModel = options.bootstrapModel ?? bootstrapAppModelProjection;
  const bootstrapSettings =
    options.bootstrapSettings ?? bootstrapSettingsProjection;
  const onReadyRef = useRef(options.onReady);
  const mountedRef = useRef(false);
  const attemptRef = useRef(0);
  const flightRef = useRef(false);
  const failureRef = useRef<StartupFailure | null>(null);
  const servicesRef = useRef<BootstrapAdapters | undefined>(undefined);
  const modelResultRef = useRef<Extract<
    AppModelBootstrapResult,
    { status: 'ready' }
  > | null>(null);
  const [state, setState] = useState<BootstrapController>({
    failure: null,
    isRetrying: false,
    result: null,
    retry: (): void => undefined,
    status: 'loading',
  });

  useEffect((): void => {
    onReadyRef.current = options.onReady;
  }, [options.onReady]);

  const run = useCallback(
    (isRetry: boolean): void => {
      if (flightRef.current) return;
      const previousFailure = isRetry ? failureRef.current : null;
      const retryStep = previousFailure?.step;
      const attemptID = attemptRef.current + 1;
      attemptRef.current = attemptID;
      flightRef.current = true;
      failureRef.current = null;
      setState((current) => ({
        ...current,
        failure: null,
        isRetrying: isRetry,
        result: null,
        status: 'loading',
      }));
      setCommandBootstrapStatus('loading');

      if (retryStep === 'model') {
        modelResultRef.current = null;
        disposeAppModelProjection();
      } else if (retryStep === 'settings') {
        disposeSettingsProjection();
      }

      void (async (): Promise<void> => {
        let currentStep: BootstrapStep = retryStep ?? 'bridge';
        try {
          let services = servicesRef.current;
          if (services === undefined) {
            currentStep = 'bridge';
            services = await withTimeout(loadAdapters, currentStep);
            if (attemptRef.current !== attemptID) return;
            servicesRef.current = services;
          }

          if (isRetry && retryStep !== undefined && retryStep !== 'bridge') {
            currentStep = retryStep;
            await withTimeout(
              services.applicationAdapter.retryStartup,
              currentStep,
            );
          }

          const firstStepIndex =
            retryStep === undefined ? 0 : STARTUP_STEPS.indexOf(retryStep);
          if (
            firstStepIndex <= STARTUP_STEPS.indexOf('model') ||
            modelResultRef.current === null
          ) {
            currentStep = 'model';
            const modelResult = await withTimeout(
              (): Promise<AppModelBootstrapResult> =>
                bootstrapModel(services.appModelAdapter),
              currentStep,
            );
            if (modelResult.status !== 'ready') {
              throw new StartupStepError(
                modelResult.failure?.step ?? 'model',
                modelResult.failure?.category ?? 'internal',
              );
            }
            modelResultRef.current = modelResult;
          }

          const modelResult = modelResultRef.current;
          if (modelResult === null) {
            throw new StartupStepError('model', 'internal');
          }

          if (firstStepIndex <= STARTUP_STEPS.indexOf('settings')) {
            currentStep = 'settings';
            await withTimeout(
              (): Promise<void> => bootstrapSettings(services.settingsAdapter),
              currentStep,
            );
          }

          if (firstStepIndex <= STARTUP_STEPS.indexOf('window-ready')) {
            currentStep = 'window-ready';
            await withTimeout(services.windowAdapter.windowReady, currentStep);
          }

          if (attemptRef.current !== attemptID || !mountedRef.current) return;
          onReadyRef.current?.(modelResult);
          setState({
            failure: null,
            isRetrying: false,
            result: modelResult,
            retry: (): void => undefined,
            status: 'ready',
          });
          setCommandBootstrapStatus('ready');
        } catch (error) {
          if (attemptRef.current !== attemptID || !mountedRef.current) return;
          const failure = stepError(error, currentStep);
          const nextFailure: StartupFailure = {
            category: failure.category,
            step: failure.step,
            timedOut: failure.timedOut,
          };
          failureRef.current = nextFailure;
          setState((current) => ({
            ...current,
            failure: nextFailure,
            isRetrying: false,
            result: null,
            status: 'failed',
          }));
          setCommandBootstrapStatus('failed');
        } finally {
          if (attemptRef.current === attemptID) {
            flightRef.current = false;
          }
        }
      })();
    },
    [bootstrapModel, bootstrapSettings, loadAdapters],
  );

  const retry = useCallback((): void => {
    if (failureRef.current === null) return;
    run(true);
  }, [run]);

  useEffect((): (() => void) => {
    mountedRef.current = true;
    run(false);
    return (): void => {
      mountedRef.current = false;
    };
  }, [run]);

  return { ...state, retry };
}
