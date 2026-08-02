export type RoleCode = 'superuser' | 'personnel' | 'drone' | 'screen';

/**
 * Roles that operate in the field and therefore see only their own records.
 *
 * `drone` and `screen` are desktop stations rather than people on foot, so they
 * are deliberately NOT part of the personnel roster (map markers, presence
 * sweep, "personnel active" statistics) — but they scope data exactly like
 * personnel and may broadcast.
 */
export const FIELD_ROLES: RoleCode[] = ['personnel', 'drone', 'screen'];

export const isFieldRole = (role: RoleCode): boolean => FIELD_ROLES.includes(role);

export interface AuthUser {
  id: number;
  username: string;
  fullName: string;
  role: RoleCode;
  unitId: number | null;
  unitName: string | null;
  permissions: string[];
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export {};
