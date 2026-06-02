/**
 * Client Configuration
 * Maps Meta Ads account IDs to clients and defines client metadata.
 */

export interface ClientConfig {
  slug: string;
  name: string;
  shortName: string;
  color: string;
  metaAccountIds: string[];
  ga4PropertyId?: string;
  googleAdsCustomerId?: string;
}

export const CLIENTS: ClientConfig[] = [
  {
    slug: "ultramalhas",
    name: "Ultra Malhas",
    shortName: "UM",
    color: "blue",
    metaAccountIds: ["2060651151073806"],
  },
  {
    slug: "uma",
    name: "UMA Comércio e Indústria",
    shortName: "UA",
    color: "violet",
    metaAccountIds: ["692642033767602"],
  },
  {
    slug: "play",
    name: "Scaffold Play",
    shortName: "SP",
    color: "emerald",
    metaAccountIds: ["226528564675539"],
  },
  {
    slug: "baesh",
    name: "BAESH",
    shortName: "BA",
    color: "amber",
    metaAccountIds: ["2293449447774678"],
  },
  {
    slug: "elwing",
    name: "Elwing",
    shortName: "EL",
    color: "cyan",
    metaAccountIds: ["1367169851301247"],
  },
  {
    slug: "ligvegan",
    name: "Ligvegan",
    shortName: "LV",
    color: "lime",
    metaAccountIds: ["2640737262698918"],
  },
  {
    slug: "mnbr",
    name: "MNBR",
    shortName: "MN",
    color: "orange",
    metaAccountIds: ["726618102579554"],
  },
  {
    slug: "caroline",
    name: "Caroline Garrafa",
    shortName: "CG",
    color: "pink",
    metaAccountIds: ["763528323372836"],
  },
  {
    slug: "musa",
    name: "Musa Resíduos",
    shortName: "MR",
    color: "teal",
    metaAccountIds: ["1303446334975032"],
  },
  {
    slug: "zeca",
    name: "Studio Zeca Marques",
    shortName: "ZM",
    color: "indigo",
    metaAccountIds: ["883706257705771"],
  },
  {
    slug: "selva",
    name: "SELVA Agency",
    shortName: "SA",
    color: "fuchsia",
    metaAccountIds: ["436245678759718"],
  },
];

export function getClientByMetaAccountId(accountId: string): ClientConfig | undefined {
  return CLIENTS.find(c => c.metaAccountIds.includes(accountId));
}

export function getClientBySlug(slug: string): ClientConfig | undefined {
  return CLIENTS.find(c => c.slug === slug);
}

export interface ClientIntegrationStatus {
  meta: boolean;
  ga4: boolean;
  googleAds: boolean;
}

export function getIntegrationStatus(client: ClientConfig): ClientIntegrationStatus {
  return {
    meta: client.metaAccountIds.length > 0,
    ga4: !!client.ga4PropertyId,
    googleAds: !!client.googleAdsCustomerId,
  };
}
