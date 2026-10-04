import TidyWorker from './worker?worker';

/** Vite emits this import as a dedicated browser module worker. */
export function createTidyWorker(): Worker {
    return new TidyWorker();
}
