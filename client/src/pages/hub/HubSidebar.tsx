/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Selva Spaces — SIDEBAR (global)
 * ─────────────────────────────────────────────────────────────────────────────
 *  Sidebar escura seguindo o wireframe, usando os MESMOS tokens do dashboard
 *  atual (fundo #0A0A0A, acento pink #D4537E) e a mesma lib de ícones
 *  (lucide-react). Usada apenas dentro de /hub.
 *
 *  Tipos de item (config-driven, NAV_*):
 *    · internal    → rota interna (wouter Link), com estado ativo
 *    · external    → link externo, abre em NOVA ABA
 *    · app         → app integrado (iframe) dentro do Spaces (ex.: Tracker).
 *                    Ao abrir, a sidebar colapsa automaticamente (appMode).
 *                    Tem flyout de clientes no hover.
 *    · placeholder → visual, ainda sem destino ("em breve")
 *
 *  Estados colapsado (w-16) / expandido (w-64):
 *    · Páginas simples → estado escolhido pelo usuário (pin) + hover.
 *    · App integrado   → colapsa automaticamente; hover expande temporariamente.
 *      Ao sair do app, o pin do usuário é restaurado (nada é perdido).
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  Home,
  CalendarCheck,
  KeyRound,
  Bell,
  Settings,
  LayoutGrid,
  Boxes,
  FileText,
  Lock,
  PanelLeftClose,
  PanelLeftOpen,
  Scissors,
  DollarSign,
  FileSignature,
  ScrollText,
  ExternalLink,
  Users,
  type LucideIcon,
} from "lucide-react";
import { SelvaLogo } from "@/components/SelvaLogo";
import { useAuth } from "@/_core/hooks/useAuth";
import { canAccessAdmin } from "@shared/permissions";
import { useActiveAccount } from "@/contexts/ActiveAccountContext";
import { trpc } from "@/lib/trpc";
import { urlDoShellPara } from "./trackerRoutes";
import { isIntegratedAppRoute } from "./integratedAppsConfig";
import { HubUserMenu } from "./HubUserMenu";

// Tokens alinhados ao MetaDashboardLayout (mantém consistência visual)
const ACTIVE_BG = "rgba(212,83,126,0.15)";
const ACTIVE_CLR = "#D4537E";
const TEXT_NORMAL = "rgba(255,255,255,0.55)";
const TEXT_DIM = "rgba(255,255,255,0.35)";
const DIVIDER = "0.5px solid rgba(255,255,255,0.08)";
const HOVER_CLS = "hover:bg-white/[0.06]";

type NavItem = {
  label: string;
  icon: LucideIcon;
} & (
  | { kind: "internal"; href: string }
  | { kind: "external"; href: string }
  | { kind: "app"; href: string; flyout?: boolean }
  | { kind: "placeholder" }
);

interface NavGroup {
  label: string;
  items: NavItem[];
  /** Grupo Administrativo → visível apenas para admin. */
  adminOnly?: boolean;
}

// ─── Navegação global (topo) ─────────────────────────────────────────────────
const NAV_GLOBAL: NavItem[] = [
  { label: "Home", icon: Home, kind: "internal", href: "/" },
  { label: "Tarefas", icon: CalendarCheck, kind: "placeholder" },
  { label: "Acessos", icon: KeyRound, kind: "internal", href: "/access" },
  { label: "Notificações", icon: Bell, kind: "internal", href: "/notificacoes" },
  { label: "Configurações", icon: Settings, kind: "internal", href: "/settings" },
  { label: "Spaces", icon: LayoutGrid, kind: "internal", href: "/spaces" },
];

// ─── Produtos agrupados por área ─────────────────────────────────────────────
const NAV_GROUPS: NavGroup[] = [
  {
    label: "Performance",
    items: [
      // Apps integrados abrem via iframe dentro do Spaces (ver integratedAppsConfig).
      { label: "Tracker", icon: Boxes, kind: "app", href: "/tracker", flyout: true },
      { label: "Relatórios", icon: FileText, kind: "app", href: "/reports" },
    ],
  },
  {
    label: "Conteúdo",
    items: [
      { label: "Clipper", icon: Scissors, kind: "external", href: "https://selva-clipper.up.railway.app/" },
    ],
  },
  {
    label: "Administrativo",
    adminOnly: true,
    items: [
      { label: "Financeiro", icon: DollarSign, kind: "app", href: "/finance" },
      { label: "Contratos", icon: FileSignature, kind: "app", href: "/contracts" },
      { label: "Propostas", icon: ScrollText, kind: "placeholder" },
      { label: "Colaboradores", icon: Users, kind: "internal", href: "/people" },
    ],
  },
];

function RowInner({ item, open }: { item: NavItem; open: boolean }) {
  const Icon = item.icon;
  return (
    <>
      <Icon className="w-4 h-4 flex-shrink-0" />
      {open && <span className="text-sm font-medium flex-1 truncate">{item.label}</span>}
      {open && item.kind === "external" && (
        <ExternalLink className="w-3 h-3 flex-shrink-0" style={{ color: TEXT_DIM }} />
      )}
      {open && item.kind === "placeholder" && (
        <span className="text-[9px] uppercase tracking-wide" style={{ color: TEXT_DIM }}>
          em breve
        </span>
      )}
    </>
  );
}

function rowClass(open: boolean, active: boolean, placeholder: boolean) {
  return `flex items-center ${open ? "gap-3 px-3" : "justify-center"} py-2 rounded-lg transition-all duration-150 ${
    active || placeholder ? "" : `cursor-pointer ${HOVER_CLS}`
  } ${placeholder ? "cursor-default" : ""}`;
}

function rowStyle(active: boolean, placeholder: boolean) {
  return active
    ? { background: ACTIVE_BG, color: ACTIVE_CLR }
    : { color: placeholder ? TEXT_DIM : TEXT_NORMAL };
}

function NavRow({ item, open, active }: { item: NavItem; open: boolean; active: boolean }) {
  const placeholder = item.kind === "placeholder";
  const cls = rowClass(open, active, placeholder);
  const style = rowStyle(active, placeholder);
  const title = open ? undefined : item.label;

  if (item.kind === "internal" || item.kind === "app") {
    return (
      <Link href={item.href}>
        <div className={cls} style={style} title={title}>
          <RowInner item={item} open={open} />
        </div>
      </Link>
    );
  }
  if (item.kind === "external") {
    return (
      <a href={item.href} target="_blank" rel="noopener noreferrer" className={cls} style={style} title={title}>
        <RowInner item={item} open={open} />
      </a>
    );
  }
  return (
    <div className={cls} style={style} title="Em breve">
      <RowInner item={item} open={open} />
    </div>
  );
}

/**
 * Item de área restrita: mesma forma da linha normal, apagada, sem link e sem
 * hover. Não é <Link> nem <button> de propósito — não há para onde ir, e um
 * clique que "não faz nada" parece bug. O visual comunica bloqueio, não erro.
 */
function LinhaBloqueada({ item, open }: { item: NavItem; open: boolean }) {
  const Icon = item.icon;
  return (
    <div
      className={`flex items-center gap-2.5 rounded-lg cursor-not-allowed select-none ${open ? "px-3 py-2" : "px-0 py-2 justify-center"}`}
      style={{ color: "rgba(255,255,255,0.22)" }}
      title="Área restrita para administradores"
    >
      <Icon className="w-4 h-4 flex-shrink-0" />
      {open && (
        <>
          <span className="text-sm truncate">{item.label}</span>
          <Lock className="w-3 h-3 flex-shrink-0 ml-auto" />
        </>
      )}
    </div>
  );
}

// ─── Item Tracker: row + flyout de clientes no hover ─────────────────────────
/**
 * A lista sai do contexto (clientAccounts), não do config estático: o config
 * tem clientes que não têm conta Meta no banco, e clicar num deles abriria o
 * Tracker sem cliente nenhum — que é justamente o que não pode acontecer
 * quando a pessoa escolheu um cliente específico. Só entra quem tem conta.
 *
 * O clique vai para /dashboard, não para a raiz do Tracker: a raiz é o seletor
 * de portfólio (lista todas as contas), então abrir lá com um cliente
 * selecionado mostraria a mesma lista de sempre — a escolha ficaria invisível.
 * /dashboard é a Visão Geral DAQUELE cliente, que é o que a pessoa pediu ao
 * clicar no nome dele.
 */
function TrackerItem({ item, open, active }: { item: Extract<NavItem, { kind: "app" }>; open: boolean; active: boolean }) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const { clientAccounts, isLoading } = useActiveAccount();

  const openFlyout = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    const rect = rowRef.current?.getBoundingClientRect();
    if (!rect) return;
    // Fixed → não é cortado por overflow da sidebar. Clamp vertical na viewport.
    const top = Math.max(12, Math.min(rect.top, window.innerHeight - 380));
    setPos({ top, left: rect.right + 6 });
  };
  const scheduleClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setPos(null), 180);
  };

  return (
    <div ref={rowRef} onMouseEnter={openFlyout} onMouseLeave={scheduleClose}>
      <NavRow item={item} open={open} active={active} />

      {pos && (
        <div
          className="fixed z-50 w-56 rounded-xl border border-border bg-popover p-2 shadow-lg"
          style={{ top: pos.top, left: pos.left }}
          onMouseEnter={() => closeTimer.current && clearTimeout(closeTimer.current)}
          onMouseLeave={scheduleClose}
        >
          <p className="px-2 pb-1.5 pt-1 text-[11px] text-muted-foreground">Clientes · Tracker</p>
          <div className="max-h-80 overflow-y-auto flex flex-col">
            {isLoading && <p className="px-2 py-1.5 text-xs text-muted-foreground">Carregando…</p>}
            {!isLoading && clientAccounts.length === 0 && (
              <p className="px-2 py-1.5 text-xs text-muted-foreground">Nenhum cliente conectado.</p>
            )}
            {clientAccounts.map(({ client }) => (
              <Link key={client.slug} href={urlDoShellPara("/dashboard", `?client=${client.slug}`)}>
                <div
                  className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 cursor-pointer hover:bg-accent/40 transition-colors"
                  onClick={() => setPos(null)}
                >
                  <span className="w-6 h-6 rounded-md bg-primary/15 text-accent flex items-center justify-center flex-shrink-0 text-[10px] font-bold overflow-hidden">
                    {client.pictureUrl ? (
                      <img src={client.pictureUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      client.shortName
                    )}
                  </span>
                  <span className="text-sm truncate">{client.name}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Preferência de recolhida. localStorage porque é decisão de máquina, não de
 * conta: quem usa notebook pequeno e monitor grande quer estados diferentes
 * nos dois — gravar no banco levaria a escolha do notebook para o monitor.
 */
const CHAVE_RECOLHIDA = "spaces_sidebar_recolhida";

function lerRecolhida(): boolean {
  try {
    return localStorage.getItem(CHAVE_RECOLHIDA) === "1";
  } catch {
    return false;
  }
}

export function HubSidebar() {
  const [location] = useLocation();
  const { user } = useAuth();
  const isAdmin = canAccessAdmin((user as { role?: string } | null)?.role);
  // Administrativo não some mais para não-admin: aparece com cadeado. Saber que
  // a área existe (e que não é para você) é diferente de achar que ela não existe.
  const groups = NAV_GROUPS;
  const [hovering, setHovering] = useState(false);
  const [recolhida, setRecolhida] = useState(lerRecolhida);
  const leaveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const alternarRecolhida = () => {
    setRecolhida((v) => {
      const novo = !v;
      try { localStorage.setItem(CHAVE_RECOLHIDA, novo ? "1" : "0"); } catch { /* sessão só */ }
      return novo;
    });
  };

  // Colapso:
  //  · App integrado          → colapsada automaticamente; hover expande.
  //  · Recolhida pela pessoa  → colapsada; hover expande (igual ao app mode).
  //  · Resto                  → expandida.
  // O hover continua valendo nos dois casos colapsados: recolher é para ganhar
  // espaço, não para perder o acesso à navegação.
  const appMode = isIntegratedAppRoute(location);
  const open = appMode || recolhida ? hovering : true;

  const isActive = (item: NavItem) => {
    if (item.kind === "app") return location === item.href;
    if (item.kind === "internal") return location === item.href;
    return false;
  };

  return (
    <aside
      className={`${open ? "w-64" : "w-16"} flex-shrink-0 flex flex-col hidden md:flex transition-all duration-200 group/side`}
      style={{ background: "#0A0A0A", borderRight: "1px solid rgba(255,255,255,0.06)" }}
      onMouseEnter={() => {
        if (leaveTimeout.current) clearTimeout(leaveTimeout.current);
        setHovering(true);
      }}
      onMouseLeave={() => {
        leaveTimeout.current = setTimeout(() => setHovering(false), 300);
      }}
    >
      {/* Logo / nome (fixo no topo). Área maior e logo maior — o header estava
          apertado demais para a marca. O botão de recolher mora aqui, discreto:
          aparece de verdade só no hover, para não competir com a identidade. */}
      <div
        className={`flex-shrink-0 pt-6 pb-4 ${open ? "px-3" : "px-2"}`}
        style={{ borderBottom: DIVIDER }}
      >
        <div className={`flex items-center gap-3 min-h-[56px] ${open ? "px-1" : "justify-center"}`}>
          <SelvaLogo size={open ? 64 : 40} />
          {open && (
            <div className="overflow-hidden min-w-0 flex-1">
              <p className="text-[15px] font-semibold truncate leading-tight" style={{ letterSpacing: "0.02em", color: "#FDFFED" }}>
                SELVA Spaces
              </p>
              <p className="text-[11px] truncate mt-0.5" style={{ color: TEXT_DIM }}>
                Portal interno
              </p>
            </div>
          )}
          {open && (
            <button
              onClick={alternarRecolhida}
              title={recolhida ? "Fixar sidebar aberta" : "Recolher sidebar"}
              aria-label={recolhida ? "Fixar sidebar aberta" : "Recolher sidebar"}
              className="flex-shrink-0 rounded-md p-1 transition-opacity opacity-0 group-hover/side:opacity-100 focus:opacity-100"
              style={{ color: TEXT_DIM }}
            >
              {recolhida ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
            </button>
          )}
        </div>
      </div>

      {/* Navegação (rola de forma independente; perfil no rodapé nunca sai da tela) */}
      <nav className={`flex-1 overflow-y-auto min-h-0 py-1 ${open ? "px-3" : "px-2"}`}>
        {/* Navegação global */}
        <div className="flex flex-col gap-0.5">
          {NAV_GLOBAL.map((item) => (
            <NavRow key={item.label} item={item} open={open} active={isActive(item)} />
          ))}
        </div>

        {/* Grupos de produtos */}
        {groups.map((group) => {
          // Grupo restrito e você não é admin: aparece, com cadeado, sem clique.
          // O bloqueio real é do backend (adminProcedure + AdminOnly na rota);
          // isto aqui é só para a pessoa saber que a área existe.
          const bloqueado = !!group.adminOnly && !isAdmin;
          return (
          <div key={group.label} className="mt-2">
            <div style={{ borderTop: DIVIDER, margin: "8px 4px 2px" }} />
            {open && (
              <p
                className="text-[10px] font-bold uppercase tracking-[0.1em] mb-1 px-3 py-1 flex items-center gap-1.5"
                style={{ color: "rgba(255,255,255,0.28)" }}
                title={bloqueado ? "Área restrita para administradores" : undefined}
              >
                {group.label}
                {bloqueado && <Lock className="w-2.5 h-2.5 flex-shrink-0" />}
              </p>
            )}
            {bloqueado ? (
              <div
                className="flex flex-col gap-0.5"
                title="Área restrita para administradores"
                aria-disabled="true"
              >
                {group.items.map((item) => (
                  <LinhaBloqueada key={item.label} item={item} open={open} />
                ))}
              </div>
            ) : (
            <div className="flex flex-col gap-0.5">
              {group.items.map((item) =>
                item.kind === "app" && item.flyout ? (
                  <TrackerItem key={item.label} item={item} open={open} active={isActive(item)} />
                ) : (
                  <NavRow key={item.label} item={item} open={open} active={isActive(item)} />
                )
              )}
            </div>
            )}
          </div>
          );
        })}
      </nav>

      {/* Quem está por aí — acima do perfil, que é o vizinho natural */}
      <Presenca open={open} />

      {/* Conta logada — menu global fixo no rodapé (perfil, configurações, sair) */}
      <div style={{ borderTop: DIVIDER }} className="flex-shrink-0 p-2">
        <HubUserMenu open={open} />
      </div>
    </aside>
  );
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Presença — quem está por aí
 * ─────────────────────────────────────────────────────────────────────────────
 *  Piada interna com dado real: "online" é quem deu sinal de vida nos últimos
 *  5 minutos com a aba em foco (ver HubShell → ping). Quem só está com o Spaces
 *  aberto e esquecido não conta — senão o indicador vira decoração.
 *
 *  A brincadeira só funciona quando o número está certo. Por isso o tooltip
 *  lista quem está online: se alguém aparecer como "vagabundo" estando à mesa,
 *  a piada morre na hora — e vira reclamação, com razão.
 *
 *  O servidor devolve só id e nome. Presença não é lugar de expor e-mail.
 * ─────────────────────────────────────────────────────────────────────────────
 */
function Presenca({ open }: { open: boolean }) {
  // 60s: o mesmo compasso do ping. Mais rápido que isso só mostraria o mesmo
  // número de novo.
  const q = trpc.presenca.lista.useQuery(undefined, {
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });

  // Presença é enfeite: enquanto não carrega (ou se falhar), simplesmente não
  // aparece. Nada na sidebar pode depender disto.
  if (!q.data) return null;

  const online = q.data.online.length;
  const offline = q.data.offline.length;
  const nomes = q.data.online.map((u) => u.name ?? "alguém").join("\n");

  const titulo = online > 0
    ? `Online agora:\n${nomes}`
    : "Ninguém online nos últimos 5 minutos.";

  if (!open) {
    return (
      <div className="flex-shrink-0 flex justify-center py-2" style={{ borderTop: DIVIDER }} title={titulo}>
        <span className="flex items-center gap-1 text-[10px]" style={{ color: TEXT_DIM }}>
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: online > 0 ? "#1D9E75" : TEXT_DIM }} />
          {online}
        </span>
      </div>
    );
  }

  return (
    <div className="flex-shrink-0 px-3 py-2" style={{ borderTop: DIVIDER }}>
      <p className="text-[11px] cursor-help leading-relaxed" style={{ color: TEXT_DIM }} title={titulo}>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: online > 0 ? "#1D9E75" : TEXT_DIM }} />
          <span style={{ color: online > 0 ? "rgba(255,255,255,0.55)" : TEXT_DIM }}>
            {online} {online === 1 ? "colaborador online" : "colaboradores online"}
          </span>
        </span>
        {offline > 0 && (
          <>
            <span className="mx-1 opacity-40">·</span>
            <span>{offline} {offline === 1 ? "vagabundo offline" : "vagabundos offline"}</span>
          </>
        )}
      </p>
    </div>
  );
}
