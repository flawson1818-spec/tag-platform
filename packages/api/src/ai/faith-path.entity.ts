/**
 * docs/02_AI_AGENTS_SPECIFICATION.md §4: "étapes progressives" toward the section's other stated
 * goal, "inviter à rejoindre une communauté ou une salle de prière" — hence COMMUNAUTE as the
 * final step. Deliberately generic/ecumenical wording (no denomination-specific content), matching
 * the same system prompt's own guardrail against doctrinal specifics. The actual conversational
 * content at each step comes from the live model, guided by this context — never hardcoded here.
 */
export const FAITH_PATH_STEPS = ['DECOUVERTE', 'QUI_EST_JESUS', 'EVANGILE', 'REPONSE_PERSONNELLE', 'COMMUNAUTE'] as const;
export type FaithPathStep = (typeof FAITH_PATH_STEPS)[number];

export const FAITH_PATH_STEP_LABELS: Record<FaithPathStep, string> = {
  DECOUVERTE: 'Découverte de Dieu',
  QUI_EST_JESUS: 'Qui est Jésus ?',
  EVANGILE: "L'Évangile",
  REPONSE_PERSONNELLE: 'Une réponse personnelle',
  COMMUNAUTE: 'Rejoindre une communauté',
};

/** "Niveau de connaissance déclaré" — self-reported, not inferred. */
export const FAITH_PATH_LEVELS = ['NOUVEAU', 'CONNAIT_DEJA'] as const;
export type FaithPathLevel = (typeof FAITH_PATH_LEVELS)[number];

export interface FaithPathProgress {
  current_step: FaithPathStep;
  declared_level: FaithPathLevel | null;
  updated_at: string;
}
