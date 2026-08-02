/**
 * Menyetel ulang password SELURUH user ke satu nilai yang sama.
 *
 *   npm run users:reset-password              # semua user -> 123456
 *   NEW_PASSWORD=rahasia npm run users:reset-password
 *
 * Dipakai untuk lingkungan demo dan pengembangan, di mana setiap akun harus bisa
 * dibuka dengan kredensial yang sama. Di produksi ini menyamakan password admin
 * dengan password seluruh personel, jadi harus diminta secara eksplisit.
 */
import bcrypt from 'bcryptjs';
import { pool } from '../db/pool';

const NEW_PASSWORD = process.env.NEW_PASSWORD ?? '123456';

async function main() {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_WEAK_PASSWORD_RESET !== 'true') {
    console.error('[users] DIBATALKAN — NODE_ENV=production.');
    console.error('[users] Menyamakan password semua akun di produksi berarti satu');
    console.error('[users] password bocor membuka seluruh sistem, termasuk super user.');
    console.error('[users] Kalau memang disengaja, jalankan dengan ALLOW_WEAK_PASSWORD_RESET=true.');
    await pool.end();
    process.exit(1);
  }

  const hash = await bcrypt.hash(NEW_PASSWORD, 10);
  const { rowCount } = await pool.query('UPDATE users SET password_hash = $1', [hash]);

  const { rows } = await pool.query<{ role: string; count: string }>(
    `SELECT r.code AS role, count(*)::text AS count
       FROM users u JOIN roles r ON r.id = u.role_id
      GROUP BY r.code ORDER BY r.code`
  );

  console.log(`[users] ${rowCount} akun disetel ke password: ${NEW_PASSWORD}`);
  for (const row of rows) console.log(`[users]   ${row.role.padEnd(12)} ${row.count}`);

  await pool.end();
}

main().catch((err) => {
  console.error('[users] gagal', err);
  process.exit(1);
});
