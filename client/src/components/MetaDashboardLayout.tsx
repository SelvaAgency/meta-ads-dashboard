import { useAuth } from "@/_core/hooks/useAuth";
import { BarraMobile, FundoDaGaveta, BotaoFecharGaveta, classesDaGaveta, useMenuMobile, usePonteiroFino } from "@/components/MenuMobile";
import { canAccessTrackerSettings, canManageContent } from "@shared/permissions";
import { type Fonte, type StatusFonte, type ChaveFonte } from "@shared/fontes";
import { isEmbedded } from "@/pages/hub/embed";
import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { useActiveAccount } from "@/contexts/ActiveAccountContext";
import {
  Users,
  BarChart3,
  Bell,
  ChevronDown,
  ChevronRight,
  FileText,
  FileSignature,
  FlaskConical,
  Home,
  LayoutDashboard,
  Link2,
  LogOut,
  Lightbulb,
  Lock,
  Activity,
  Globe,
  Instagram,
  Settings,
  AlertTriangle,
  Info,
  Loader2,
  Sparkles,
  Wallet,
  Bot,
} from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { SelvaLogo } from "@/components/SelvaLogo";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface MetaDashboardLayoutProps {
  children: React.ReactNode;
  title?: string;
}

// ─── Colour tokens ────────────────────────────────────────────────────────────
// BIT usa LARANJA (SELVA) — distingue do rosa do Spaces. Rosa fica só no portal.
const ACTIVE_BG   = "rgba(239,112,27,0.15)";
const ACTIVE_CLR  = "#EF701B";
const HOVER_CLS   = "hover:bg-white/[0.06]";
const TEXT_NORMAL = "rgba(255,255,255,0.55)";
const TEXT_DIM    = "rgba(255,255,255,0.35)";
const DIVIDER     = "0.5px solid rgba(255,255,255,0.08)";

/**
 * Container visual dos itens ocultos para colaboradores (só admin/dev).
 * Presentacional: agrupa o rótulo "Oculto para colaboradores" + uma caixa com
 * borda/fundo sutis em volta dos itens de nav — que continuam sendo os mesmos
 * Links, com hover/active/ícones preservados. Não mexe em acesso: quem decide
 * se o grupo aparece é o `isManager` de quem chama. Adapta-se à sidebar
 * recolhida (rótulo vira só um cadeado centralizado).
 */
function HiddenForUsersGroup({ open, children }: { open: boolean; children: React.ReactNode }) {
  return (
    <div className={open ? "mt-3" : "mt-2"}>
      {open ? (
        <p className="mb-1.5 px-1 text-[9px] font-bold uppercase tracking-[0.1em] flex items-center gap-1.5" style={{ color: "rgba(255,255,255,0.32)" }}>
          <Lock className="w-2.5 h-2.5 flex-shrink-0" /> Oculto para colaboradores
        </p>
      ) : (
        <div className="flex justify-center mb-1" title="Oculto para colaboradores">
          <Lock className="w-3 h-3" style={{ color: "rgba(255,255,255,0.32)" }} />
        </div>
      )}
      <div
        className="flex flex-col gap-0.5"
        style={{
          border: "1px solid rgba(255,255,255,0.09)",
          background: "rgba(255,255,255,0.03)",
          borderRadius: 10,
          padding: open ? 4 : "4px 2px",
        }}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * Mini-chip de fonte no seletor de clientes. Mesma verdade do AccountHeader:
 * as duas telas leem o mesmo resolvedor, então não podem divergir sobre o que
 * "conectado" significa.
 */
const TOM_FONTE: Record<StatusFonte, string> = {
  ok:      "bg-emerald-500/15 text-emerald-400",
  atencao: "bg-amber-500/15 text-amber-400",
  erro:    "bg-red-500/15 text-red-400",
  ausente: "",
};

function ChipsDeFonte({ fontes }: { fontes: Fonte[] | undefined }) {
  const visiveis = (fontes ?? []).filter((f) => f.status !== "ausente");
  if (visiveis.length === 0) return null;
  return (
    <div className="flex items-center gap-1 mt-0.5">
      {visiveis.map((f) => (
        <span key={f.chave} title={f.porque ?? f.rotulo}
          className={`text-[9px] px-1 rounded ${TOM_FONTE[f.status]}`}>
          {ROTULO_CURTO[f.chave] ?? f.rotulo}
        </span>
      ))}
    </div>
  );
}

const ROTULO_CURTO: Partial<Record<ChaveFonte, string>> = {
  meta: "Meta", google_ads: "Ads", ga4: "GA4", clarity: "Clarity", pagespeed: "Speed", site: "Site",
};

export function MetaDashboardLayout({ children, title }: MetaDashboardLayoutProps) {
  // Em lote: o seletor desenha chips de TODOS os clientes. Uma consulta por
  // cliente seria N+1 na abertura de um dropdown.
  const { data: fontesPorConta } = trpc.fontes.todas.useQuery(undefined, { staleTime: 60_000 });
  const fontesDe = (id: number | undefined) =>
    id == null ? undefined : fontesPorConta?.find((f) => f.accountId === id)?.fontes;

  const { user, loading, isAuthenticated, logout } = useAuth();
  // Embutido no Selva Spaces (iframe) → conta/logout ficam na sidebar do Spaces.
  const embedded = isEmbedded();
  const [location, navigate] = useLocation();
  const [pinnedOpen] = useState(true);
  const [hovering, setHovering] = useState(false);
  const [clientDropdownOpen, setClientDropdownOpen] = useState(false);
  const leaveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mobile = useMenuMobile();
  // Sem ponteiro fino, hover não existe — ver usePonteiroFino.
  const hoverVale = usePonteiroFino();
  /**
   * `mobile.aberto` entra aqui para a gaveta nascer EXPANDIDA: no celular não
   * existe hover, e uma gaveta colapsada em w-16 mostraria só ícones sem
   * rótulo — um menu que ninguém consegue ler.
   *
   * Não afeta o desktop: o hambúrguer é `md:hidden`, então acima de 768px
   * `mobile.aberto` nunca sai de false.
   */
  const sidebarOpen = pinnedOpen || hovering || clientDropdownOpen || mobile.aberto;

  // Visibilidade temporária: Alertas/Google Ads/Social ficam ocultos para
  // o colaborador. Também desliga as queries de alerta e o sino do topo.
  const isManager = canManageContent(user?.role);
  const podeConfigurar = canAccessTrackerSettings(user?.role);

  const {
    activeAccount,
    activeAccountId,
    activeClient,
    clientAccounts,
    trocarDeClientePorSlug,
    clearActiveAccount,
  } = useActiveAccount();

  const { data: globalUnreadCount } = trpc.alerts.unreadCount.useQuery(
    {},
    { enabled: isAuthenticated && isManager, refetchInterval: 30000 }
  );

  const hasClient = !!activeClient;

  // Nav por-cliente (exigem cliente selecionado).
  // Base: sempre visível, inclusive para o colaborador.
  const baseNavItems = [
    { path: "/dashboard", label: "Resumo", icon: LayoutDashboard },
    { path: "/campaigns", label: "Mídia", icon: BarChart3 },
    { path: "/site", label: "Site", icon: Globe },
    { path: "/reports", label: "Relatórios", icon: FileText },
  ];
  // Google Ads, Google Analytics e Lojas saíram do menu: viraram seções do hub
  // de Conexões (Configurações). Eram páginas de CONEXÃO, não de leitura por
  // cliente — manter cada uma como item de menu duplicava a mesma verdade em
  // dois lugares. As rotas antigas ainda existem e caem em Conexões (App.tsx).

  const renderAccountItem = (item: { path: string; label: string; icon: typeof Home }) => {
    const isActive = location === item.path;
    const Icon = item.icon;
    return (
      <div
        key={item.path}
        style={!hasClient ? { opacity: 0.25, pointerEvents: "none" as const } : {}}
      >
        <Link href={item.path}>
          <div
            className={`flex items-center ${sidebarOpen ? "gap-3 px-3" : "justify-center"} py-2 rounded-lg cursor-pointer transition-all duration-150 ${!isActive ? HOVER_CLS : ""}`}
            style={isActive ? { background: ACTIVE_BG, color: ACTIVE_CLR } : { color: TEXT_NORMAL }}
          >
            <Icon className="w-4 h-4 flex-shrink-0" />
            {sidebarOpen && (
              <span className="text-sm font-medium flex-1 truncate">{item.label}</span>
            )}
          </div>
        </Link>
        {/* Social — LIBERADO para todo mundo com acesso ao Tracker: a
            página analítica saiu do teste interno. Configurar token, vincular e
            diagnosticar continuam em Conexões, que é admin/dev.

            Aponta para a PÁGINA visual. Conexão, token e vínculo continuam em
            Configurações → Conexões: olhar e configurar são coisas diferentes,
            e juntá-las foi o que tornou a página antiga confusa. */}
        {item.path === "/site" && sidebarOpen && (
          <Link href="/social-networks">
            <div className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-all duration-150 ${location !== "/social-networks" ? HOVER_CLS : ""}`}
              style={location === "/social-networks" ? { background: ACTIVE_BG, color: ACTIVE_CLR } : { color: TEXT_NORMAL }}>
              <Instagram className="w-4 h-4 flex-shrink-0" />
              <span className="text-sm font-medium flex-1 truncate">Social</span>
            </div>
          </Link>
        )}
        {/* Plano de Ação — só admin/dev; colaborador vê "EM BREVE" opaco e não clicável. */}
        {item.path === "/campaigns" && sidebarOpen && (
          isManager ? (
            <Link href="/suggestions">
              <div
                className={`flex items-center gap-2.5 pl-9 pr-3 py-1.5 rounded-lg cursor-pointer transition-all duration-150 ${location !== "/suggestions" ? HOVER_CLS : ""}`}
                style={location === "/suggestions" ? { background: ACTIVE_BG, color: ACTIVE_CLR } : { color: "rgba(255,255,255,0.4)" }}
              >
                <Lightbulb className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="text-xs font-medium flex-1 truncate">Plano de Ação</span>
              </div>
            </Link>
          ) : (
            <div className="flex items-center gap-2.5 pl-9 pr-3 py-1.5 rounded-lg cursor-default select-none" style={{ color: "rgba(255,255,255,0.25)" }} title="Em breve">
              <Lightbulb className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="text-xs font-medium flex-1 truncate">Plano de Ação</span>
              <span className="text-[8px] uppercase tracking-wide flex-shrink-0">em breve</span>
            </div>
          )
        )}
        {/* Experimentos — só admin/dev; colaborador vê "EM BREVE" opaco e não clicável. */}
        {item.path === "/campaigns" && sidebarOpen && (
          isManager ? (
            <Link href="/experiments">
              <div
                className={`flex items-center gap-2.5 pl-9 pr-3 py-1.5 rounded-lg cursor-pointer transition-all duration-150 ${location !== "/experiments" && !location.startsWith("/experiments/") ? HOVER_CLS : ""}`}
                style={location === "/experiments" || location.startsWith("/experiments/") ? { background: ACTIVE_BG, color: ACTIVE_CLR } : { color: "rgba(255,255,255,0.4)" }}
              >
                <FlaskConical className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="text-xs font-medium flex-1 truncate">Experimentos</span>
              </div>
            </Link>
          ) : (
            <div className="flex items-center gap-2.5 pl-9 pr-3 py-1.5 rounded-lg cursor-default select-none" style={{ color: "rgba(255,255,255,0.25)" }} title="Em breve">
              <FlaskConical className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="text-xs font-medium flex-1 truncate">Experimentos</span>
              <span className="text-[8px] uppercase tracking-wide flex-shrink-0">em breve</span>
            </div>
          )
        )}
      </div>
    );
  };

  // ── Loading / Auth guards ──────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          <p className="text-muted-foreground text-sm">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-6 max-w-md px-4">
          <div className="flex items-center justify-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
              <span className="text-primary-foreground font-black text-lg" style={{ fontFamily: "Montserrat, sans-serif" }}>S</span>
            </div>
            <span className="text-xl font-semibold text-foreground">Selva Agency</span>
          </div>
          <h1 className="text-3xl font-bold text-foreground">Acesse sua plataforma</h1>
          <p className="text-muted-foreground">Use suas credenciais para acessar o BIT.</p>
          <Button size="lg" className="w-full" onClick={() => (window.location.href = getLoginUrl())}>
            Entrar no BIT
          </Button>
        </div>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-background flex">

      {/* ═══════════════════════════════ SIDEBAR ══════════════════════════════ */}
      <aside
        /**
         * Classes de desktop intactas. No mobile a sidebar deixava de ser menu e
         * virava obstáculo: fixa, ela comia de 64 a 256px de uma tela de 375.
         * `classesDaGaveta` a tira do fluxo e a traz por cima só quando aberta.
         */
        className={`${sidebarOpen ? "w-64" : "w-16"} flex-shrink-0 flex flex-col transition-all duration-200 z-20 ${mobile.aberto ? "" : "max-md:hidden"} ${classesDaGaveta(mobile.aberto)}`}
        style={{ background: "#0D0D0D", borderRight: "1px solid rgba(255,255,255,0.06)" }}
        {...mobile.propsDaGaveta}
        /**
         * No toque, `mouseenter` dispara e `mouseleave` costuma não vir. Como
         * `sidebarOpen` deriva de `hovering`, a sidebar do Tracker ficaria
         * expandida para sempre depois do primeiro toque na gaveta — e ao
         * girar o aparelho para paisagem ela reapareceria aberta sem motivo.
         */
        onMouseEnter={hoverVale ? () => {
          if (leaveTimeout.current) clearTimeout(leaveTimeout.current);
          setHovering(true);
        } : undefined}
        onMouseLeave={hoverVale ? () => {
          leaveTimeout.current = setTimeout(() => setHovering(false), 300);
        } : undefined}
      >

        {/* ── SECTION 1: Logo + Visão Geral ─────────────────────────────────── */}
        <BotaoFecharGaveta fechar={mobile.fechar} />

        <div className={`pt-5 pb-3 ${sidebarOpen ? "px-3" : "px-2"}`}>

          {/* Logo */}
          <div className={`flex items-center gap-3 mb-3 min-h-[32px] ${sidebarOpen ? "px-1" : "justify-center"}`}>
            {/* Ícone do BIT: o robô da SELVA (laranja) — distinto do planeta do Spaces. */}
            <div
              className="flex items-center justify-center rounded-xl flex-shrink-0"
              style={{ width: 44, height: 44, background: "rgba(239,112,27,0.14)", border: "1px solid rgba(239,112,27,0.32)" }}
            >
              <Bot className="w-6 h-6" style={{ color: "#EF701B" }} />
            </div>
            {sidebarOpen && (
              <div className="overflow-hidden min-w-0">
                <p className="text-xs font-semibold truncate" style={{ letterSpacing: "0.04em", color: "#FDFFED" }}>
                  Brand Inteligent Tracker
                </p>
                <p className="text-[10px] truncate" style={{ color: TEXT_DIM }}>Powered by SELVA Agency</p>
              </div>
            )}
          </div>

          {/* Visão Geral — sempre visível */}
          {(() => {
            // Embutido no Spaces o iframe abre em "/tracker"; direto abre em "/".
            // Ambos são a Visão Geral, então o item destaca nos dois casos.
            const isActive = location === "/" || location === "/tracker";
            return (
              <div
                onClick={() => { clearActiveAccount(); navigate("/"); }}
                className={`flex items-center ${sidebarOpen ? "gap-3 px-3" : "justify-center"} py-2 rounded-lg cursor-pointer transition-all duration-150 ${!isActive ? HOVER_CLS : ""}`}
                style={isActive ? { background: ACTIVE_BG, color: ACTIVE_CLR } : { color: TEXT_NORMAL }}
              >
                <Home className="w-4 h-4 flex-shrink-0" />
                {sidebarOpen && <span className="text-sm font-medium flex-1 truncate">Visão Geral</span>}
              </div>
            );
          })()}

          {/* Configurações — restrito a admin/dev (visibilidade + acesso). */}
          {/* Configurações tem régua PRÓPRIA — admin, dev e coordenador. As
              demais áreas escondidas por `isManager` (Panorama, Alertas)
              seguem admin/dev, e por isso não compartilham o predicado. */}
          {podeConfigurar && (() => {
            const isActive = location === "/settings";
            return (
              <Link href="/settings">
                <div
                  className={`flex items-center ${sidebarOpen ? "gap-3 px-3" : "justify-center"} py-2 rounded-lg cursor-pointer transition-all duration-150 ${!isActive ? HOVER_CLS : ""}`}
                  style={isActive ? { background: ACTIVE_BG, color: ACTIVE_CLR } : { color: TEXT_NORMAL }}
                >
                  <Settings className="w-4 h-4 flex-shrink-0" />
                  {sidebarOpen && <span className="text-sm font-medium flex-1 truncate">Configurações</span>}
                </div>
              </Link>
            );
          })()}

          {/* Panorama de Sites e Alertas foram movidos para a ÚNICA caixa
              "Oculto para colaboradores", na seção do cliente (mais abaixo). */}
        </div>

        {/* Divider */}
        <div style={{ borderTop: DIVIDER, margin: "0 12px" }} />

        {/* ── SECTION 2: Client Selector + Account Nav ──────────────────────── */}
        <div className={`flex-1 py-3 overflow-y-auto flex flex-col ${sidebarOpen ? "px-3" : "px-2"}`}>

          {/* "CLIENTE" label */}
          {sidebarOpen && (
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] mb-2 px-1" style={{ color: "rgba(255,255,255,0.28)" }}>
              Cliente
            </p>
          )}

          {/* Client selector ─────────────────────────────────── */}
          {clientAccounts.length === 0 ? (
            /* No Meta accounts connected yet */
            sidebarOpen ? (
              <Link href="/settings">
                <button
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg transition-all ${HOVER_CLS}`}
                  style={{ border: "0.5px dashed rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.4)" }}
                >
                  <Users className="w-3.5 h-3.5 flex-shrink-0" />
                  <span className="text-xs font-medium flex-1 text-left">Conectar conta</span>
                </button>
              </Link>
            ) : (
              <Link href="/settings">
                <button
                  className={`w-full h-8 flex items-center justify-center rounded-lg transition-all ${HOVER_CLS}`}
                  style={{ border: "0.5px dashed rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.4)" }}
                >
                  <Link2 className="w-3.5 h-3.5" />
                </button>
              </Link>
            )
          ) : (
            /* Has clients — dropdown */
            <DropdownMenu onOpenChange={setClientDropdownOpen}>
              <DropdownMenuTrigger asChild>
                {sidebarOpen ? (
                  <button
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg transition-all ${HOVER_CLS}`}
                    style={{ border: activeClient ? "0.5px solid rgba(255,255,255,0.1)" : "0.5px dashed rgba(255,255,255,0.15)" }}
                  >
                    <div
                      className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 font-bold text-xs overflow-hidden"
                      style={{ background: "rgba(239,112,27,0.2)", color: ACTIVE_CLR }}
                    >
                      {activeAccount?.pictureUrl
                        ? <img src={activeAccount.pictureUrl} alt="" className="w-full h-full object-cover" />
                        : (activeClient?.shortName ?? <Users className="w-3.5 h-3.5" />)}
                    </div>
                    <div className="flex-1 text-left overflow-hidden">
                      <p className="text-xs font-semibold truncate" style={{ color: activeClient ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.45)" }}>
                        {activeClient?.name ?? "Selecionar cliente"}
                      </p>
                      {activeClient && (
                        <ChipsDeFonte fontes={fontesDe(activeAccountId ?? undefined)} />
                      )}
                    </div>
                    <ChevronDown className="w-3 h-3 flex-shrink-0" style={{ color: TEXT_DIM }} />
                  </button>
                ) : (
                  <button
                    className={`w-full h-8 flex items-center justify-center rounded-lg transition-all text-[10px] font-bold overflow-hidden ${HOVER_CLS}`}
                    style={{
                      border: activeClient ? "0.5px solid rgba(255,255,255,0.1)" : "0.5px dashed rgba(255,255,255,0.15)",
                      background: "rgba(239,112,27,0.12)",
                      color: ACTIVE_CLR,
                    }}
                  >
                    {activeAccount?.pictureUrl
                      ? <img src={activeAccount.pictureUrl} alt="" className="w-full h-full object-cover" />
                      : (activeClient?.shortName ?? <Users className="w-3.5 h-3.5" />)}
                  </button>
                )}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" side={sidebarOpen ? "bottom" : "right"} className="w-64 max-h-80 overflow-y-auto">
                <DropdownMenuLabel className="text-xs text-muted-foreground">
                  Clientes ({clientAccounts.length})
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {clientAccounts.map((ca) => {
                  const isActiveCa = activeClient?.slug === ca.client.slug;
                  return (
                    <DropdownMenuItem
                      key={ca.client.slug}
                      onClick={() => {
                        // Troca manual = sempre volta para a Visão Geral do
                        // cliente novo. Antes, mantinha a página atual (ficava
                        // em Site/Campanhas do cliente anterior), que era
                        // justamente a confusão relatada.
                        trocarDeClientePorSlug(ca.client.slug);
                      }}
                      className="flex items-center gap-2.5 cursor-pointer py-2"
                    >
                      <div
                        className={`w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 font-bold text-[10px] overflow-hidden ${isActiveCa ? "" : "bg-muted text-muted-foreground"}`}
                        style={isActiveCa ? { background: "rgba(239,112,27,0.2)", color: ACTIVE_CLR } : undefined}
                      >
                        {ca.accounts[0]?.pictureUrl
                          ? <img src={ca.accounts[0].pictureUrl} alt="" className="w-full h-full object-cover rounded-md" />
                          : ca.client.shortName}
                      </div>
                      <div className="flex-1 overflow-hidden">
                        <p className="text-xs font-medium truncate">{ca.client.name}</p>
                        <ChipsDeFonte fontes={fontesDe(ca.accounts[0]?.id)} />
                      </div>
                      {isActiveCa && <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: ACTIVE_CLR }} />}
                    </DropdownMenuItem>
                  );
                })}
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/settings">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer w-full">
                      <Link2 className="w-3.5 h-3.5" />
                      Gerenciar contas
                    </div>
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {/* Account nav items ───────────────────────────────── */}
          <div className="mt-3 flex flex-col gap-0.5">
            {baseNavItems.map(renderAccountItem)}

            {/* ── Oculto para colaboradores (admin/dev) — caixa ÚNICA ──────────
                Gestão cross-client: Panorama e Alertas. */}
            {isManager && (
              <HiddenForUsersGroup open={sidebarOpen}>

                {/* Panorama de Sites — visão cross-client de gestão */}
                {(() => {
                  const isActive = location === "/panorama";
                  return (
                    <Link href="/panorama">
                      <div
                        className={`flex items-center ${sidebarOpen ? "gap-3 px-3" : "justify-center"} py-2 rounded-lg cursor-pointer transition-all duration-150 ${!isActive ? HOVER_CLS : ""}`}
                        style={isActive ? { background: ACTIVE_BG, color: ACTIVE_CLR } : { color: TEXT_NORMAL }}
                      >
                        <Globe className="w-4 h-4 flex-shrink-0" />
                        {sidebarOpen && <span className="text-sm font-medium flex-1 truncate">Panorama de Sites</span>}
                      </div>
                    </Link>
                  );
                })()}

                {/* Alertas — badge mostra o total entre todas as contas */}
                {(() => {
                  const isActive = location === "/notificacoes" || location === "/alerts";
                  return (
                    <Link href="/notificacoes">
                      <div
                        className={`flex items-center ${sidebarOpen ? "gap-3 px-3" : "justify-center"} py-2 rounded-lg cursor-pointer transition-all duration-150 ${!isActive ? HOVER_CLS : ""}`}
                        style={isActive ? { background: ACTIVE_BG, color: ACTIVE_CLR } : { color: TEXT_NORMAL }}
                      >
                        <Bell className="w-4 h-4 flex-shrink-0" />
                        {sidebarOpen && (
                          <>
                            <span className="text-sm font-medium flex-1 truncate">Alertas</span>
                            {globalUnreadCount != null && globalUnreadCount > 0 && (
                              <Badge variant="destructive" className="h-5 min-w-5 px-1.5 text-xs flex items-center justify-center font-bold shadow-sm">
                                {globalUnreadCount > 99 ? "99+" : globalUnreadCount}
                              </Badge>
                            )}
                          </>
                        )}
                      </div>
                    </Link>
                  );
                })()}
              </HiddenForUsersGroup>
            )}
          </div>

        </div>

        {/* ── User footer ───────────────────────────────────────────────────── */}
        {/* Oculto quando embutido no Selva Spaces (a conta/logout ficam na
            sidebar principal do Spaces). Visível no uso direto do dashboard. */}
        {!embedded && (
        <div style={{ borderTop: DIVIDER }} className="p-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className={`w-full flex items-center ${sidebarOpen ? "gap-2.5 px-2" : "justify-center"} py-2 rounded-lg transition-all ${HOVER_CLS}`}>
                <Avatar className="w-7 h-7 flex-shrink-0">
                  <AvatarFallback className="text-xs font-bold" style={{ background: "rgba(239,112,27,0.3)", color: ACTIVE_CLR }}>
                    {user?.name?.[0]?.toUpperCase() ?? "U"}
                  </AvatarFallback>
                </Avatar>
                {sidebarOpen && (
                  <>
                    <div className="flex-1 text-left overflow-hidden">
                      <p className="text-xs font-semibold truncate" style={{ color: "rgba(255,255,255,0.8)" }}>{user?.name ?? "Usuário"}</p>
                      <p className="text-[10px] truncate" style={{ color: TEXT_DIM }}>{user?.email ?? ""}</p>
                    </div>
                    <ChevronDown className="w-3 h-3 flex-shrink-0" style={{ color: TEXT_DIM }} />
                  </>
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={logout} className="text-destructive">
                <LogOut className="w-4 h-4 mr-2" />
                Sair
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        )}
      </aside>

      <FundoDaGaveta aberto={mobile.aberto} fechar={mobile.fechar} />

      {/* ═══════════════════════════ MAIN CONTENT ═════════════════════════════ */}
      <div className="flex-1 flex flex-col min-w-0">
        <BarraMobile titulo={title ?? "Tracker"} aberto={mobile.aberto} alternar={mobile.alternar} fundo="#0D0D0D" />
        {/*
          Page content — o sub-cabeçalho (colapso + título + sino) foi removido.

          `max-md:p-4`: no celular o padding do `<main>` é o PISO — quatro páginas
          do Tracker (Campanhas, Sugestões, Notificações, SuggestionsHub) não têm
          container próprio, e zerar aqui as deixaria coladas na borda.

          Quem tem padding próprio é que zera o seu no mobile (`max-md:p-0`),
          porque somar as duas camadas dava até 40px de cada lado numa tela de
          375 — mais de um quinto da largura só em margem. No desktop as mesmas
          duas camadas somam 48px de 1440 e ninguém nota.
        */}
        <main className="flex-1 overflow-auto p-6 max-md:p-4">
          {children}
        </main>
      </div>
    </div>
  );
}
