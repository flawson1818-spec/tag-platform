/** One picture per kind of community, so a list reads at a glance. */
export const COMMUNITY_ICONS: Record<string, string> = {
  CHURCH: '⛪',
  CELL: '🏠',
  GROUP: '🙏',
  TEAM: '🤝',
  MINISTRY: '🕊️',
  CITY: '🏙️',
  COUNTRY: '🌍',
};

export function communityIcon(type: string): string {
  return COMMUNITY_ICONS[type] ?? '👥';
}
