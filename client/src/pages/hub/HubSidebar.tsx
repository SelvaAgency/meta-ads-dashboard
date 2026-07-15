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
import { TRACKER_CLIENTS } from "./trackerConfig";
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

// ─── Item Tracker: row + flyout de clientes no hover ─────────────────────────
function TrackerItem({ item, open, active }: { item: Extract<NavItem, { kind: "app" }>; open: boolean; active: boolean }) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rowRef = useRef<HTMLDivElement>(null);

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
            {TRACKER_CLIENTS.filter((c) => c.enabled).map((c) => (
              <Link key={c.slug} href={`${item.href}?client=${c.slug}`}>
                <div
                  className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 cursor-pointer hover:bg-accent/40 transition-colors"
                  onClick={() => setPos(null)}
                >
                  <span className="w-6 h-6 rounded-md bg-primary/15 text-accent flex items-center justify-center flex-shrink-0 text-[10px] font-bold overflow-hidden">
                    {c.logoUrl ? (
                      <img src={c.logoUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      c.initials
                    )}
                  </span>
                  <span className="text-sm truncate">{c.name}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function HubSidebar() {
  const [location] = useLocation();
  const { user } = useAuth();
  const isAdmin = canAccessAdmin((user as { role?: string } | null)?.role);
  const groups = NAV_GROUPS.filter((g) => !g.adminOnly || isAdmin);
  const [hovering, setHovering] = useState(false);
  const leaveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Colapso inteligente (sem botão manual):
  //  · Home / páginas simples → expandida.
  //  · App integrado          → colapsada automaticamente; hover expande.
  const appMode = isIntegratedAppRoute(location);
  const open = appMode ? hovering : true;

  const isActive = (item: NavItem) => {
    if (item.kind === "app") return location === item.href;
    if (item.kind === "internal") return location === item.href;
    return false;
  };

  return (
    <aside
      className={`${open ? "w-64" : "w-16"} flex-shrink-0 flex flex-col hidden md:flex transition-all duration-200`}
      style={{ background: "#0A0A0A", borderRight: "1px solid rgba(255,255,255,0.06)" }}
      onMouseEnter={() => {
        if (leaveTimeout.current) clearTimeout(leaveTimeout.current);
        setHovering(true);
      }}
      onMouseLeave={() => {
        leaveTimeout.current = setTimeout(() => setHovering(false), 300);
      }}
    >
      {/* Logo / nome visual (fixo no topo) */}
      <div className={`flex-shrink-0 pt-5 pb-3 ${open ? "px-3" : "px-2"}`}>
        <div className={`flex items-center gap-3 mb-1 min-h-[32px] ${open ? "px-1" : "justify-center"}`}>
          <SelvaLogo size={52} />
          {open && (
            <div className="overflow-hidden min-w-0">
              <p className="text-xs font-semibold truncate" style={{ letterSpacing: "0.04em", color: "#FDFFED" }}>
                SELVA Spaces
              </p>
              <p className="text-[10px] truncate" style={{ color: TEXT_DIM }}>
                Portal interno
              </p>
            </div>
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
        {groups.map((group) => (
          <div key={group.label} className="mt-2">
            <div style={{ borderTop: DIVIDER, margin: "8px 4px 2px" }} />
            {open && (
              <p
                className="text-[10px] font-bold uppercase tracking-[0.1em] mb-1 px-3 py-1"
                style={{ color: "rgba(255,255,255,0.28)" }}
              >
                {group.label}
              </p>
            )}
            <div className="flex flex-col gap-0.5">
              {group.items.map((item) =>
                item.kind === "app" && item.flyout ? (
                  <TrackerItem key={item.label} item={item} open={open} active={isActive(item)} />
                ) : (
                  <NavRow key={item.label} item={item} open={open} active={isActive(item)} />
                )
              )}
            </div>
          </div>
        ))}
      </nav>

      {/* Conta logada — menu global fixo no rodapé (perfil, configurações, sair) */}
      <div style={{ borderTop: DIVIDER }} className="flex-shrink-0 p-2">
        <HubUserMenu open={open} />
      </div>
    </aside>
  );
}
