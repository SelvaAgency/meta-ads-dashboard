/**
 * clientReportConfig.ts — Configuração de relatórios diários customizados por cliente
 *
 * Define as métricas específicas que cada cliente recebe no relatório diário
 * Inclui mapeamento de contas, recipients e estrutura de dados
 */

export type MetricType =
  | "investment" // Investimento (spend)
  | "primaryResult" // Resultado principal (conversões, cliques, mensagens, etc)
  | "costPerResult" // CPA, CPC, CPM
  | "ctr" // Click-through rate
  | "profileVisits" // Visitas ao perfil
  | "followers" // Seguidores no IG
  | "revenue" // Receita
  | "roas" // ROAS
  | "cartAdditions" // Adições ao carrinho
  | "pageAccess"; // Acessos/sessões na página de destino

export interface ClientReportConfig {
  clientId: string;
  clientName: string;
  accountIds: string[]; // IDs das contas Meta Ads
  metrics: MetricType[];
  primaryResultLabel: string; // Ex: "Cliques no link", "Mensagens Iniciadas", "Compras"
  costPerResultLabel: string; // Ex: "CPC", "CPA"
  recipients: string[];
  timezone: string;
  includeComparison: boolean; // Comparar com dia anterior
}

// Mapeamento de contas por cliente
export const CLIENT_REPORT_CONFIGS: Record<string, ClientReportConfig> = {
  "selva-agency": {
    clientId: "selva-agency",
    clientName: "SELVA AGENCY",
    accountIds: ["436245678759718"], // CA - SELVA Agency
    metrics: [
      "investment",
      "primaryResult",
      "costPerResult",
      "ctr",
      "profileVisits",
      "followers"
    ],
    primaryResultLabel: "Cliques no link",
    costPerResultLabel: "CPC",
    recipients: ["felberg@selva.agency", "natalia@selva.agency"],
    timezone: "America/Sao_Paulo",
    includeComparison: true
  },

  "mnbr": {
    clientId: "mnbr",
    clientName: "MNBR",
    accountIds: ["2749125688806040"], // CA - MNBR
    metrics: [
      "investment",
      "primaryResult",
      "costPerResult",
      "ctr",
      "profileVisits",
      "followers"
    ],
    primaryResultLabel: "Mensagens Iniciadas",
    costPerResultLabel: "CPA",
    recipients: ["felberg@selva.agency", "natalia@selva.agency"],
    timezone: "America/Sao_Paulo",
    includeComparison: true
  },

  "uma": {
    clientId: "uma",
    clientName: "UMA",
    accountIds: ["692642033767602"], // Conta 692642033767602 / UMA COMÉRCIO
    metrics: [
      "investment",
      "primaryResult",
      "costPerResult",
      "revenue",
      "roas",
      "ctr",
      "profileVisits",
      "followers"
    ],
    primaryResultLabel: "Compras",
    costPerResultLabel: "CPA",
    recipients: ["felberg@selva.agency", "natalia@selva.agency"],
    timezone: "America/Sao_Paulo",
    includeComparison: true
  },

  "baesh": {
    clientId: "baesh",
    clientName: "BAESH",
    accountIds: ["416368164738574"], // CA - BAESH / Cinase
    metrics: [
      "investment",
      "primaryResult",
      "costPerResult",
      "revenue",
      "roas",
      "ctr",
      "profileVisits",
      "followers"
    ],
    primaryResultLabel: "Compras",
    costPerResultLabel: "CPA",
    recipients: ["felberg@selva.agency", "natalia@selva.agency"],
    timezone: "America/Sao_Paulo",
    includeComparison: true
  },

  "elwing": {
    clientId: "elwing",
    clientName: "ELWING",
    accountIds: ["1367169851301247"], // C1 - ELWING
    metrics: [
      "investment",
      "primaryResult",
      "costPerResult",
      "ctr",
      "profileVisits",
      "followers"
    ],
    primaryResultLabel: "Mensagens Iniciadas",
    costPerResultLabel: "CPA",
    recipients: ["felberg@selva.agency", "natalia@selva.agency"],
    timezone: "America/Sao_Paulo",
    includeComparison: true
  },

  "ultramalhas": {
    clientId: "ultramalhas",
    clientName: "ULTRAMALHAS",
    accountIds: ["509353363688317"], // CA - Ultra Malhas
    metrics: [
      "investment",
      "primaryResult",
      "costPerResult",
      "ctr",
      "profileVisits",
      "followers"
    ],
    primaryResultLabel: "Mensagens Iniciadas",
    costPerResultLabel: "CPA",
    recipients: ["felberg@selva.agency", "natalia@selva.agency"],
    timezone: "America/Sao_Paulo",
    includeComparison: true
  },

  "play": {
    clientId: "play",
    clientName: "PLAY",
    accountIds: ["1303446334975032"], // CA - Scaffold Play
    metrics: [
      "investment",
      "primaryResult",
      "costPerResult",
      "revenue",
      "roas",
      "cartAdditions",
      "ctr",
      "pageAccess"
    ],
    primaryResultLabel: "Compras",
    costPerResultLabel: "CPA",
    recipients: ["felberg@selva.agency", "natalia@selva.agency"],
    timezone: "America/Sao_Paulo",
    includeComparison: true
  },

  "phbr-medical": {
    clientId: "phbr-medical",
    clientName: "PHBR MEDICAL",
    accountIds: ["2748857121950775"], // CA - Phbr Medical / CA - T&D Energy
    metrics: [
      "investment",
      "primaryResult",
      "costPerResult",
      "ctr",
      "profileVisits",
      "followers"
    ],
    primaryResultLabel: "Mensagens Iniciadas",
    costPerResultLabel: "CPA",
    recipients: ["felberg@selva.agency", "natalia@selva.agency"],
    timezone: "America/Sao_Paulo",
    includeComparison: true
  },

  "studio-zeca": {
    clientId: "studio-zeca",
    clientName: "STUDIO ZECA MARQUES",
    accountIds: ["883706257705771"], // CA - Studio Zeca Marques
    metrics: [
      "investment",
      "primaryResult",
      "costPerResult",
      "ctr",
      "profileVisits",
      "followers"
    ],
    primaryResultLabel: "Mensagens Iniciadas",
    costPerResultLabel: "CPA",
    recipients: ["felberg@selva.agency", "natalia@selva.agency"],
    timezone: "America/Sao_Paulo",
    includeComparison: true
  }
};

export function getClientConfig(clientId: string): ClientReportConfig | null {
  return CLIENT_REPORT_CONFIGS[clientId] || null;
}

export function getAllClientConfigs(): ClientReportConfig[] {
  return Object.values(CLIENT_REPORT_CONFIGS);
}

export function getClientsByAccountId(accountId: string): ClientReportConfig[] {
  return Object.values(CLIENT_REPORT_CONFIGS).filter(config =>
    config.accountIds.includes(accountId)
  );
}
