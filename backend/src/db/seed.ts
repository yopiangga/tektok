import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { pool } from './pool';
import { ensureRoles } from './roles';

/**
 * Bootstrap seed — the minimum a fresh deployment needs to be usable:
 *
 *   1. roles      — reference data; `users.role_id` is a foreign key
 *   2. one commander — something to log in with
 *
 * Nothing else is invented. Units, operations, personnel accounts, reports,
 * missions and incidents are real operational records and are created through
 * the app (Pengaturan Sistem → Unit / Operasi / Pengguna), not fabricated here.
 *
 * For a populated demo/testing environment, run `npm run db:seed:demo`.
 */

const ADMIN_USERNAME = process.env.ADMIN_USERNAME ?? 'admin';
const ADMIN_NAME = process.env.ADMIN_NAME ?? 'Super User';

async function main() {
  const roleId = await ensureRoles(pool);

  const existing = await pool.query<{ id: number }>(
    'SELECT id FROM users WHERE lower(username) = lower($1)',
    [ADMIN_USERNAME]
  );

  if (existing.rows.length > 0) {
    console.log(`[seed] roles ensured; admin "${ADMIN_USERNAME}" already exists — left untouched`);
    await pool.end();
    return;
  }

  // A generated password beats a hardcoded one: it is printed once here and
  // never ends up committed in a repo or copied between environments.
  const generated = !process.env.ADMIN_PASSWORD;
  const password = process.env.ADMIN_PASSWORD ?? crypto.randomBytes(9).toString('base64url');

  await pool.query(
    `INSERT INTO users (username, password_hash, full_name, role_id, status)
     VALUES ($1,$2,$3,$4,'offline')`,
    [ADMIN_USERNAME.toLowerCase(), await bcrypt.hash(password, 10), ADMIN_NAME, roleId.superuser]
  );

  console.log('[seed] roles ensured');
  console.log(`[seed] akun super user dibuat: ${ADMIN_USERNAME}`);
  if (generated) {
    console.log('');
    console.log(`    password: ${password}`);
    console.log('');
    console.log('[seed] shown once — store it now, then change it in Pengaturan Sistem.');
  } else {
    console.log('[seed] password taken from ADMIN_PASSWORD.');
  }
  console.log('[seed] next: add units, an operation, and personnel via Pengaturan Sistem.');

  await pool.end();
}

main().catch((err) => {
  console.error('[seed] failed', err);
  process.exit(1);
});
