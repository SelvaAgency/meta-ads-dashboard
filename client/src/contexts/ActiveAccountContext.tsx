/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Cliente ativo
 * ─────────────────────────────────────────────────────────────────────────────
 *  Duas entradas, nesta ordem de precedência:
 *
 *   1. `?client=<slug>` na URL — navegação explícita (flyout do Tracker).
 *      É o ÚNICO canal que atravessa o iframe: o Tracker roda em outro
 *      documento, e o estado React do Spaces não chega lá. Por isso o slug
 *      viaja na URL do iframe (ver trackerRoutes → urlEmbutidaPara).
 *   2. localStorage — memória entre visitas.
 *
 *  Antes, o localStorage era gravado e NUNCA lido (o estado inicial era null),
 *  então a persistência era ilusória: todo refresh voltava para "nenhum
 *  cliente". Agora hidrata de verdade.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { trpc } from "@/lib/trpc";
import { CLIENTS, ClientConfig, getClientByMetaAccountId, getIntegrationStatus, ClientIntegrationStatus } from "@/config/clientConfig";
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, useLocation } from "wouter";

const CHAVE = "meta_active_account_id";

/** Lê a memória. Storage pode lançar (modo privado, cota) — nunca derrubar o app por isso. */
function lerGuardado(): number | null {
  try {
    const n = Number(localStorage.getItem(CHAVE));
    return Number.isInteger(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

function guardar(id: number | null) {
  try {
    if (id === null) localStorage.removeItem(CHAVE);
    else localStorage.setItem(CHAVE, String(id));
  } catch {
    /* sem memória entre visitas; a sessão atual continua funcionando */
  }
}

/**
 * Seções por-cliente onde "trocar de cliente" deve MANTER a tela: só o cliente
 * muda. Fora desta lista (landing de portfólio, telas do Spaces), a troca cai
 * para /dashboard — a rota não faz sentido para o cliente novo.
 *
 * /experiments/:id fica de fora de propósito: o id é de um experimento do
 * cliente ANTIGO; manter a rota levaria a um 404. A lista /experiments (sem id)
 * entra normalmente.
 */
const SECOES_POR_CLIENTE = new Set([
  "/dashboard", "/campaigns", "/alerts", "/suggestions", "/experiments",
  "/reports", "/site", "/clarity", "/google-ads", "/social-networks",
]);

/**
 * Para onde ir ao trocar de cliente manualmente. Pura de propósito — a decisão
 * de rota é testável sem React. Preserva a aba (?aba=) e atualiza o ?account=
 * quando ele existe (deep-link de Site), para o exemplo do produto valer:
 *   /site?account=UMA&aba=seguranca  →  /site?account=SCAFFOLD&aba=seguranca
 */
export function rotaAoTrocarCliente(location: string, novoAccountId: number): string {
  const [pathname] = location.split("?");
  if (!SECOES_POR_CLIENTE.has(pathname)) return "/dashboard";

  // A query mora em window.location.search (wouter só dá o pathname aqui).
  const busca = typeof window !== "undefined" ? window.location.search : "";
  const p = new URLSearchParams(busca);
  // Só reescreve account se ele já estava lá — as telas que leem por estado
  // (Campanhas, Dashboard) não devem ganhar um param que não usam.
  if (p.has("account")) p.set("account", String(novoAccountId));
  const qs = p.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

interface AdAccount {
  id: number;
  accountId: string;
  accountName: string | null;
  displayName: string;
  currency: string | null;
  timezone: string | null;
  lastSyncAt: Date | null;
  pictureUrl: string | null;
}

interface ClientWithAccounts {
  client: ClientConfig;
  accounts: AdAccount[];
  integrations: ClientIntegrationStatus;
}

interface ActiveAccountContextValue {
  activeAccount: AdAccount | null;
  activeAccountId: number | null;
  accounts: AdAccount[];
  setActiveAccountId: (id: number) => void;
  clearActiveAccount: () => void;
  isLoading: boolean;
  // Client-level
  activeClient: ClientConfig | null;
  clientAccounts: ClientWithAccounts[];
  setActiveClient: (slug: string) => void;
  /**
   * TROCA MANUAL de cliente — seleciona e leva para a Visão Geral dele.
   * Diferente de setActiveAccountId (que só seleciona): quem troca de cliente
   * de propósito espera começar do começo, não continuar na tela em que estava
   * olhando o cliente anterior. Deep-link de alerta NÃO usa isto — usa
   * setActiveAccountId puro, para respeitar a rota/aba pedida.
   */
  trocarDeCliente: (accountId: number) => void;
  trocarDeClientePorSlug: (slug: string) => void;
}

const ActiveAccountContext = createContext<ActiveAccountContextValue>({
  activeAccount: null,
  activeAccountId: null,
  accounts: [],
  setActiveAccountId: () => {},
  clearActiveAccount: () => {},
  isLoading: true,
  activeClient: null,
  clientAccounts: [],
  setActiveClient: () => {},
  trocarDeCliente: () => {},
  trocarDeClientePorSlug: () => {},
});

export function ActiveAccountProvider({ children }: { children: React.ReactNode }) {
  const { data: rawAccounts = [], isLoading } = trpc.accounts.list.useQuery();
  // Hidrata na inicialização — o id só vale se a conta ainda existir, o que é
  // conferido abaixo, depois que a lista carrega.
  const [activeAccountId, setActiveAccountIdState] = useState<number | null>(lerGuardado);
  const [searchParams] = useSearchParams();
  const [location, navigate] = useLocation();
  const slugDaUrl = searchParams.get("client");

  // Enrich accounts with displayName from clientConfig
  const accounts = useMemo<AdAccount[]>(() => {
    return rawAccounts.map(a => ({
      ...a,
      displayName: getClientByMetaAccountId(a.accountId)?.name ?? a.accountName ?? a.accountId,
    }));
  }, [rawAccounts]);

  // Build client-account mapping
  const clientAccounts = useMemo<ClientWithAccounts[]>(() => {
    return CLIENTS.map(client => {
      const accs = accounts.filter(a => client.metaAccountIds.includes(a.accountId));
      return {
        client,
        accounts: accs,
        integrations: getIntegrationStatus(client),
      };
    }).filter(ca => ca.accounts.length > 0);
  }, [accounts]);

  // Derive active client from active account
  const activeClient = useMemo(() => {
    if (!activeAccountId) return null;
    const acc = accounts.find(a => a.id === activeAccountId);
    if (!acc) return null;
    return getClientByMetaAccountId(acc.accountId) ?? null;
  }, [activeAccountId, accounts]);

  const setActiveAccountId = (id: number) => {
    setActiveAccountIdState(id);
    guardar(id);
  };

  const clearActiveAccount = () => {
    setActiveAccountIdState(null);
    guardar(null); // antes a chave ficava para trás e divergia do estado
  };

  // Set active client by slug → selects first Meta account of that client
  const setActiveClient = (slug: string) => {
    const ca = clientAccounts.find(c => c.client.slug === slug);
    if (ca && ca.accounts.length > 0) {
      setActiveAccountId(ca.accounts[0].id);
    }
  };

  // Troca manual → seleciona e PRESERVA a seção atual, trocando só o cliente.
  // Estava em Site do cliente A, troca para B → continua em Site, agora de B.
  // Cai para /dashboard só quando a rota atual não faz sentido para o novo
  // cliente (a landing de portfólio, ou uma tela específica do cliente antigo).
  const trocarDeCliente = (accountId: number) => {
    setActiveAccountId(accountId);
    navigate(rotaAoTrocarCliente(location, accountId));
  };
  const trocarDeClientePorSlug = (slug: string) => {
    const ca = clientAccounts.find(c => c.client.slug === slug);
    if (ca && ca.accounts.length > 0) trocarDeCliente(ca.accounts[0].id);
  };

  /**
   * `?client=<slug>` → seleciona o cliente. Só roda quando as contas já
   * carregaram: o slug é do config, o id é do banco, e a ponte entre os dois
   * só existe com a lista em mãos.
   *
   * O ref guarda o slug já aplicado para não brigar com o usuário: sem ele,
   * trocar de cliente pelo seletor faria este efeito puxar de volta para o
   * slug da URL a cada render.
   */
  const slugAplicado = useRef<string | null>(null);
  useEffect(() => {
    if (!slugDaUrl || clientAccounts.length === 0) return;
    if (slugAplicado.current === slugDaUrl) return;
    const ca = clientAccounts.find((c) => c.client.slug === slugDaUrl);
    if (!ca?.accounts.length) return; // slug desconhecido: ignora, não limpa o que já está lá
    slugAplicado.current = slugDaUrl;
    setActiveAccountIdState(ca.accounts[0].id);
    guardar(ca.accounts[0].id);
  }, [slugDaUrl, clientAccounts]);

  /**
   * Memória velha apontando para conta que não existe mais (removida, ou de
   * outro ambiente) deixaria a tela presa num cliente fantasma. Confere depois
   * que a lista carrega.
   */
  useEffect(() => {
    if (isLoading || accounts.length === 0 || activeAccountId === null) return;
    if (!accounts.some((a) => a.id === activeAccountId)) {
      setActiveAccountIdState(null);
      guardar(null);
    }
  }, [isLoading, accounts, activeAccountId]);

  const activeAccount = accounts.find((a) => a.id === activeAccountId) ?? null;

  return (
    <ActiveAccountContext.Provider
      value={{
        activeAccount,
        activeAccountId,
        accounts,
        setActiveAccountId,
        clearActiveAccount,
        isLoading,
        activeClient,
        clientAccounts,
        setActiveClient,
        trocarDeCliente,
        trocarDeClientePorSlug,
      }}
    >
      {children}
    </ActiveAccountContext.Provider>
  );
}

export function useActiveAccount() {
  return useContext(ActiveAccountContext);
}
