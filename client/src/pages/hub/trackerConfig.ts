/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Selva Spaces — TRACKER (app integrado) · config  · rota /hub
 * ─────────────────────────────────────────────────────────────────────────────
 *  Estrutura de dados dos clientes exibidos no flyout do Tracker.
 *  Derivada do config de clientes JÁ EXISTENTE (client/src/config/clientConfig),
 *  que é a única fonte confiável — não inventamos clientes.
 *
 *  ⚠️  URL por cliente — por que todos apontam para a URL geral (por enquanto):
 *  O Tracker NÃO tem entrypoint público de cliente. A seleção acontece em
 *  runtime via `setActiveAccountId`, gravado em localStorage
 *  ("meta_active_account_id", um id NUMÉRICO do banco) + navegação para
 *  /dashboard. Não existe `?client=<slug>` nem `/client/:slug`, e o id numérico
 *  nem é derivável do slug sem a lista de contas carregada em runtime.
 *  Por isso o Selva Spaces não consegue abrir o Tracker de um cliente
 *  específico de forma confiável — e, por decisão de escopo, não tentamos setar
 *  o localStorage do Tracker a partir daqui nesta etapa.
 *
 *  ➜ QUANDO o Tracker ganhar um entrypoint por URL (ex.: `?client=<slug>`),
 *    troque apenas a linha `trackerUrl` abaixo. Nada mais precisa mudar.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { CLIENTS } from "@/config/clientConfig";

// Visão Geral do Tracker (mesmo deploy, origem relativa). A raiz "/" agora é o
// Selva Spaces, então a home do Tracker fica em /overview.
export const TRACKER_GENERAL_URL = "/overview";

export interface TrackerClient {
  slug: string;
  name: string;
  initials: string;
  logoUrl?: string;
  trackerUrl: string;
  enabled: boolean;
}

export const TRACKER_CLIENTS: TrackerClient[] = CLIENTS.map((c) => ({
  slug: c.slug,
  name: c.name,
  initials: c.shortName,
  logoUrl: c.pictureUrl,
  // TODO(url-por-cliente): trocar para `${TRACKER_GENERAL_URL}?client=${c.slug}`
  // (ou o padrão real) assim que o Tracker suportar seleção de cliente via URL.
  trackerUrl: TRACKER_GENERAL_URL,
  enabled: true,
}));

/** Resolve a URL do Tracker para um slug de cliente (fallback: URL geral). */
export function trackerUrlForClient(slug: string | null | undefined): string {
  if (!slug) return TRACKER_GENERAL_URL;
  return TRACKER_CLIENTS.find((c) => c.slug === slug)?.trackerUrl ?? TRACKER_GENERAL_URL;
}

export function trackerClientBySlug(slug: string | null | undefined): TrackerClient | undefined {
  if (!slug) return undefined;
  return TRACKER_CLIENTS.find((c) => c.slug === slug);
}
