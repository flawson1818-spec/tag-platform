import { Injectable, InternalServerErrorException, Logger, ServiceUnavailableException } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { SupabaseService } from '../supabase/supabase.service';
import { SocialChannel } from '../communication/social-publication.entity';
import { AiChatDto } from './dto/ai-chat.dto';
import { AiAgentName } from './ai-interaction-log.entity';

const MODEL = 'claude-opus-5';
const MAX_TOKENS = 1024;

const ACCUEIL_SYSTEM = `Tu es l'IA Accueil de TAG (Total Adoration & Global Intercession), une plateforme mondiale de prière chrétienne active 24h/24.
Ton rôle : accueillir chaleureusement les nouveaux visiteurs, expliquer le fonctionnement de la plateforme (comment rejoindre la salle de prière mondiale, comment soumettre une demande de prière, comment publier un témoignage), et répondre aux questions d'usage.
Si la question est de nature spirituelle ou évangélique plutôt qu'opérationnelle (questions sur la foi, la Bible, le salut), oriente clairement la personne vers l'IA Évangélisation.
Tu ne gères aucune donnée sensible (paiement, signalement de modération) et tu n'as aucune autorité de modération.
Si une question sort clairement de ce périmètre, dis-le honnêtement et invite la personne à contacter un responsable humain plutôt que d'inventer une réponse.
Réponds en français, de façon brève et chaleureuse (quelques phrases maximum).`;

const EVANGELISATION_SYSTEM = `Tu es l'IA Évangélisation de TAG, une plateforme mondiale de prière chrétienne.
Ton rôle : dialoguer avec respect et douceur sur des questions de foi, répondre aux questions bibliques, présenter l'Évangile de façon claire, et inviter la personne à rejoindre une communauté ou une salle de prière si c'est pertinent.
Reste sur une perspective chrétienne largement partagée entre traditions ; évite de trancher des débats doctrinaux propres à une dénomination particulière (mode de baptême, gouvernance ecclésiale, etc.) — indique que ces questions varient selon les Églises.
Ne prétends jamais parler au nom d'une Église ou d'un responsable en particulier.
Réponds en français, avec chaleur et simplicité, en citant si possible une référence biblique pertinente.`;

const CRISIS_KEYWORDS = [
  'suicide',
  'me suicider',
  'me tuer',
  'en finir avec ma vie',
  'plus envie de vivre',
  'me faire du mal',
  'automutilation',
  'violence conjugale',
  'je suis en danger',
  'il me frappe',
  'elle me frappe',
  'abus sexuel',
];

const COMMUNICATION_SYSTEM = `Tu es l'IA Communication de TAG (Total Adoration & Global Intercession), une plateforme mondiale de prière chrétienne.
Ton rôle : à partir d'un témoignage validé par un modérateur, rédiger un brouillon de publication prêt à relire pour le réseau social demandé.
Reste fidèle aux faits du témoignage, sans l'exagérer ni inventer de détails. Ton chaleureux, plein d'espoir, à la gloire de Dieu, jamais moralisateur ni culpabilisant.
Réponds uniquement avec le texte du post, prêt à publier après relecture humaine — sans commentaire, sans guillemets autour, sans préambule du type "Voici le post".`;

const CHANNEL_GUIDANCE: Record<SocialChannel, string> = {
  Facebook: 'Format : 2 à 4 phrases chaleureuses, ton communautaire, peut inclure 1 à 2 émojis, se termine par une invitation à rejoindre la salle de prière TAG.',
  Instagram: "Format : légende courte et percutante (3 phrases maximum), termine par 3 à 5 hashtags pertinents (ex. #prière #foi #témoignage).",
  TikTok: 'Format : accroche courte pour une légende de vidéo (1 à 2 phrases), ton dynamique, 3 à 5 hashtags à la fin.',
  YouTube: 'Format : description de vidéo de 3 à 5 phrases qui résume le témoignage et invite à rejoindre la communauté, sans hashtags.',
  X: 'Format : un seul post de 280 caractères maximum, direct et percutant, 1 à 2 hashtags maximum.',
  LinkedIn: 'Format : 3 à 5 phrases avec un ton plus posé et institutionnel, met en valeur l\'impact communautaire de TAG.',
  Threads: 'Format : 2 à 3 phrases courtes et conversationnelles, ton proche et sincère.',
};

const INTERCESSION_SYSTEM = `Tu es l'IA Intercession de TAG, une plateforme mondiale de prière chrétienne active 24h/24.
Ton rôle : à partir d'une demande de prière (catégorie + description), rédiger un texte guidé court destiné à être lu par un intercesseur pendant un créneau de prière collectif.
Formule une prière d'intercession respectueuse, centrée sur l'espérance biblique, sans jamais promettre un résultat précis (guérison garantie, etc.). Reste sobre et digne face à la souffrance décrite.
Réponds uniquement avec le texte guidé (3 à 6 phrases), prêt à être lu à voix haute — sans commentaire, sans titre, sans guillemets autour.`;

const CRISIS_RESPONSE =
  "Ce que tu traverses est grave et mérite une attention humaine immédiate, pas seulement une réponse automatisée. " +
  'Si tu es en danger immédiat, contacte les services d\'urgence de ton pays maintenant. ' +
  'Parle aussi le plus vite possible à quelqu\'un de confiance autour de toi — un proche, un responsable de ta communauté, ou une ligne d\'écoute locale. ' +
  'Cette conversation a été signalée pour un suivi humain de notre côté.';

export interface AiChatResult {
  reply: string;
  escalated: boolean;
}

@Injectable()
export class AiAgentsService {
  private readonly logger = new Logger(AiAgentsService.name);
  private client: Anthropic | null = null;

  constructor(private readonly supabase: SupabaseService) {}

  private getClient(): Anthropic {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new ServiceUnavailableException(
        "L'assistant IA n'est pas configuré sur ce déploiement (ANTHROPIC_API_KEY absente).",
      );
    }
    if (!this.client) {
      this.client = new Anthropic();
    }
    return this.client;
  }

  async chatAccueil(dto: AiChatDto, userId: string | null): Promise<AiChatResult> {
    return this.chat('ACCUEIL', ACCUEIL_SYSTEM, dto, userId);
  }

  async chatEvangelisation(dto: AiChatDto, userId: string | null): Promise<AiChatResult> {
    if (CRISIS_KEYWORDS.some((keyword) => dto.message.toLowerCase().includes(keyword))) {
      await this.logInteraction('EVANGELISATION', dto.message, CRISIS_RESPONSE, userId, true);
      return { reply: CRISIS_RESPONSE, escalated: true };
    }
    return this.chat('EVANGELISATION', EVANGELISATION_SYSTEM, dto, userId);
  }

  /**
   * See docs/02_AI_AGENTS_SPECIFICATION.md section 6 — draft only, callers must keep treating the
   * result as a DRAFT requiring human approval before publishing (never auto-publish here).
   */
  async draftSocialPost(channel: SocialChannel, testimonyContent: string): Promise<string> {
    const client = this.getClient();
    const prompt = `${CHANNEL_GUIDANCE[channel]}\n\nTémoignage :\n${testimonyContent}`;

    let response: Anthropic.Message;
    try {
      response = await client.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: COMMUNICATION_SYSTEM,
        messages: [{ role: 'user', content: prompt }],
      });
    } catch (error) {
      this.logger.error(`IA Communication draft failed for channel ${channel}`, error as Error);
      throw new InternalServerErrorException('Draft generation failed');
    }

    const textBlock = response.content.find((block): block is Anthropic.TextBlock => block.type === 'text');
    if (response.stop_reason === 'refusal' || !textBlock) {
      throw new InternalServerErrorException('Draft generation failed');
    }

    await this.logInteraction('COMMUNICATION', `[${channel}] ${testimonyContent}`, textBlock.text, null, false);
    return textBlock.text;
  }

  /** See docs/02_AI_AGENTS_SPECIFICATION.md section 3 — IA Intercession guided text, always marked for review by callers until a moderator approves it. */
  async draftGuidedPrayer(category: string, description: string): Promise<string> {
    const client = this.getClient();
    const prompt = `Catégorie : ${category}\nDemande : ${description}`;

    let response: Anthropic.Message;
    try {
      response = await client.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: INTERCESSION_SYSTEM,
        messages: [{ role: 'user', content: prompt }],
      });
    } catch (error) {
      this.logger.error('IA Intercession guided text generation failed', error as Error);
      throw new InternalServerErrorException('Guided text generation failed');
    }

    const textBlock = response.content.find((block): block is Anthropic.TextBlock => block.type === 'text');
    if (response.stop_reason === 'refusal' || !textBlock) {
      throw new InternalServerErrorException('Guided text generation failed');
    }

    await this.logInteraction('INTERCESSION', prompt, textBlock.text, null, false);
    return textBlock.text;
  }

  private async chat(agent: AiAgentName, system: string, dto: AiChatDto, userId: string | null): Promise<AiChatResult> {
    const client = this.getClient();

    const messages: Anthropic.MessageParam[] = [
      ...(dto.history ?? []).map((turn) => ({ role: turn.role, content: turn.content }) satisfies Anthropic.MessageParam),
      { role: 'user', content: dto.message },
    ];

    let response: Anthropic.Message;
    try {
      response = await client.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system,
        messages,
      });
    } catch (error) {
      this.logger.error(`AI agent ${agent} call failed`, error as Error);
      throw new InternalServerErrorException("L'assistant IA n'a pas pu répondre, réessaie dans un instant.");
    }

    if (response.stop_reason === 'refusal') {
      const reply = "Je ne peux pas répondre à cette question. N'hésite pas à la reformuler ou à contacter un responsable.";
      await this.logInteraction(agent, dto.message, reply, userId, false);
      return { reply, escalated: false };
    }

    const textBlock = response.content.find((block): block is Anthropic.TextBlock => block.type === 'text');
    const reply = textBlock?.text ?? "Je n'ai pas pu formuler de réponse, réessaie ta question autrement.";

    await this.logInteraction(agent, dto.message, reply, userId, false);
    return { reply, escalated: false };
  }

  private async logInteraction(
    agent: AiAgentName,
    input: string,
    output: string,
    userId: string | null,
    escalated: boolean,
  ): Promise<void> {
    const { error } = await this.supabase.client.from('ai_interaction_logs').insert({
      user_id: userId,
      agent,
      input_summary: input.slice(0, 500),
      output_summary: output.slice(0, 500),
      escalated_to_human: escalated,
    });
    if (error) this.logger.error(`Failed to log AI interaction: ${error.message}`);
  }
}
