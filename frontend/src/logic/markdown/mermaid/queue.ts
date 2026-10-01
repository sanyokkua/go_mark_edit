import { mermaidConfig } from './config';
import { scrubMermaidSvg } from './scrub';

export type MermaidResult =
    { kind: 'svg'; svg: string } | { kind: 'error'; message: string; stage?: 'load' } | { kind: 'aborted' };

type Mermaid = typeof import('mermaid').default;
type Request = { source: string; theme: string; signal: AbortSignal };

interface Subscriber {
    resolve: (result: MermaidResult) => void;
    signal: AbortSignal;
    onAbort: () => void;
}

interface Job {
    key: string;
    source: string;
    theme: string;
    subscribers: Set<Subscriber>;
}

function errorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    if (typeof error === 'object' && error !== null && 'message' in error) {
        return String((error.message ?? error) as string);
    }
    return String(error as string);
}

/** Mermaid owns global configuration, so every initialize/parse/render sequence is serialized. */
export class MermaidQueue {
    private tail: Promise<void> = Promise.resolve();
    private readonly active = new Map<string, Job>();
    private readonly cache = new Map<string, string>();
    private mermaid?: Mermaid;
    private nextId = 0;

    render(request: Request): Promise<MermaidResult> {
        if (request.signal.aborted) return Promise.resolve({ kind: 'aborted' });
        const key = `${request.theme}\0${request.source}`;
        const cached = this.cache.get(key);
        if (cached !== undefined) {
            this.cache.delete(key);
            this.cache.set(key, cached);
            return Promise.resolve({ kind: 'svg', svg: cached });
        }

        let job = this.active.get(key);
        if (!job) {
            job = { key, source: request.source, theme: request.theme, subscribers: new Set() };
            this.active.set(key, job);
            const scheduled = job;
            this.tail = this.tail.then(() => this.run(scheduled));
        }
        const current = job;
        return new Promise<MermaidResult>((resolve) => {
            const subscriber: Subscriber = {
                resolve,
                signal: request.signal,
                onAbort: () => {
                    current.subscribers.delete(subscriber);
                    request.signal.removeEventListener('abort', subscriber.onAbort);
                    resolve({ kind: 'aborted' });
                },
            };
            current.subscribers.add(subscriber);
            request.signal.addEventListener('abort', subscriber.onAbort, { once: true });
            if (request.signal.aborted) subscriber.onAbort();
        });
    }

    private async load(): Promise<Mermaid> {
        if (this.mermaid) return this.mermaid;
        try {
            this.mermaid = (await import('mermaid')).default;
        } catch {
            this.mermaid = (await import('mermaid')).default;
        }
        return this.mermaid;
    }

    private finish(job: Job, result: MermaidResult): void {
        this.active.delete(job.key);
        for (const subscriber of job.subscribers) {
            subscriber.signal.removeEventListener('abort', subscriber.onAbort);
            subscriber.resolve(result);
        }
        job.subscribers.clear();
    }

    private async run(job: Job): Promise<void> {
        if (job.subscribers.size === 0) {
            this.finish(job, { kind: 'aborted' });
            return;
        }
        let mermaid: Mermaid;
        try {
            mermaid = await this.load();
        } catch (error) {
            this.finish(job, { kind: 'error', stage: 'load', message: errorMessage(error) });
            return;
        }
        if (job.subscribers.size === 0) {
            this.finish(job, { kind: 'aborted' });
            return;
        }

        const id = `gme-mmd-${++this.nextId}`;
        let result: MermaidResult;
        try {
            mermaid.initialize(mermaidConfig(job.theme));
            await mermaid.parse(job.source);
            const rendered = await mermaid.render(id, job.source);
            result = { kind: 'svg', svg: scrubMermaidSvg(rendered.svg) };
        } catch (error) {
            result = { kind: 'error', message: errorMessage(error) };
        } finally {
            document.getElementById(id)?.remove();
            document.getElementById(`d${id}`)?.remove();
        }
        if (result.kind === 'svg' && job.subscribers.size > 0) {
            this.cache.set(job.key, result.svg);
            if (this.cache.size > 50) this.cache.delete(this.cache.keys().next().value!);
        }
        this.finish(job, result);
    }
}

export const mermaidQueue = new MermaidQueue();
