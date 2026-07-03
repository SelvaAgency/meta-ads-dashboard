/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Selva Spaces — /trello/callback (captura do token do Trello)
 * ─────────────────────────────────────────────────────────────────────────────
 *  O Trello retorna o token no FRAGMENTO da URL (#token=…), que não chega ao
 *  servidor. Esta página mínima lê o token uma única vez, envia ao backend via
 *  tRPC (completeToken) e limpa a URL. NÃO salva token em localStorage, NÃO
 *  loga token. Depois redireciona para /settings.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";

export default function TrelloCallback() {
  const [, navigate] = useLocation();
  const complete = trpc.integrations.trello.completeToken.useMutation();
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const state = new URLSearchParams(window.location.search).get("state") ?? "";
    const token = new URLSearchParams(window.location.hash.replace(/^#/, "")).get("token") ?? "";

    // Remove o token da URL imediatamente (não deixa no histórico visível).
    const goto = (path: string) => {
      window.history.replaceState(null, "", path);
      navigate(path, { replace: true });
    };

    if (!state || !token) {
      goto("/settings?trello=error");
      return;
    }
    complete.mutate(
      { state, token },
      {
        onSuccess: () => goto("/settings?trello=connected"),
        onError: () => goto("/settings?trello=error"),
      }
    );
  }, [complete, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" /> Conectando ao Trello…
      </div>
    </div>
  );
}
