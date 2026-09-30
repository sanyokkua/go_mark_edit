import { isForeignRequest } from '../../support/requestGuard';

const appOrigin = 'http://127.0.0.1:34123';

it('allows requests to the exact application origin including preview images', () => {
    expect(isForeignRequest(`${appOrigin}/`, appOrigin)).toBe(false);
    expect(isForeignRequest(`${appOrigin}/preview-image?id=one`, appOrigin)).toBe(false);
});

it('allows local data and blob resources that do not make network requests', () => {
    expect(isForeignRequest('data:image/png;base64,AA==', appOrigin)).toBe(false);
    expect(isForeignRequest('blob:http://127.0.0.1:34123/7c805793-ec5d-4f11-8419-54f332ab23947', appOrigin)).toBe(
        false,
    );
});

it('flags foreign hosts and other local ports', () => {
    expect(isForeignRequest('https://example.com/image.png', appOrigin)).toBe(true);
    expect(isForeignRequest('http://localhost:34123/preview-image', appOrigin)).toBe(true);
    expect(isForeignRequest('http://127.0.0.1:34124/preview-image', appOrigin)).toBe(true);
    expect(isForeignRequest('https://127.0.0.1:34123/preview-image', appOrigin)).toBe(true);
});

it('flags WebSocket and malformed request URLs', () => {
    expect(isForeignRequest('ws://127.0.0.1:34123/wails/ipc', appOrigin)).toBe(true);
    expect(isForeignRequest('not a URL', appOrigin)).toBe(true);
    expect(isForeignRequest('http://[invalid', appOrigin)).toBe(true);
});
