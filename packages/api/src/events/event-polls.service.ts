import { BadRequestException, ForbiddenException, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateEventPollDto } from './dto/create-event-poll.dto';
import { EventPoll, EventPollResult } from './event-poll.entity';

const POLL_COLUMNS = 'id, event_id, question, options, closed_at, created_at';

interface VoteRow {
  option_index: number;
  user_id: string;
}

/**
 * docs/01_FUNCTIONAL_SPECIFICATION.md §7.2 "Voter (sondage)" and docs/07_UX_UI_SPECIFICATION.md
 * §7's `Poll` component — a live-event capability that was never built. Two brand-new, isolated
 * tables only touched by this service.
 */
@Injectable()
export class EventPollsService {
  constructor(private readonly supabase: SupabaseService) {}

  private get pollsDb() {
    return this.supabase.client.from('event_polls');
  }

  private get votesDb() {
    return this.supabase.client.from('event_poll_votes');
  }

  async create(eventId: string, actorId: string, dto: CreateEventPollDto): Promise<EventPoll> {
    const { data, error } = await this.pollsDb
      .insert({ event_id: eventId, question: dto.question, options: dto.options, created_by: actorId })
      .select(POLL_COLUMNS)
      .single();
    if (error) throw new InternalServerErrorException(error.message);
    return data as unknown as EventPoll;
  }

  async list(eventId: string, userId: string | null): Promise<EventPollResult[]> {
    const { data, error } = await this.pollsDb
      .select(POLL_COLUMNS)
      .eq('event_id', eventId)
      .order('created_at', { ascending: false });
    if (error) throw new InternalServerErrorException(error.message);

    const polls = data as unknown as EventPoll[];
    return Promise.all(polls.map((poll) => this.withResults(poll, userId)));
  }

  async vote(pollId: string, userId: string, optionIndex: number): Promise<EventPollResult> {
    const poll = await this.findById(pollId);
    if (poll.closed_at) throw new ForbiddenException('Ce sondage est clos.');
    if (optionIndex < 0 || optionIndex >= poll.options.length) {
      throw new BadRequestException(`optionIndex must be between 0 and ${poll.options.length - 1}`);
    }

    const { error } = await this.votesDb
      .upsert({ poll_id: pollId, user_id: userId, option_index: optionIndex }, { onConflict: 'poll_id,user_id' });
    if (error) throw new InternalServerErrorException(error.message);

    return this.withResults(poll, userId);
  }

  /** Moderator-only: locks in the result, no further votes accepted. */
  async close(pollId: string, userId: string): Promise<EventPollResult> {
    const { data, error } = await this.pollsDb
      .update({ closed_at: new Date().toISOString() })
      .eq('id', pollId)
      .select(POLL_COLUMNS)
      .maybeSingle();
    if (error) throw new InternalServerErrorException(error.message);
    if (!data) throw new NotFoundException(`Poll ${pollId} not found`);
    return this.withResults(data as unknown as EventPoll, userId);
  }

  async findById(pollId: string): Promise<EventPoll> {
    const { data, error } = await this.pollsDb.select(POLL_COLUMNS).eq('id', pollId).maybeSingle();
    if (error) throw new InternalServerErrorException(error.message);
    if (!data) throw new NotFoundException(`Poll ${pollId} not found`);
    return data as unknown as EventPoll;
  }

  private async withResults(poll: EventPoll, userId: string | null): Promise<EventPollResult> {
    const { data, error } = await this.votesDb.select('option_index, user_id').eq('poll_id', poll.id);
    if (error) throw new InternalServerErrorException(error.message);

    const votes = data as unknown as VoteRow[];
    const voteCounts = new Array(poll.options.length).fill(0);
    let myVote: number | null = null;
    for (const vote of votes) {
      if (vote.option_index >= 0 && vote.option_index < voteCounts.length) voteCounts[vote.option_index] += 1;
      if (userId && vote.user_id === userId) myVote = vote.option_index;
    }

    return { ...poll, vote_counts: voteCounts, total_votes: votes.length, my_vote: myVote };
  }
}
