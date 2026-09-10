import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { join } from 'node:path';

const execFileAsync = promisify(execFile);

export function profileDirectory(tempDirectory: string): string {
  if (process.platform === 'darwin') {
    return join(
      tempDirectory,
      'Library',
      'Application Support',
      'GoMarkEdit-Dev',
    );
  }
  return join(tempDirectory, 'GoMarkEdit-Dev');
}

export async function seedRecents(
  repositoryDirectory: string,
  profileDirectoryPath: string,
  files: readonly string[],
): Promise<void> {
  if (files.length === 0) {
    throw new Error('seedRecents requires at least one file');
  }

  await execFileAsync(
    process.env.GO_BIN ?? 'go',
    ['run', './tools/e2e-seed', profileDirectoryPath, 'seed-recents', ...files],
    {
      cwd: repositoryDirectory,
      env: { ...process.env },
      maxBuffer: 1024 * 1024,
    },
  );
}
