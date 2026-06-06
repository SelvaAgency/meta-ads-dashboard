import { trpc } from "@/lib/trpc";
import { CLIENTS, ClientConfig, getClientByMetaAccountId, getIntegrationStatus, ClientIntegrationStatus } from "@/config/clientConfig";
import { createContext, useContext, useMemo, useState } from "react";

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
});

export function ActiveAccountProvider({ children }: { children: React.ReactNode }) {
  const { data: rawAccounts = [], isLoading } = trpc.accounts.list.useQuery();
  const [activeAccountId, setActiveAccountIdState] = useState<number | null>(null);

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
    localStorage.setItem("meta_active_account_id", String(id));
  };

  const clearActiveAccount = () => {
    setActiveAccountIdState(null);
  };

  // Set active client by slug → selects first Meta account of that client
  const setActiveClient = (slug: string) => {
    const ca = clientAccounts.find(c => c.client.slug === slug);
    if (ca && ca.accounts.length > 0) {
      setActiveAccountId(ca.accounts[0].id);
    }
  };

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
      }}
    >
      {children}
    </ActiveAccountContext.Provider>
  );
}

export function useActiveAccount() {
  return useContext(ActiveAccountContext);
}
