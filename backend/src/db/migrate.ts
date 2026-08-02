import fs from 'fs';
import path from 'path';
import { pool } from './pool';

/** Works from both `src/db` (tsx) and `dist/db` (compiled image layout). */
function resolveSchemaPath(): string {
  const candidates = [
    path.resolve(__dirname, '../../../db/schema.sql'), // repo:  backend/src/db -> db
    path.resolve(__dirname, '../../db/schema.sql'), // image: /app/dist/db -> /app/db
    path.resolve(process.cwd(), '../db/schema.sql'),
    path.resolve(process.cwd(), 'db/schema.sql'),
  ];

  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) {
    throw new Error(`schema.sql not found. Looked in:\n  ${candidates.join('\n  ')}`);
  }
  return found;
}

async function main() {
  const schemaPath = resolveSchemaPath();
  console.log(`[migrate] applying ${schemaPath}`);

  await pool.query(fs.readFileSync(schemaPath, 'utf8'));
  console.log('[migrate] schema applied');

  await pool.end();
}

main().catch((err) => {
  console.error('[migrate] failed', err);
  process.exit(1);
});
