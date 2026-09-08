import { mkdir, writeFile } from 'node:fs/promises';

const placeholderPath = new URL('../dist/.gitkeep', import.meta.url);

await mkdir(new URL('../dist/', import.meta.url), { recursive: true });
await writeFile(
  placeholderPath,
  'This placeholder keeps frontend/dist available for Go embedding before the frontend build runs.\n',
);
