export type AiAgentName = 'ACCUEIL' | 'INTERCESSION' | 'EVANGELISATION' | 'MODERATION' | 'COMMUNICATION' | 'ANALYSE';

export interface AiInteractionLog {
  id: string;
  user_id: string | null;
  agent: AiAgentName;
  input_summary: string;
  output_summary: string;
  rag_sources: string[];
  escalated_to_human: boolean;
  created_at: string;
}
