export interface WorldMapSnapshot {
  presence: number;
  activeRooms: number;
  timezones: { timezone: string; count: number }[];
}

export interface DashboardSnapshot {
  topCategories: { category: string; requestCount: number }[];
  growth: { day: string; newUsers: number }[];
  peakHours: { hourOfDay: number; attendanceCount: number }[];
  retention: { period: string; eligibleUsers: number; retainedUsers: number; retentionRate: number | null }[];
}
