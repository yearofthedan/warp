import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const sourceDir = fileURLToPath(new URL('../', import.meta.url));
const code = /(?<!\.test)\.(ts|js)$/;

export const toolDigest = (): string => {
  const digest = createHash('sha256').update(createRequire(import.meta.url)('typescript/package.json').version);
  const files = readdirSync(sourceDir, { recursive: true, encoding: 'utf8' })
    .filter((file) => code.test(file))
    .sort();
  for (const file of files) digest.update(file).update(readFileSync(join(sourceDir, file)));
  return digest.digest('hex').slice(0, 16);
};
