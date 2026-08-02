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

/**
 * schema.sql opens with `DROP TABLE ... CASCADE`, so re-running it wipes every
 * row. That is fine on a laptop and catastrophic on a deployed server, where the
 * obvious reflex after `git pull` is to "just run the migration again". Refuse
 * unless the operator says so explicitly.
 */
async function guardProduction(): Promise<void> {
  if (process.env.NODE_ENV !== 'production') return;
  if (process.env.ALLOW_DESTRUCTIVE_MIGRATE === 'true') return;

  const { rows } = await pool.query<{ populated: boolean }>(
    `SELECT to_regclass('public.users') IS NOT NULL AS populated`
  );
  if (!rows[0]?.populated) return;

  console.error('[migrate] DIBATALKAN — database sudah berisi tabel.');
  console.error('[migrate] schema.sql melakukan DROP TABLE: menjalankannya akan');
  console.error('[migrate] menghapus SELURUH data produksi.');
  console.error('');
  console.error('[migrate] Untuk perubahan skema pada server yang sudah jalan,');
  console.error('[migrate] pakai:  node dist/db/patch.js');
  console.error('');
  console.error('[migrate] Kalau memang ingin mengosongkan database, jalankan ulang');
  console.error('[migrate] dengan ALLOW_DESTRUCTIVE_MIGRATE=true.');
  await pool.end();
  process.exit(1);
}

async function main() {
  await guardProduction();

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
