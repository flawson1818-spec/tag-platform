export interface EventBreakoutRoom {
  id: string;
  event_id: string;
  label: string;
  capacity: number | null;
  created_at: string;
}

export interface EventBreakoutRoomWithOccupancy extends EventBreakoutRoom {
  occupant_count: number;
}

export interface EventBreakoutAssignmentResult {
  roomId: string;
  redirected: boolean;
}
