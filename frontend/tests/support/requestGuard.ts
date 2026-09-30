export function isForeignRequest(url: string, appOrigin: string): boolean {
    try {
        const request = new URL(url);
        // data: and blob: identify local resources; loading them makes no network request.
        if (request.protocol === 'data:' || request.protocol === 'blob:') return false;
        const app = new URL(appOrigin);
        return (
            (request.protocol !== 'http:' && request.protocol !== 'https:') ||
            (app.protocol !== 'http:' && app.protocol !== 'https:') ||
            request.origin !== app.origin
        );
    } catch {
        return true;
    }
}
