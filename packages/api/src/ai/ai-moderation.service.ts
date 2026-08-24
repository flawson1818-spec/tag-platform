import { Injectable, Logger } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { SupabaseService } from '../supabase/supabase.service';

const MODEL = 'claude-opus-5';
const MAX_TOKENS = 300;

const SYSTEM_PROMPT = `Tu es l'IA Modératrice de TAG, une plateforme chrétienne mondiale de prière et d'évangélisation. Tu assistes des modérateurs humains, tu ne décides jamais seule d'une exclusion ou d'une suppression définitive.
Analyse le texte fourni (chat, demande de prière ou témoignage) et détecte : langage injurieux ou haineux, harcèlement, contenu sexuel explicite, spam publicitaire, incitation à la violence, et tout contenu manifestement illégal ou dangereux (menaces graves, exploitation, doxxing).
Un témoignage de souffrance personnelle (maladie, deuil, épreuve, détresse) n'est PAS à signaler — ce contenu est légitime sur cette plateforme.
Réponds uniquement avec un objet JSON strict, sans texte autour : {"flagged": boolean, "confidence": number entre 0 et 1, "reason": string courte en français ou null, "critical": boolean}.
"critical" doit être true seulement si le contenu est manifestement illégal ou dangereux et justifie une mise en quarantaine immédiate sans attendre la revue d'un modérateur.`;

export interface ModerationResult {
  flagged: boolean;
  confidence: number;
  reason: string | null;
  critical: boolean;
}

const SAFE_DEFAULT: ModerationResult = { flagged: false, confidence: 0, reason: null, critical: false };

function extractJsonObject(text: string): string {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) return text;
  return text.slice(start, end + 1);
}

/**
 * Content-level pre-filtering per docs/02_AI_AGENTS_SPECIFICATION.md section 5 (IA Modératrice).
 * Fails open by design: any missing key, API error, or malformed response yields the unflagged
 * default rather than blocking the caller's write — the AI assists moderators, it never gates
 * core functionality (chat, prayer requests, testimonies) on its own availability.
 */
@Injectable()
export class AiModerationService {
  private readonly logger = new Logger(AiModerationService.name);
  private client: Anthropic | null = null;

  constructor(private readonly supabase: SupabaseService) {}

  private getClient(): Anthropic | null {
    if (!process.env.ANTHROPIC_API_KEY) return null;
    if (!this.client) this.client = new Anthropic();
    return this.client;
  }

  async moderate(text: string, userId: string | null = null): Promise<ModerationResult> {
    const trimmed = text?.trim();
    if (!trimmed) return SAFE_DEFAULT;

    const client = this.getClient();
    if (!client) return SAFE_DEFAULT;

    let response: Anthropic.Message;
    try {
      response = await client.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: trimmed.slice(0, 4000) }],
      });
    } catch (error) {
      this.logger.error('Moderation call failed', error as Error);
      return SAFE_DEFAULT;
    }

    if (response.stop_reason === 'refusal') return SAFE_DEFAULT;

    const textBlock = response.content.find((block): block is Anthropic.TextBlock => block.type === 'text');
    if (!textBlock) return SAFE_DEFAULT;

    let result: ModerationResult;
    try {
      const parsed = JSON.parse(extractJsonObject(textBlock.text));
      result = {
        flagged: Boolean(parsed.flagged),
        confidence: typeof parsed.confidence === 'number' ? Math.max(0, Math.min(1, parsed.confidence)) : 0,
        reason: typeof parsed.reason === 'string' ? parsed.reason.slice(0, 300) : null,
        critical: Boolean(parsed.critical),
      };
    } catch (error) {
      this.logger.error('Moderation response was not valid JSON', error as Error);
      return SAFE_DEFAULT;
    }

    if (result.flagged) {
      const { error } = await this.supabase.client.from('ai_interaction_logs').insert({
        user_id: userId,
        agent: 'MODERATION',
        input_summary: trimmed.slice(0, 500),
        output_summary: result.reason ?? '(signalé sans motif)',
        escalated_to_human: result.critical,
      });
      if (error) this.logger.error(`Failed to log moderation flag: ${error.message}`);
    }

    return result;
  }
}
