import type { Pool } from 'pg';

/**
 * Two roles: superuser runs the operation, personnel work the field.
 *
 * The original blueprint separated Commander from Operator, but the deployment
 * treats command staff as one group, so the distinction only added an
 * authorisation surface nobody used.
 *
 * Roles are reference data, not sample data: `users.role_id` is a foreign key
 * and the permission list drives authorisation, so an empty `roles` table means
 * no account can exist at all.
 */
export const ROLE_DEFINITIONS = [
  {
    code: 'superuser',
    name: 'Super User',
    permissions: [
      'personnel.view',
      'map.view',
      'reports.view',
      'reports.export',
      'streams.view',
      'incidents.create',
      'missions.assign',
      'activity.view',
      'users.manage',
      'settings.manage',
    ],
  },
  {
    code: 'personnel',
    name: 'Personnel',
    permissions: ['gps.share', 'reports.submit', 'streams.start', 'missions.view', 'chat.use'],
  },
  {
    // A drone ground station: same field permissions, but operated from a laptop
    // browser with a capture device as the video source rather than a phone.
    code: 'drone',
    name: 'Drone',
    permissions: ['streams.start', 'reports.submit', 'missions.view', 'chat.use'],
  },
  {
    // Shares a desktop, window or browser tab instead of a camera — for relaying
    // a mapping console, radar feed or briefing to the command centre.
    code: 'screen',
    name: 'Share Screen',
    permissions: ['streams.start', 'reports.submit', 'missions.view', 'chat.use'],
  },
] as const;

/** Roles that existed before the merge; every holder becomes a superuser. */
const LEGACY_COMMAND_ROLES = ['commander', 'operator'];

export async function ensureRoles(pool: Pool): Promise<Record<string, number>> {
  for (const role of ROLE_DEFINITIONS) {
    await pool.query(
      `INSERT INTO roles (code, name, permissions) VALUES ($1,$2,$3)
       ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, permissions = EXCLUDED.permissions`,
      [role.code, role.name, JSON.stringify(role.permissions)]
    );
  }

  // Migrate in place so an existing database converges on the new model without
  // a separate migration step — users are moved off the legacy roles first,
  // because `users.role_id` would otherwise block the delete.
  const moved = await pool.query(
    `UPDATE users SET role_id = (SELECT id FROM roles WHERE code = 'superuser'), updated_at = NOW()
      WHERE role_id IN (SELECT id FROM roles WHERE code = ANY($1))
      RETURNING id`,
    [LEGACY_COMMAND_ROLES]
  );
  if (moved.rowCount) {
    console.log(`[roles] ${moved.rowCount} akun commander/operator dipindahkan ke superuser`);
  }

  const dropped = await pool.query('DELETE FROM roles WHERE code = ANY($1) RETURNING code', [
    LEGACY_COMMAND_ROLES,
  ]);
  if (dropped.rowCount) {
    console.log(`[roles] peran lama dihapus: ${dropped.rows.map((r) => r.code).join(', ')}`);
  }

  const { rows } = await pool.query<{ id: number; code: string }>('SELECT id, code FROM roles');
  return Object.fromEntries(rows.map((r) => [r.code, r.id]));
}
