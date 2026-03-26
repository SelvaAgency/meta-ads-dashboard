import { useActiveAccount } from "@/contexts/ActiveAccountContext";

/**
 * Legacy compatibility hook — delegates to the global ActiveAccountContext.
 * Pages that already use this hook continue to work without changes.
 */
export function useSelectedAccount() {
  const { activeAccountId, accounts, setActiveAccountId } = useActiveAccount();
  return {
    selectedAccountId: activeAccountId,
    setSelectedAccountId: setActiveAccountId,
    accounts,
  };
}
