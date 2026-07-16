/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Selva Spaces — TRACKER (app integrado) · config
 * ─────────────────────────────────────────────────────────────────────────────
 *  Estrutura de dados dos clientes exibidos no flyout do Tracker.
 *  Derivada do config de clientes JÁ EXISTENTE (client/src/config/clientConfig),
 *  que é a única fonte confiável — não inventamos clientes.
 *
 *  Histórico: cada cliente tinha um campo `trackerUrl` que apontava, para
 *  todos, à mesma URL geral — o Tracker não sabia selecionar cliente por URL,
 *  então o slug era descartado e o flyout abria o Tracker genérico.
 *  Agora o slug viaja na query (/tracker?client=<slug>), o HubApp o repassa ao
 *  iframe e o Tracker o resolve lá dentro (ver ActiveAccountContext). Uma URL
 *  por cliente deixou de fazer sentido: a URL é a mesma, o parâmetro é que muda.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { CLIENTS } from "@/config/clientConfig";

export interface TrackerClient {
  slug: string;
  name: string;
  initials: string;
  logoUrl?: string;
  enabled: boolean;
}

export const TRACKER_CLIENTS: TrackerClient[] = CLIENTS.map((c) => ({
  slug: c.slug,
  name: c.name,
  initials: c.shortName,
  logoUrl: c.pictureUrl,
  enabled: true,
}));

export function trackerClientBySlug(slug: string | null | undefined): TrackerClient | undefined {
  if (!slug) return undefined;
  return TRACKER_CLIENTS.find((c) => c.slug === slug);
}
