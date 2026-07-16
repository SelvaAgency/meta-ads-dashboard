/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Selva Spaces — SHELL (layout global)
 * ─────────────────────────────────────────────────────────────────────────────
 *  Casca de layout compartilhada por todas as páginas do Selva Spaces (Home,
 *  apps integrados, Configurações, Acessos). Mantém a sidebar global + menu de
 *  usuário consistentes e os estados ativos funcionando entre rotas.
 *
 *  Como o Selva Spaces é a raiz da aplicação, a shell reaplica o mesmo gate de
 *  autenticação que o dashboard já usava na raiz (redireciona para /login se
 *  não autenticado). Reutiliza o hook useAuth — não altera a auth global.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import type { ReactNode } from "react";
import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { HubSidebar } from "./HubSidebar";

/** De quanto em quanto a aba aberta avisa que a pessoa está viva. */
const PING_MS = 60_000;

export function HubShell({ children }: { children: ReactNode }) {
  const { user, loading, isAuthenticated } = useAuth({ redirectOnUnauthenticated: true });
  const [, navigate] = useLocation();
  const mustChange = !!(user as { mustChangePassword?: boolean } | null)?.mustChangePassword;

  // Primeiro acesso: trava tudo até trocar a senha.
  useEffect(() => {
    if (isAuthenticated && mustChange) navigate("/change-password", { replace: true });
  }, [isAuthenticated, mustChange, navigate]);

  /**
   * Presença: a aba aberta bate no servidor de minuto em minuto. Fica na shell
   * porque é o único ponto por onde todo mundo logado passa, em qualquer página.
   *
   * `document.hidden` corta o ping da aba esquecida em segundo plano: sem isso,
   * quem deixou o Spaces aberto na sexta apareceria "online" no domingo — e o
   * indicador viraria piada, não informação.
   *
   * Falha em silêncio de propósito: presença é enfeite. Se o ping quebrar, nada
   * na tela pode parar por causa disso.
   */
  const ping = trpc.presenca.ping.useMutation({ onError: () => {} });
  useEffect(() => {
    if (!isAuthenticated) return;
    const bater = () => { if (!document.hidden) ping.mutate(); };
    bater();
    const t = setInterval(bater, PING_MS);
    const aoVoltar = () => { if (!document.hidden) bater(); };
    document.addEventListener("visibilitychange", aoVoltar);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", aoVoltar); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  if (loading || !isAuthenticated || mustChange) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-10 h-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    // h-screen + overflow-hidden: a sidebar (e seu rodapé de perfil) fica fixa na
    // altura da viewport; o conteúdo rola por dentro do <main> de cada página.
    <div className="h-screen overflow-hidden flex bg-background text-foreground">
      <HubSidebar />
      <div className="flex-1 flex flex-col min-w-0 min-h-0">{children}</div>
    </div>
  );
}
