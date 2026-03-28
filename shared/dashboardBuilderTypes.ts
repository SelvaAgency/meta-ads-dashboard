/**
 * Tipos compartilhados do Dashboard Builder de Tráfego Pago.
 * Usados tanto pelo servidor quanto pelo cliente.
 */

export interface CampaignMetric {
  name: string;
  currentValue: string;
  previousValue?: string;
  changePercent?: number;
  polarity: "positive" | "negative" | "neutral";
  indicatorColor: "green" | "red" | "gray";
}

export interface CampaignAnalysis {
  name: string;
  objective: string;
  /** Status de veiculação no período analisado: ativa, inativa ou desconhecido */
  deliveryStatus?: "active" | "inactive" | "unknown";
  metrics: CampaignMetric[];
  analysis: string;
  hasDataQualityWarning: boolean;
}

export interface DashboardReportData {
  platform: string;
  clientName: string;
  period: string;
  mode: "SINGLE" | "COMPARATIVE";
  objectives: string[];
  campaigns: CampaignAnalysis[];
  urgentAlerts?: string[];
  strategicSummary: {
    totalInvested: string;
    totalResults: string;
    avgCostPerResult: string;
    highlights: string[];
    attentionPoints: string[];
    contextNotes: string;
  };
  recommendations: string[];
  contextWarning?: string | null;
}
