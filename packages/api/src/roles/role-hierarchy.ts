/** Ordered from least to most senior, see docs/06_RBAC_SPECIFICATION.md section 2. */
export const ROLE_HIERARCHY = [
  'VISITEUR',
  'NOUVEAU_CONVERTI',
  'INTERCESSEUR',
  'MODERATEUR',
  'RESPONSABLE_EQUIPE',
  'PASTEUR',
  'ADMINISTRATEUR',
  'SUPER_ADMINISTRATEUR',
] as const;

export type RoleCode = (typeof ROLE_HIERARCHY)[number];

export const DEFAULT_REGISTRATION_ROLE: RoleCode = 'VISITEUR';

/** `role.assign` only lets its holder assign roles up to Pasteur, see docs/06_RBAC_SPECIFICATION.md section 3. */
export const MAX_ASSIGNABLE_ROLE: RoleCode = 'PASTEUR';

export function roleRank(code: string): number {
  return ROLE_HIERARCHY.indexOf(code as RoleCode);
}

export function isRoleCode(code: string): code is RoleCode {
  return roleRank(code) >= 0;
}
