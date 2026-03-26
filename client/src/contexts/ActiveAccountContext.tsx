import { trpc } from "@/lib/trpc";
import { createContext, useContext, useEffect, useState } from "react";

interface AdAccount {
  id: number;
  accountId: string;
  accountName: string | null;
  currency: string | null;
  timezone: string | null;
  lastSyncAt: Date | null;
}

interface ActiveAccountContextValue {
  activeAccount: AdAccount | null;
  activeAccountId: number | null;
  accounts: AdAccount[];
  setActiveAccountId: (id: number) => void;
  isLoading: boolean;
}

const ActiveAccountContext = createContext<ActiveAccountContextValue>({
  activeAccount: null,
  activeAccountId: null,
  accounts: [],
  setActiveAccountId: () => {},
  isLoading: true,
});

export function ActiveAccountProvider({ children }: { children: React.ReactNode }) {
  const { data: accounts = [], isLoading } = trpc.accounts.list.useQuery();
  const [activeAccountId, setActiveAccountIdState] = useState<number | null>(null);

  // Persist active account in localStorage
  useEffect(() => {
    if (accounts.length > 0) {
      const saved = localStorage.getItem("meta_active_account_id");
      const savedId = saved ? parseInt(saved) : null;
      const exists = savedId && accounts.some((a) => a.id === savedId);
      if (exists) {
        setActiveAccountIdState(savedId);
      } else {
        setActiveAccountIdState(accounts[0].id);
        localStorage.setItem("meta_active_account_id", String(accounts[0].id));
      }
    }
  }, [accounts]);

  const setActiveAccountId = (id: number) => {
    setActiveAccountIdState(id);
    localStorage.setItem("meta_active_account_id", String(id));
  };

  const activeAccount = accounts.find((a) => a.id === activeAccountId) ?? null;

  return (
    <ActiveAccountContext.Provider
      value={{ activeAccount, activeAccountId, accounts, setActiveAccountId, isLoading }}
    >
      {children}
    </ActiveAccountContext.Provider>
  );
}

export function useActiveAccount() {
  return useContext(ActiveAccountContext);
}
