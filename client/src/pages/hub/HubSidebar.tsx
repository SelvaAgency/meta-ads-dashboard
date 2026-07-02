/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Selva Spaces — SIDEBAR  (experimental · rota /hub · descartável)
 * ─────────────────────────────────────────────────────────────────────────────
 *  Sidebar escura seguindo o wireframe, usando os MESMOS tokens do dashboard
 *  atual (fundo #0A0A0A, acento pink #D4537E) e a mesma lib de ícones
 *  (lucide-react). Usada apenas dentro de /hub — não altera o
 *  MetaDashboardLayout existente.
 *
 *  Navegação por config (NAV_*). Três tipos de item:
 *    · internal    → rota interna (wouter Link), com estado ativo
 *    · external    → link externo, abre em NOVA ABA (mantém o Spaces aberto)
 *    · placeholder → visual, ainda sem destino ("em breve")
 *
 *  Estados colapsado (w-16, só ícones) / expandido (w-64) via hover + pin.
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
  PanelLeft,
  type LucideIcon,
} from "lucide-react";
import { SelvaLogo } from "@/components/SelvaLogo";

// Tokens alinhados ao MetaDashboardLayout (mantém consistência visual)
const ACTIVE_BG = "rgba(212,83,126,0.15)";
const ACTIVE_CLR = "#D4537E";
const TEXT_NORMAL = "rgba(255,255,255,0.55)";
const TEXT_DIM = "rgba(255,255,255,0.35)";
const DIVIDER = "0.5px solid rgba(255,255,255,0.08)";
const HOVER_CLS = "hover:bg-white/[0.06]";

// Subitem por cliente (ex.: Tracker de um cliente específico). Estrutura pronta
// para o futuro hover/flyout — hoje `children` fica vazio, nada é renderizado.
interface NavSubItem {
  label: string;
  href: string; // link externo por cliente
}

type NavItem = {
  label: string;
  icon: LucideIcon;
  /** Subitens por cliente — preparado para o futuro flyout do Tracker. */
  children?: NavSubItem[];
} & (
  | { kind: "internal"; href: string }
  | { kind: "external"; href: string }
  | { kind: "placeholder" }
);

interface NavGroup {
  label: string;
  items: NavItem[];
}

// ─── Navegação global (topo) ─────────────────────────────────────────────────
const NAV_GLOBAL: NavItem[] = [
  { label: "Home", icon: Home, kind: "internal", href: "/hub" },
  { label: "Tarefas", icon: CalendarCheck, kind: "placeholder" },
  { label: "Acessos", icon: KeyRound, kind: "internal", href: "/hub/acessos" },
  { label: "Notificações", icon: Bell, kind: "placeholder" },
  { label: "Configurações", icon: Settings, kind: "placeholder" },
  { label: "Spaces", icon: LayoutGrid, kind: "external", href: "https://selvaagency.github.io/selva-spaces/" },
];

// ─── Produtos agrupados por área ─────────────────────────────────────────────
const NAV_GROUPS: NavGroup[] = [
  {
    label: "Performance",
    items: [
      {
        label: "Tracker",
        icon: Boxes,
        kind: "external",
        href: "https://meta-ads-dashboard-production-7c73.up.railway.app/",
        // FUTURO: preencher com o Tracker de cada cliente para exibir no
        // hover/flyout. Ex.: [{ label: "LACLIMA", href: ".../?client=laclima" }]
        children: [],
      },
      {
        label: "Relatórios",
        icon: FileText,
        kind: "external",
        href: "https://meta-ads-dashboard-production-7c73.up.railway.app/reports",
      },
    ],
  },
  {
    label: "Conteúdo",
    items: [
      { label: "Clipper", icon: Scissors, kind: "external", href: "https://spin-clipper.up.railway.app/" },
    ],
  },
  {
    label: "Administrativo",
    items: [
      { label: "Financeiro", icon: DollarSign, kind: "placeholder" },
      {
        label: "Contratos",
        icon: FileSignature,
        kind: "external",
        href: "https://meta-ads-dashboard-production-7c73.up.railway.app/contracts",
      },
      { label: "Propostas", icon: ScrollText, kind: "placeholder" },
    ],
  },
];

function NavRow({ item, open, active }: { item: NavItem; open: boolean; active: boolean }) {
  const Icon = item.icon;
  const isPlaceholder = item.kind === "placeholder";

  const rowClass = `flex items-center ${open ? "gap-3 px-3" : "justify-center"} py-2 rounded-lg transition-all duration-150 ${
    active || isPlaceholder ? "" : `cursor-pointer ${HOVER_CLS}`
  } ${isPlaceholder ? "cursor-default" : ""}`;

  const rowStyle = active
    ? { background: ACTIVE_BG, color: ACTIVE_CLR }
    : { color: isPlaceholder ? TEXT_DIM : TEXT_NORMAL };

  const inner = (
    <>
      <Icon className="w-4 h-4 flex-shrink-0" />
      {open && <span className="text-sm font-medium flex-1 truncate">{item.label}</span>}
      {open && item.kind === "external" && (
        <ExternalLink className="w-3 h-3 flex-shrink-0" style={{ color: TEXT_DIM }} />
      )}
      {open && isPlaceholder && (
        <span className="text-[9px] uppercase tracking-wide" style={{ color: TEXT_DIM }}>
          em breve
        </span>
      )}
    </>
  );

  if (item.kind === "internal") {
    return (
      <Link href={item.href}>
        <div className={rowClass} style={rowStyle} title={open ? undefined : item.label}>
          {inner}
        </div>
      </Link>
    );
  }

  if (item.kind === "external") {
    return (
      <a
        href={item.href}
        target="_blank"
        rel="noopener noreferrer"
        className={rowClass}
        style={rowStyle}
        title={open ? undefined : item.label}
      >
        {inner}
      </a>
    );
  }

  // placeholder
  return (
    <div className={rowClass} style={rowStyle} title="Em breve">
      {inner}
    </div>
  );
}

export function HubSidebar() {
  const [location] = useLocation();
  const [pinned, setPinned] = useState(true);
  const [hovering, setHovering] = useState(false);
  const leaveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const open = pinned || hovering;

  const isActive = (item: NavItem) => item.kind === "internal" && location === item.href;

  return (
    <aside
      className={`${open ? "w-64" : "w-16"} flex-shrink-0 flex-col hidden md:flex transition-all duration-200`}
      style={{ background: "#0A0A0A", borderRight: "1px solid rgba(255,255,255,0.06)" }}
      onMouseEnter={() => {
        if (leaveTimeout.current) clearTimeout(leaveTimeout.current);
        setHovering(true);
      }}
      onMouseLeave={() => {
        leaveTimeout.current = setTimeout(() => setHovering(false), 300);
      }}
    >
      {/* Logo / nome visual */}
      <div className={`pt-5 pb-3 ${open ? "px-3" : "px-2"}`}>
        <div className={`flex items-center gap-3 mb-1 min-h-[32px] ${open ? "px-1" : "justify-center"}`}>
          <SelvaLogo size={52} />
          {open && (
            <div className="overflow-hidden min-w-0">
              <p className="text-xs font-semibold truncate" style={{ letterSpacing: "0.04em", color: "#FDFFED" }}>
                Selva Spaces
              </p>
              <p className="text-[10px] truncate" style={{ color: TEXT_DIM }}>
                Portal interno
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Navegação global */}
      <div className={`flex flex-col gap-0.5 ${open ? "px-3" : "px-2"}`}>
        {NAV_GLOBAL.map((item) => (
          <NavRow key={item.label} item={item} open={open} active={isActive(item)} />
        ))}
      </div>

      {/* Grupos de produtos */}
      <div className={`flex-1 overflow-y-auto py-2 ${open ? "px-3" : "px-2"}`}>
        {NAV_GROUPS.map((group) => (
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
              {group.items.map((item) => (
                <div key={item.label}>
                  <NavRow item={item} open={open} active={isActive(item)} />
                  {/* Subitens por cliente (Tracker) — renderiza só quando houver.
                      Hoje `children` é vazio, então nada aparece. */}
                  {open && item.children && item.children.length > 0 && (
                    <div className="flex flex-col gap-0.5 mt-0.5">
                      {item.children.map((sub) => (
                        <a
                          key={sub.label}
                          href={sub.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`flex items-center gap-2.5 pl-9 pr-3 py-1.5 rounded-lg cursor-pointer transition-all duration-150 ${HOVER_CLS}`}
                          style={{ color: "rgba(255,255,255,0.4)" }}
                        >
                          <span className="text-xs font-medium flex-1 truncate">{sub.label}</span>
                          <ExternalLink className="w-3 h-3 flex-shrink-0" style={{ color: TEXT_DIM }} />
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Pin / recolher barra */}
      <div style={{ borderTop: DIVIDER }} className={`p-2 ${open ? "" : "flex justify-center"}`}>
        <button
          onClick={() => setPinned((p) => !p)}
          className={`flex items-center ${open ? "gap-3 px-3 w-full" : "justify-center"} py-2 rounded-lg transition-all ${HOVER_CLS}`}
          style={{ color: TEXT_NORMAL }}
          title={pinned ? "Recolher barra" : "Fixar barra"}
        >
          <PanelLeft className="w-4 h-4 flex-shrink-0" />
          {open && <span className="text-sm font-medium flex-1 text-left truncate">{pinned ? "Recolher barra" : "Fixar barra"}</span>}
        </button>
      </div>
    </aside>
  );
}
