/**
 * Campaign Performance Goals Module
 *
 * Maps Meta Ads optimization_goal (meta de desempenho dos adsets) to relevant KPIs.
 * This is the correct source of truth for "what result does this campaign optimize for".
 *
 * KEY DISTINCTION:
 * - campaign.objective (ex: OUTCOME_ENGAGEMENT) = broad marketing goal, set at campaign level
 * - adset.optimization_goal (ex: OFFSITE_CONVERSIONS) = actual performance target, set at adset level
 *
 * The dashboard MUST use optimization_goal, not objective, to determine which KPIs to show.
 * A campaign with objective=OUTCOME_ENGAGEMENT can have optimization_goal=OFFSITE_CONVERSIONS
 * (e.g., optimizing for purchases even though the campaign "objective" is engagement).
 *
 * Meta API optimization_goal values (v19+):
 * https://developers.facebook.com/docs/marketing-api/reference/ad-set/#fields
 */

export type OptimizationGoal =
  | "OFFSITE_CONVERSIONS"     // Compras no site / conversões
  | "ONSITE_CONVERSIONS"      // Conversões no site (Meta Shop)
  | "VALUE"                   // Valor de conversão (ROAS otimizado)
  | "LEAD_GENERATION"         // Leads (formulário Meta)
  | "QUALITY_LEAD"            // Leads qualificados
  | "REPLIES"                 // Mensagens / respostas
  | "CONVERSATIONS"           // Conversas iniciadas
  | "LINK_CLICKS"             // Cliques no link
  | "LANDING_PAGE_VIEWS"      // Visualizações de página de destino
  | "REACH"                   // Alcance único
  | "IMPRESSIONS"             // Impressões
  | "POST_ENGAGEMENT"         // Engajamento com publicação
  | "PAGE_LIKES"              // Curtidas na página
  | "VIDEO_VIEWS"             // Visualizações de vídeo (2s+)
  | "THRUPLAY"                // ThruPlay (vídeo assistido até o fim)
  | "APP_INSTALLS"            // Instalações de app
  | "VISIT_INSTAGRAM_PROFILE" // Visitas ao perfil do Instagram
  | "INSTAGRAM_PROFILE_REACH" // Alcance no perfil do Instagram
  | string;                   // fallback

export type MetricKey =
  | "spend"
  | "roas"
  | "cpa"
  | "ctr"
  | "cpc"
  | "cpm"
  | "impressions"
  | "reach"
  | "frequency"
  | "clicks"
  | "conversions"
  | "conversionValue"
  | "messages"
  | "leads"
  | "videoViews"
  | "engagement"
  | "pageFollowers"
  | "costPerMessage"
  | "costPerLead"
  | "costPerResult";

export interface MetricConfig {
  key: MetricKey;
  label: string;
  description: string;
  format: "currency" | "number" | "percent" | "multiplier";
  higherIsBetter: boolean;
  primary?: boolean;
}

// Full metric definitions
export const METRIC_DEFINITIONS: Record<MetricKey, MetricConfig> = {
  spend: {
    key: "spend",
    label: "Investimento Total",
    description: "Total gasto no período",
    format: "currency",
    higherIsBetter: false,
    primary: true,
  },
  roas: {
    key: "roas",
    label: "ROAS",
    description: "Retorno sobre investimento em anúncios",
    format: "multiplier",
    higherIsBetter: true,
    primary: true,
  },
  cpa: {
    key: "cpa",
    label: "Custo por Resultado",
    description: "Custo médio por resultado principal",
    format: "currency",
    higherIsBetter: false,
    primary: true,
  },
  ctr: {
    key: "ctr",
    label: "CTR",
    description: "Taxa de cliques",
    format: "percent",
    higherIsBetter: true,
    primary: false,
  },
  cpc: {
    key: "cpc",
    label: "CPC",
    description: "Custo por clique",
    format: "currency",
    higherIsBetter: false,
    primary: false,
  },
  cpm: {
    key: "cpm",
    label: "CPM",
    description: "Custo por mil impressões",
    format: "currency",
    higherIsBetter: false,
    primary: false,
  },
  impressions: {
    key: "impressions",
    label: "Impressões",
    description: "Total de impressões",
    format: "number",
    higherIsBetter: true,
    primary: false,
  },
  reach: {
    key: "reach",
    label: "Alcance",
    description: "Pessoas únicas alcançadas",
    format: "number",
    higherIsBetter: true,
    primary: true,
  },
  frequency: {
    key: "frequency",
    label: "Frequência",
    description: "Média de vezes que cada pessoa viu o anúncio",
    format: "number",
    higherIsBetter: false,
    primary: false,
  },
  clicks: {
    key: "clicks",
    label: "Cliques",
    description: "Total de cliques",
    format: "number",
    higherIsBetter: true,
    primary: false,
  },
  conversions: {
    key: "conversions",
    label: "Resultados",
    description: "Total de resultados principais da campanha",
    format: "number",
    higherIsBetter: true,
    primary: true,
  },
  conversionValue: {
    key: "conversionValue",
    label: "Valor de Conversão",
    description: "Valor total gerado pelas conversões",
    format: "currency",
    higherIsBetter: true,
    primary: true,
  },
  messages: {
    key: "messages",
    label: "Mensagens Iniciadas",
    description: "Conversas iniciadas via anúncio",
    format: "number",
    higherIsBetter: true,
    primary: true,
  },
  leads: {
    key: "leads",
    label: "Leads Gerados",
    description: "Total de leads capturados",
    format: "number",
    higherIsBetter: true,
    primary: true,
  },
  videoViews: {
    key: "videoViews",
    label: "Visualizações de Vídeo",
    description: "Total de visualizações de vídeo",
    format: "number",
    higherIsBetter: true,
    primary: true,
  },
  engagement: {
    key: "engagement",
    label: "Engajamentos",
    description: "Curtidas, comentários, compartilhamentos",
    format: "number",
    higherIsBetter: true,
    primary: true,
  },
  pageFollowers: {
    key: "pageFollowers",
    label: "Novos Seguidores",
    description: "Seguidores conquistados via anúncio",
    format: "number",
    higherIsBetter: true,
    primary: true,
  },
  costPerMessage: {
    key: "costPerMessage",
    label: "Custo por Mensagem",
    description: "Custo médio por conversa iniciada",
    format: "currency",
    higherIsBetter: false,
    primary: true,
  },
  costPerLead: {
    key: "costPerLead",
    label: "Custo por Lead",
    description: "Custo médio por lead gerado",
    format: "currency",
    higherIsBetter: false,
    primary: true,
  },
  costPerResult: {
    key: "costPerResult",
    label: "Custo por Resultado",
    description: "Custo médio por resultado principal",
    format: "currency",
    higherIsBetter: false,
    primary: true,
  },
};

export interface PerformanceGoalProfile {
  label: string;       // human-readable label for the goal
  emoji: string;
  resultLabel: string; // what "results" means for this goal (shown in table header)
  primaryMetrics: MetricKey[];   // KPI cards to show in dashboard
  tableColumns: MetricKey[];     // columns in campaigns table
  insightMetrics: MetricKey[];   // metrics used in AI analysis
  actionTypes: string[];         // Meta API action_type values that represent "results"
}

/**
 * optimization_goal → KPI profile mapping.
 *
 * This is the CORRECT way to determine dashboard metrics.
 * Each entry maps the adset's optimization_goal to the relevant KPIs.
 */
export const PERFORMANCE_GOAL_PROFILES: Record<string, PerformanceGoalProfile> = {
  // ── Conversions / Sales ──────────────────────────────────────────────────────
  OFFSITE_CONVERSIONS: {
    label: "Compras no site",
    emoji: "🛒",
    resultLabel: "Compras no site",
    primaryMetrics: ["spend", "roas", "cpa", "conversions", "conversionValue", "reach", "impressions", "ctr"],
    tableColumns: ["spend", "roas", "cpa", "conversions", "conversionValue", "ctr", "reach", "impressions"],
    insightMetrics: ["roas", "cpa", "conversions", "conversionValue", "spend", "ctr"],
    actionTypes: ["purchase", "offsite_conversion.fb_pixel_purchase", "onsite_web_purchase"],
  },
  ONSITE_CONVERSIONS: {
    label: "Conversões no site",
    emoji: "🛒",
    resultLabel: "Conversões no site",
    primaryMetrics: ["spend", "roas", "cpa", "conversions", "conversionValue", "reach", "impressions", "ctr"],
    tableColumns: ["spend", "roas", "cpa", "conversions", "conversionValue", "ctr", "reach", "impressions"],
    insightMetrics: ["roas", "cpa", "conversions", "conversionValue", "spend", "ctr"],
    actionTypes: ["purchase", "onsite_web_purchase", "offsite_conversion.fb_pixel_purchase"],
  },
  VALUE: {
    label: "Valor de conversão (ROAS)",
    emoji: "💰",
    resultLabel: "Compras no site",
    primaryMetrics: ["spend", "roas", "conversionValue", "cpa", "conversions", "reach", "impressions", "ctr"],
    tableColumns: ["spend", "roas", "conversionValue", "cpa", "conversions", "ctr", "reach", "impressions"],
    insightMetrics: ["roas", "conversionValue", "cpa", "conversions", "spend", "ctr"],
    actionTypes: ["purchase", "offsite_conversion.fb_pixel_purchase", "onsite_web_purchase"],
  },

  // ── Leads ────────────────────────────────────────────────────────────────────
  LEAD_GENERATION: {
    label: "Geração de leads",
    emoji: "📋",
    resultLabel: "Leads",
    primaryMetrics: ["spend", "leads", "costPerLead", "ctr", "reach", "impressions", "cpc", "cpm"],
    tableColumns: ["spend", "leads", "costPerLead", "ctr", "cpc", "reach", "impressions"],
    insightMetrics: ["leads", "costPerLead", "ctr", "cpc", "spend", "reach"],
    actionTypes: ["lead", "offsite_conversion.fb_pixel_lead", "onsite_conversion.lead_grouped"],
  },
  QUALITY_LEAD: {
    label: "Leads qualificados",
    emoji: "📋",
    resultLabel: "Leads qualificados",
    primaryMetrics: ["spend", "leads", "costPerLead", "ctr", "reach", "impressions", "cpc", "cpm"],
    tableColumns: ["spend", "leads", "costPerLead", "ctr", "cpc", "reach", "impressions"],
    insightMetrics: ["leads", "costPerLead", "ctr", "cpc", "spend", "reach"],
    actionTypes: ["lead", "offsite_conversion.fb_pixel_lead", "onsite_conversion.lead_grouped"],
  },

  // ── Messages ─────────────────────────────────────────────────────────────────
  REPLIES: {
    label: "Mensagens",
    emoji: "💬",
    resultLabel: "Mensagens iniciadas",
    primaryMetrics: ["spend", "messages", "costPerMessage", "reach", "impressions", "ctr", "cpm", "frequency"],
    tableColumns: ["spend", "messages", "costPerMessage", "ctr", "cpm", "reach", "impressions"],
    insightMetrics: ["messages", "costPerMessage", "ctr", "cpm", "spend", "reach"],
    actionTypes: [
      "onsite_conversion.messaging_conversation_started_7d",
      "onsite_conversion.messaging_first_reply",
    ],
  },
  CONVERSATIONS: {
    label: "Conversas",
    emoji: "💬",
    resultLabel: "Conversas iniciadas",
    primaryMetrics: ["spend", "messages", "costPerMessage", "reach", "impressions", "ctr", "cpm", "frequency"],
    tableColumns: ["spend", "messages", "costPerMessage", "ctr", "cpm", "reach", "impressions"],
    insightMetrics: ["messages", "costPerMessage", "ctr", "cpm", "spend", "reach"],
    actionTypes: [
      "onsite_conversion.messaging_conversation_started_7d",
      "onsite_conversion.messaging_first_reply",
    ],
  },

  // ── Traffic ───────────────────────────────────────────────────────────────────
  LINK_CLICKS: {
    label: "Cliques no link",
    emoji: "🔗",
    resultLabel: "Cliques no link",
    primaryMetrics: ["spend", "clicks", "ctr", "cpc", "reach", "impressions", "cpm", "frequency"],
    tableColumns: ["spend", "clicks", "ctr", "cpc", "reach", "impressions", "cpm"],
    insightMetrics: ["clicks", "ctr", "cpc", "reach", "impressions", "spend"],
    actionTypes: ["link_click", "outbound_click"],
  },
  LANDING_PAGE_VIEWS: {
    label: "Visualizações de página",
    emoji: "🌐",
    resultLabel: "Visualizações de página",
    primaryMetrics: ["spend", "clicks", "ctr", "cpc", "reach", "impressions", "cpm", "frequency"],
    tableColumns: ["spend", "clicks", "ctr", "cpc", "reach", "impressions", "cpm"],
    insightMetrics: ["clicks", "ctr", "cpc", "reach", "impressions", "spend"],
    actionTypes: ["landing_page_view"],
  },

  // ── Awareness / Reach ─────────────────────────────────────────────────────────
  REACH: {
    label: "Alcance",
    emoji: "📣",
    resultLabel: "Pessoas alcançadas",
    primaryMetrics: ["spend", "reach", "impressions", "frequency", "cpm", "ctr", "clicks", "cpc"],
    tableColumns: ["spend", "reach", "impressions", "frequency", "cpm", "ctr", "clicks"],
    insightMetrics: ["reach", "impressions", "frequency", "cpm", "ctr", "spend"],
    actionTypes: [],
  },
  IMPRESSIONS: {
    label: "Impressões",
    emoji: "👁️",
    resultLabel: "Impressões",
    primaryMetrics: ["spend", "impressions", "reach", "frequency", "cpm", "ctr", "clicks", "cpc"],
    tableColumns: ["spend", "impressions", "reach", "frequency", "cpm", "ctr", "clicks"],
    insightMetrics: ["impressions", "reach", "frequency", "cpm", "ctr", "spend"],
    actionTypes: [],
  },

  // ── Engagement ────────────────────────────────────────────────────────────────
  POST_ENGAGEMENT: {
    label: "Engajamento",
    emoji: "❤️",
    resultLabel: "Engajamentos",
    primaryMetrics: ["spend", "engagement", "costPerResult", "reach", "impressions", "frequency", "cpm", "ctr"],
    tableColumns: ["spend", "engagement", "costPerResult", "reach", "impressions", "frequency", "cpm"],
    insightMetrics: ["engagement", "costPerResult", "reach", "impressions", "frequency", "spend"],
    actionTypes: ["post_engagement", "page_engagement", "like", "comment", "post"],
  },
  PAGE_LIKES: {
    label: "Curtidas na página",
    emoji: "👥",
    resultLabel: "Novos seguidores",
    primaryMetrics: ["spend", "pageFollowers", "costPerResult", "reach", "impressions", "frequency", "cpm", "ctr"],
    tableColumns: ["spend", "pageFollowers", "costPerResult", "reach", "impressions", "frequency", "cpm"],
    insightMetrics: ["pageFollowers", "costPerResult", "reach", "impressions", "frequency", "spend"],
    actionTypes: ["like", "page_engagement"],
  },

  // ── Video ─────────────────────────────────────────────────────────────────────
  VIDEO_VIEWS: {
    label: "Visualizações de vídeo",
    emoji: "▶️",
    resultLabel: "Visualizações de vídeo",
    primaryMetrics: ["spend", "videoViews", "costPerResult", "reach", "impressions", "frequency", "cpm", "ctr"],
    tableColumns: ["spend", "videoViews", "costPerResult", "reach", "impressions", "frequency", "cpm"],
    insightMetrics: ["videoViews", "costPerResult", "reach", "impressions", "frequency", "spend"],
    actionTypes: ["video_view"],
  },
  THRUPLAY: {
    label: "ThruPlay",
    emoji: "▶️",
    resultLabel: "ThruPlay",
    primaryMetrics: ["spend", "videoViews", "costPerResult", "reach", "impressions", "frequency", "cpm", "ctr"],
    tableColumns: ["spend", "videoViews", "costPerResult", "reach", "impressions", "frequency", "cpm"],
    insightMetrics: ["videoViews", "costPerResult", "reach", "impressions", "frequency", "spend"],
    actionTypes: ["video_thruplay_watched"],
  },

  // ── App ───────────────────────────────────────────────────────────────────────
  APP_INSTALLS: {
    label: "Instalações de app",
    emoji: "📱",
    resultLabel: "Instalações",
    primaryMetrics: ["spend", "conversions", "cpa", "ctr", "reach", "impressions", "cpc", "cpm"],
    tableColumns: ["spend", "conversions", "cpa", "ctr", "cpc", "reach", "impressions"],
    insightMetrics: ["conversions", "cpa", "ctr", "cpc", "spend", "reach"],
    actionTypes: ["app_install", "mobile_app_install"],
  },

  // ── Instagram Profile ─────────────────────────────────────────────────────────
  VISIT_INSTAGRAM_PROFILE: {
    label: "Visitas ao perfil",
    emoji: "📸",
    resultLabel: "Visitas ao perfil",
    primaryMetrics: ["spend", "conversions", "costPerResult", "reach", "impressions", "frequency", "cpm", "ctr"],
    tableColumns: ["spend", "conversions", "costPerResult", "reach", "impressions", "frequency", "cpm"],
    insightMetrics: ["conversions", "costPerResult", "reach", "impressions", "frequency", "spend"],
    actionTypes: ["instagram_profile_visit"],
  },
  INSTAGRAM_PROFILE_REACH: {
    label: "Alcance no Instagram",
    emoji: "📸",
    resultLabel: "Alcance no Instagram",
    primaryMetrics: ["spend", "reach", "impressions", "frequency", "cpm", "ctr", "clicks", "cpc"],
    tableColumns: ["spend", "reach", "impressions", "frequency", "cpm", "ctr", "clicks"],
    insightMetrics: ["reach", "impressions", "frequency", "cpm", "ctr", "spend"],
    actionTypes: [],
  },
};

// Default profile when optimization_goal is unknown
export const DEFAULT_PERFORMANCE_PROFILE: PerformanceGoalProfile = {
  label: "Campanha",
  emoji: "📊",
  resultLabel: "Resultados",
  primaryMetrics: ["spend", "conversions", "cpa", "reach", "impressions", "clicks", "ctr", "cpm"],
  tableColumns: ["spend", "conversions", "cpa", "reach", "impressions", "clicks", "ctr", "cpm"],
  insightMetrics: ["spend", "conversions", "cpa", "reach", "impressions", "clicks", "ctr"],
  actionTypes: [],
};

/**
 * Get the performance goal profile for a given optimization_goal.
 * This is the CORRECT function to use for determining dashboard KPIs.
 */
export function getPerformanceGoalProfile(optimizationGoal: string): PerformanceGoalProfile {
  return PERFORMANCE_GOAL_PROFILES[optimizationGoal] ?? DEFAULT_PERFORMANCE_PROFILE;
}

/**
 * Detect the dominant optimization_goal from a list of adset optimization goals.
 * Priority order: revenue-generating goals first, then engagement, then awareness.
 */
export function detectDominantGoal(optimizationGoals: string[]): string {
  if (!optimizationGoals || optimizationGoals.length === 0) return "DEFAULT";

  const priority = [
    "VALUE",                    // ROAS-optimized purchases (highest value)
    "OFFSITE_CONVERSIONS",      // purchases
    "ONSITE_CONVERSIONS",       // on-site purchases
    "LEAD_GENERATION",          // leads
    "QUALITY_LEAD",             // quality leads
    "REPLIES",                  // messages
    "CONVERSATIONS",            // conversations
    "APP_INSTALLS",             // app installs
    "LANDING_PAGE_VIEWS",       // landing page views
    "LINK_CLICKS",              // link clicks
    "POST_ENGAGEMENT",          // engagement
    "PAGE_LIKES",               // page likes
    "VIDEO_VIEWS",              // video views
    "THRUPLAY",                 // thruplay
    "VISIT_INSTAGRAM_PROFILE",  // instagram profile visits
    "REACH",                    // reach
    "IMPRESSIONS",              // impressions
    "INSTAGRAM_PROFILE_REACH",  // instagram reach
  ];

  for (const p of priority) {
    if (optimizationGoals.includes(p)) return p;
  }

  // Return most frequent
  const counts = optimizationGoals.reduce((acc, g) => {
    acc[g] = (acc[g] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "DEFAULT";
}

// ── Legacy compatibility ──────────────────────────────────────────────────────
// Keep these for backward compatibility with existing code that uses objective-based profiles

/** @deprecated Use getPerformanceGoalProfile with optimization_goal instead */
export function getObjectiveProfile(objective: string): PerformanceGoalProfile {
  // Map campaign objectives to the closest optimization_goal profile
  const objectiveToGoalMap: Record<string, string> = {
    OUTCOME_SALES: "OFFSITE_CONVERSIONS",
    CONVERSIONS: "OFFSITE_CONVERSIONS",
    OUTCOME_LEADS: "LEAD_GENERATION",
    LEAD_GENERATION: "LEAD_GENERATION",
    MESSAGES: "REPLIES",
    OUTCOME_ENGAGEMENT: "POST_ENGAGEMENT",
    POST_ENGAGEMENT: "POST_ENGAGEMENT",
    PAGE_LIKES: "PAGE_LIKES",
    OUTCOME_AWARENESS: "REACH",
    REACH: "REACH",
    BRAND_AWARENESS: "REACH",
    OUTCOME_TRAFFIC: "LINK_CLICKS",
    LINK_CLICKS: "LINK_CLICKS",
    VIDEO_VIEWS: "VIDEO_VIEWS",
    OUTCOME_APP_PROMOTION: "APP_INSTALLS",
  };
  const mappedGoal = objectiveToGoalMap[objective] ?? objective;
  return getPerformanceGoalProfile(mappedGoal);
}

/** @deprecated Use detectDominantGoal with optimization_goals instead */
export function detectDominantObjective(objectives: string[]): string {
  // Map objectives to goals and use the new function
  const objectiveToGoalMap: Record<string, string> = {
    OUTCOME_SALES: "OFFSITE_CONVERSIONS",
    CONVERSIONS: "OFFSITE_CONVERSIONS",
    OUTCOME_LEADS: "LEAD_GENERATION",
    LEAD_GENERATION: "LEAD_GENERATION",
    MESSAGES: "REPLIES",
    OUTCOME_ENGAGEMENT: "POST_ENGAGEMENT",
    POST_ENGAGEMENT: "POST_ENGAGEMENT",
    PAGE_LIKES: "PAGE_LIKES",
    OUTCOME_AWARENESS: "REACH",
    REACH: "REACH",
    BRAND_AWARENESS: "REACH",
    OUTCOME_TRAFFIC: "LINK_CLICKS",
    LINK_CLICKS: "LINK_CLICKS",
    VIDEO_VIEWS: "VIDEO_VIEWS",
    OUTCOME_APP_PROMOTION: "APP_INSTALLS",
  };
  const goals = objectives.map((o) => objectiveToGoalMap[o] ?? o);
  return detectDominantGoal(goals);
}

/**
 * Extract specific action values from Meta API actions array based on action types.
 */
export function extractActionsByObjective(
  actions: Array<{ action_type: string; value: string }> | undefined,
  actionTypes: string[]
): number {
  if (!actions || actionTypes.length === 0) return 0;
  let total = 0;
  for (const action of actions) {
    if (actionTypes.some((t) => action.action_type === t || action.action_type.includes(t))) {
      total += parseFloat(action.value) || 0;
    }
  }
  return total;
}
