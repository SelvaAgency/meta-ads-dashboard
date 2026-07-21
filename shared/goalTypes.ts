/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Tipo de conta — a tradução do objetivo da Meta para os 11 tipos do Spaces
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  Vivia em `client/src/lib/kpiConfig.ts`, que importa React e lucide e por
 *  isso não pode ser usado no servidor. Como o motor de alertas passou a
 *  precisar do tipo (F3), a alternativa seria duplicar o mapa — e mapa
 *  duplicado diverge: um dia alguém acrescenta um objetivo novo de um lado só,
 *  e a tela passa a dizer "Mensagens" enquanto o alerta cobra ROAS.
 *
 *  `kpiConfig.ts` reexporta daqui, então nada que já importava precisou mudar.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type GoalType =
  | "SALES" | "VALUE" | "LEADS" | "MESSAGES" | "ENGAGEMENT" | "FOLLOWERS"
  | "AWARENESS" | "TRAFFIC" | "VIDEO" | "APP" | "DEFAULT";

export const GOAL_TYPES: GoalType[] = [
  "SALES", "VALUE", "LEADS", "MESSAGES", "ENGAGEMENT", "FOLLOWERS",
  "AWARENESS", "TRAFFIC", "VIDEO", "APP", "DEFAULT",
];

/** optimization_goal da Meta → tipo do Spaces. */
const MAPA: Record<string, GoalType> = {
  OFFSITE_CONVERSIONS: "SALES",
  ONSITE_CONVERSIONS: "SALES",
  VALUE: "VALUE",
  LEAD_GENERATION: "LEADS",
  QUALITY_LEAD: "LEADS",
  REPLIES: "MESSAGES",
  CONVERSATIONS: "MESSAGES",
  LINK_CLICKS: "TRAFFIC",
  LANDING_PAGE_VIEWS: "TRAFFIC",
  REACH: "AWARENESS",
  IMPRESSIONS: "AWARENESS",
  POST_ENGAGEMENT: "ENGAGEMENT",
  PAGE_LIKES: "FOLLOWERS",
  VIDEO_VIEWS: "VIDEO",
  THRUPLAY: "VIDEO",
  APP_INSTALLS: "APP",
  VISIT_INSTAGRAM_PROFILE: "TRAFFIC",
  INSTAGRAM_PROFILE_REACH: "AWARENESS",
};

/**
 * Aceita tanto o objetivo da Meta ("CONVERSATIONS") quanto o tipo já traduzido
 * ("MESSAGES") — porque `goalTypeOverride` guarda o segundo formato, e os dois
 * chegam aqui pelo mesmo caminho.
 */
export function mapGoalToType(dominantGoal: string | undefined | null): GoalType {
  if (!dominantGoal) return "DEFAULT";
  if ((GOAL_TYPES as string[]).includes(dominantGoal)) return dominantGoal as GoalType;
  return MAPA[dominantGoal] ?? "DEFAULT";
}
