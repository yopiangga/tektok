import { pool } from './pool';

/**
 * Idempotent schema patches for databases created before a change.
 *
 * `schema.sql` drops and recreates everything, so it only serves fresh
 * installs. These statements bring an existing database in line without
 * touching its data, and are safe to run repeatedly.
 */
const PATCHES: Array<{ name: string; sql: string }> = [
  {
    // Reports became editable, so they need a modification timestamp.
    name: 'reports.updated_at',
    sql: `ALTER TABLE reports ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ`,
  },
];

async function main() {
  for (const patch of PATCHES) {
    await pool.query(patch.sql);
    console.log(`[patch] ${patch.name} ✓`);
  }
  console.log(`[patch] ${PATCHES.length} patch diterapkan`);
  await pool.end();
}

main().catch((err) => {
  console.error('[patch] gagal', err);
  process.exit(1);
});
