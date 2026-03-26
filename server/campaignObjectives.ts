/**
 * Campaign Objectives Module
 * Maps Meta Ads campaign objectives to relevant KPIs and metrics.
 * Ensures each account's dashboard shows only metrics that make sense for its campaigns.
 */

// Meta Ads API objective values (v19+)
export type CampaignObjective =
  | "OUTCOME_SALES"
  | "OUTCOME_LEADS"
  | "OUTCOME_ENGAGEMENT"
  | "OUTCOME_AWARENESS"
  | "OUTCOME_TRAFFIC"
  | "OUTCOME_APP_PROMOTION"
  | "MESSAGES"
  | "PAGE_LIKES"
  | "POST_ENGAGEMENT"
  | "VIDEO_VIEWS"
  | "REACH"
  | "BRAND_AWARENESS"
  | "CONVERSIONS"
  | "LEAD_GENERATION"
  | "LINK_CLICKS"
  | "STORE_VISITS"
  | string; // fallback for unknown objectives

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
  primary?: boolean; // show as top KPI card
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
    label: "CPA",
    description: "Custo por aquisição",
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
    label: "Conversões",
    description: "Total de conversões",
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

export interface ObjectiveProfile {
  label: string;
  emoji: string;
  primaryMetrics: MetricKey[];   // shown as KPI cards
  tableColumns: MetricKey[];     // shown in campaigns table
  insightMetrics: MetricKey[];   // used in AI analysis
  actionTypes: string[];         // Meta API action_type values to extract
}

// Objective → metrics mapping
export const OBJECTIVE_PROFILES: Record<string, ObjectiveProfile> = {
  OUTCOME_SALES: {
    label: "Vendas",
    emoji: "🛒",
    primaryMetrics: ["spend", "roas", "cpa", "conversions", "conversionValue", "reach"],
    tableColumns: ["spend", "roas", "cpa", "conversions", "conversionValue", "ctr", "impressions"],
    insightMetrics: ["roas", "cpa", "conversions", "conversionValue", "spend", "ctr"],
    actionTypes: [
      "purchase",
      "offsite_conversion.fb_pixel_purchase",
      "onsite_web_purchase",
    ],
  },
  CONVERSIONS: {
    label: "Conversões",
    emoji: "🎯",
    primaryMetrics: ["spend", "roas", "cpa", "conversions", "conversionValue", "reach"],
    tableColumns: ["spend", "roas", "cpa", "conversions", "conversionValue", "ctr", "impressions"],
    insightMetrics: ["roas", "cpa", "conversions", "conversionValue", "spend", "ctr"],
    actionTypes: [
      "purchase",
      "offsite_conversion.fb_pixel_purchase",
      "complete_registration",
      "offsite_conversion.fb_pixel_complete_registration",
    ],
  },
  OUTCOME_LEADS: {
    label: "Geração de Leads",
    emoji: "📋",
    primaryMetrics: ["spend", "leads", "costPerLead", "reach", "impressions", "ctr"],
    tableColumns: ["spend", "leads", "costPerLead", "ctr", "cpc", "reach", "impressions"],
    insightMetrics: ["leads", "costPerLead", "ctr", "cpc", "spend", "reach"],
    actionTypes: [
      "lead",
      "offsite_conversion.fb_pixel_lead",
      "onsite_conversion.lead_grouped",
    ],
  },
  LEAD_GENERATION: {
    label: "Geração de Leads",
    emoji: "📋",
    primaryMetrics: ["spend", "leads", "costPerLead", "reach", "impressions", "ctr"],
    tableColumns: ["spend", "leads", "costPerLead", "ctr", "cpc", "reach", "impressions"],
    insightMetrics: ["leads", "costPerLead", "ctr", "cpc", "spend", "reach"],
    actionTypes: [
      "lead",
      "offsite_conversion.fb_pixel_lead",
      "onsite_conversion.lead_grouped",
    ],
  },
  MESSAGES: {
    label: "Mensagens",
    emoji: "💬",
    primaryMetrics: ["spend", "messages", "costPerMessage", "reach", "impressions", "ctr"],
    tableColumns: ["spend", "messages", "costPerMessage", "ctr", "cpm", "reach", "impressions"],
    insightMetrics: ["messages", "costPerMessage", "ctr", "cpm", "spend", "reach"],
    actionTypes: [
      "onsite_conversion.messaging_conversation_started_7d",
      "onsite_conversion.messaging_first_reply",
    ],
  },
  OUTCOME_ENGAGEMENT: {
    label: "Engajamento",
    emoji: "❤️",
    primaryMetrics: ["spend", "engagement", "reach", "impressions", "frequency", "cpm"],
    tableColumns: ["spend", "engagement", "reach", "impressions", "frequency", "cpm", "ctr"],
    insightMetrics: ["engagement", "reach", "impressions", "frequency", "cpm", "spend"],
    actionTypes: [
      "post_engagement",
      "page_engagement",
      "like",
      "comment",
      "post",
    ],
  },
  POST_ENGAGEMENT: {
    label: "Engajamento",
    emoji: "❤️",
    primaryMetrics: ["spend", "engagement", "reach", "impressions", "frequency", "cpm"],
    tableColumns: ["spend", "engagement", "reach", "impressions", "frequency", "cpm", "ctr"],
    insightMetrics: ["engagement", "reach", "impressions", "frequency", "cpm", "spend"],
    actionTypes: ["post_engagement", "page_engagement", "like", "comment"],
  },
  PAGE_LIKES: {
    label: "Seguidores",
    emoji: "👥",
    primaryMetrics: ["spend", "pageFollowers", "costPerResult", "reach", "impressions", "cpm"],
    tableColumns: ["spend", "pageFollowers", "costPerResult", "reach", "impressions", "cpm", "frequency"],
    insightMetrics: ["pageFollowers", "costPerResult", "reach", "impressions", "cpm", "spend"],
    actionTypes: ["like", "page_engagement"],
  },
  OUTCOME_AWARENESS: {
    label: "Reconhecimento",
    emoji: "📣",
    primaryMetrics: ["spend", "reach", "impressions", "frequency", "cpm", "ctr"],
    tableColumns: ["spend", "reach", "impressions", "frequency", "cpm", "ctr", "clicks"],
    insightMetrics: ["reach", "impressions", "frequency", "cpm", "ctr", "spend"],
    actionTypes: [],
  },
  REACH: {
    label: "Alcance",
    emoji: "📣",
    primaryMetrics: ["spend", "reach", "impressions", "frequency", "cpm", "ctr"],
    tableColumns: ["spend", "reach", "impressions", "frequency", "cpm", "ctr", "clicks"],
    insightMetrics: ["reach", "impressions", "frequency", "cpm", "ctr", "spend"],
    actionTypes: [],
  },
  BRAND_AWARENESS: {
    label: "Reconhecimento de Marca",
    emoji: "✨",
    primaryMetrics: ["spend", "reach", "impressions", "frequency", "cpm", "ctr"],
    tableColumns: ["spend", "reach", "impressions", "frequency", "cpm", "ctr", "clicks"],
    insightMetrics: ["reach", "impressions", "frequency", "cpm", "ctr", "spend"],
    actionTypes: [],
  },
  OUTCOME_TRAFFIC: {
    label: "Tráfego",
    emoji: "🌐",
    primaryMetrics: ["spend", "clicks", "ctr", "cpc", "reach", "impressions"],
    tableColumns: ["spend", "clicks", "ctr", "cpc", "reach", "impressions", "cpm"],
    insightMetrics: ["clicks", "ctr", "cpc", "reach", "impressions", "spend"],
    actionTypes: ["link_click", "outbound_click"],
  },
  LINK_CLICKS: {
    label: "Cliques no Link",
    emoji: "🔗",
    primaryMetrics: ["spend", "clicks", "ctr", "cpc", "reach", "impressions"],
    tableColumns: ["spend", "clicks", "ctr", "cpc", "reach", "impressions", "cpm"],
    insightMetrics: ["clicks", "ctr", "cpc", "reach", "impressions", "spend"],
    actionTypes: ["link_click", "outbound_click"],
  },
  VIDEO_VIEWS: {
    label: "Visualizações de Vídeo",
    emoji: "▶️",
    primaryMetrics: ["spend", "videoViews", "costPerResult", "reach", "impressions", "frequency"],
    tableColumns: ["spend", "videoViews", "costPerResult", "reach", "impressions", "frequency", "cpm"],
    insightMetrics: ["videoViews", "costPerResult", "reach", "impressions", "frequency", "spend"],
    actionTypes: ["video_view"],
  },
  OUTCOME_APP_PROMOTION: {
    label: "Promoção de App",
    emoji: "📱",
    primaryMetrics: ["spend", "conversions", "cpa", "ctr", "reach", "impressions"],
    tableColumns: ["spend", "conversions", "cpa", "ctr", "cpc", "reach", "impressions"],
    insightMetrics: ["conversions", "cpa", "ctr", "cpc", "spend", "reach"],
    actionTypes: ["app_install", "mobile_app_install"],
  },
};

// Default profile for unknown objectives
export const DEFAULT_PROFILE: ObjectiveProfile = {
  label: "Campanha",
  emoji: "📊",
  primaryMetrics: ["spend", "impressions", "clicks", "reach", "ctr", "cpm"],
  tableColumns: ["spend", "impressions", "clicks", "reach", "ctr", "cpm", "frequency"],
  insightMetrics: ["spend", "impressions", "clicks", "reach", "ctr", "cpm"],
  actionTypes: [],
};

/**
 * Detect the dominant objective from a list of campaign objectives.
 * Returns the most common objective, with OUTCOME_SALES taking priority.
 */
export function detectDominantObjective(objectives: string[]): string {
  if (!objectives || objectives.length === 0) return "DEFAULT";

  // Priority order: sales > leads > messages > engagement > traffic > awareness
  const priority = [
    "OUTCOME_SALES", "CONVERSIONS",
    "OUTCOME_LEADS", "LEAD_GENERATION",
    "MESSAGES",
    "OUTCOME_ENGAGEMENT", "POST_ENGAGEMENT", "PAGE_LIKES",
    "OUTCOME_TRAFFIC", "LINK_CLICKS",
    "VIDEO_VIEWS",
    "OUTCOME_AWARENESS", "REACH", "BRAND_AWARENESS",
    "OUTCOME_APP_PROMOTION",
  ];

  for (const p of priority) {
    if (objectives.includes(p)) return p;
  }

  // Return most frequent
  const counts = objectives.reduce((acc, obj) => {
    acc[obj] = (acc[obj] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "DEFAULT";
}

/**
 * Get the objective profile for a given objective string.
 */
export function getObjectiveProfile(objective: string): ObjectiveProfile {
  return OBJECTIVE_PROFILES[objective] ?? DEFAULT_PROFILE;
}

/**
 * Extract specific action values from Meta API actions array based on objective.
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
