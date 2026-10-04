import { buildUnsupportedFileNotice } from '../../../src/logic/store/linkNotification';

it('builds a localized unsupported-file notice with the reveal path only in remediation metadata', () => {
    const notice = buildUnsupportedFileNotice('/outside/private/report.pdf', 'report.pdf');

    expect(notice).toMatchObject({
        code: 'link-unsupported-file',
        severity: 'warning',
        title: 'report.pdf',
        message: 'This file is not a document the editor can open.',
        remediations: [
            {
                action: 'retry',
                intent: 'reveal-workspace-path',
                labelKey: 'action.reveal-in-file-manager.label',
                path: '/outside/private/report.pdf',
            },
        ],
    });
    expect(notice?.subject).not.toBe('report.pdf');
    expect(`${notice?.subject} ${notice?.title} ${notice?.message}`).not.toContain('/outside/private');
});

it('uses the same opaque subject for one target and distinct subjects for same-named targets', () => {
    const first = buildUnsupportedFileNotice('/a/report.pdf', 'report.pdf');
    const repeated = buildUnsupportedFileNotice('/a/report.pdf', 'report.pdf');
    const second = buildUnsupportedFileNotice('/b/report.pdf', 'report.pdf');

    expect(first?.subject).toBe(repeated?.subject);
    expect(first?.subject).not.toBe(second?.subject);
    expect(first?.subject).not.toContain('/a/report.pdf');
    expect(second?.subject).not.toContain('/b/report.pdf');
});

it('does not offer a Reveal action without a path or expose an unsafe subject', () => {
    expect(buildUnsupportedFileNotice('', 'report.pdf')).toBeUndefined();

    const notice = buildUnsupportedFileNotice('/outside/private/report.pdf', '/outside/private/report.pdf');
    expect(`${notice?.subject} ${notice?.title} ${notice?.message}`).not.toContain('/outside/private');
});
