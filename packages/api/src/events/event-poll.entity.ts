export interface EventPoll {
  id: string;
  event_id: string;
  question: string;
  options: string[];
  closed_at: string | null;
  created_at: string;
}

export interface EventPollResult extends EventPoll {
  vote_counts: number[];
  total_votes: number;
  my_vote: number | null;
}
