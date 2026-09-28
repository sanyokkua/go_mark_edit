import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { join } from 'node:path';

import { preparedPaths, selectedRepository } from './prepare';

const execFileAsync = promisify(execFile);

export function profileDirectory(tempDirectory: string): string {
    if (process.platform === 'darwin') {
        return join(tempDirectory, 'Library', 'Application Support', 'GoMarkEdit-Dev');
    }
    return join(tempDirectory, 'GoMarkEdit-Dev');
}

export async function runSeed(profileDirectoryPath: string, args: readonly string[]): Promise<void> {
    await execFileAsync(preparedPaths().seedExecutable, [profileDirectoryPath, ...args], {
        cwd: selectedRepository(),
        env: { ...process.env },
        maxBuffer: 1024 * 1024,
    });
}

export async function seedRecents(
    profileDirectoryPath: string,
    items: readonly (string | { path: string; kind: 'file' | 'folder' })[],
): Promise<void> {
    if (items.length === 0) {
        throw new Error('seedRecents requires at least one item');
    }

    const typed = items.some((item) => typeof item !== 'string');
    const argumentsForItems = typed
        ? ['--typed', ...items.flatMap((item) => (typeof item === 'string' ? ['file', item] : [item.kind, item.path]))]
        : (items as readonly string[]);

    await runSeed(profileDirectoryPath, ['seed-recents', ...argumentsForItems]);
}
