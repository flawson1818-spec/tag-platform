/**
 * The administration areas, each shown only to members holding one of its permissions
 * (docs/06_RBAC_SPECIFICATION.md). The server enforces the same permissions on every action.
 */
export interface AdminSection {
  to: string;
  key: string;
  icon: string;
  permissions: string[];
}

export const ADMIN_SECTIONS: AdminSection[] = [
  { to: '/admin/prayer-requests', key: 'prayerRequests', icon: '🙏', permissions: ['prayer_request.manage_status'] },
  { to: '/admin/users', key: 'members', icon: '👥', permissions: ['user.manage', 'role.assign'] },
  { to: '/programs', key: 'programs', icon: '🕯️', permissions: ['prayer_program.create'] },
  { to: '/admin/veille', key: 'watch', icon: '🔥', permissions: ['prayer_program.create'] },
  { to: '/room/moderate', key: 'room', icon: '🎙️', permissions: ['room.moderate'] },
  { to: '/admin/moderation', key: 'moderation', icon: '🛡️', permissions: ['testimony.approve'] },
  { to: '/social-publications', key: 'publications', icon: '📣', permissions: ['content.publish_official'] },
  { to: '/campaigns', key: 'campaigns', icon: '🎯', permissions: ['content.publish_official'] },
  { to: '/admin/analytics', key: 'analytics', icon: '📊', permissions: ['analytics.view_dashboard'] },
  { to: '/admin/system', key: 'system', icon: '⚙️', permissions: ['system.operate'] },
];

/** Every permission that opens at least one administration area. */
export const ADMIN_PERMISSIONS = Array.from(new Set(ADMIN_SECTIONS.flatMap((s) => s.permissions)));
