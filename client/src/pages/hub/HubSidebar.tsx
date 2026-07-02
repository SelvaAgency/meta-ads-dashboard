/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  /hub — SIDEBAR  (experimental · descartável)
 * ─────────────────────────────────────────────────────────────────────────────
 *  Sidebar escura seguindo o wireframe de referência, porém usando os MESMOS
 *  tokens visuais do dashboard atual (fundo #0A0A0A, acento pink #D4537E) e a
 *  mesma lib de ícones já instalada (lucide-react). Componente usado apenas
 *  dentro de /hub — não substitui nem altera o MetaDashboardLayout existente.
 *
 *  Itens de navegação são visuais (MVP). Apenas "Home" fica ativo.
 * ─────────────────────────────────────────────────────────────────────────────
 */
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

interface NavItem {
  label: string;
  icon: LucideIcon;
  active?: boolean;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

// Navegação global (topo)
const GLOBAL_ITEMS: NavItem[] = [
  { label: "Home", icon: Home, active: true },
  { label: "Tarefas", icon: CalendarCheck },
  { label: "Acessos", icon: KeyRound },
  { label: "Notificações", icon: Bell },
  { label: "Configurações", icon: Settings },
  { label: "Spaces", icon: LayoutGrid },
];

// Produtos agrupados por área
const GROUPS: NavGroup[] = [
  {
    label: "Performance",
    items: [
      { label: "Tracker", icon: Boxes },
      { label: "Relatórios", icon: FileText },
    ],
  },
  {
    label: "Conteúdo",
    items: [{ label: "Clipper", icon: Scissors }],
  },
  {
    label: "Administrativo",
    items: [
      { label: "Financeiro", icon: DollarSign },
      { label: "Contratos", icon: FileSignature },
      { label: "Propostas", icon: ScrollText },
    ],
  },
];

function NavRow({ item }: { item: NavItem }) {
  const Icon = item.icon;
  return (
    <div
      className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-150 ${
        item.active ? "" : `cursor-pointer ${HOVER_CLS}`
      }`}
      style={item.active ? { background: ACTIVE_BG, color: ACTIVE_CLR } : { color: TEXT_NORMAL }}
    >
      <Icon className="w-4 h-4 flex-shrink-0" />
      <span className="text-sm font-medium flex-1 truncate">{item.label}</span>
    </div>
  );
}

export function HubSidebar() {
  return (
    <aside
      className="w-64 flex-shrink-0 flex-col hidden md:flex"
      style={{ background: "#0A0A0A", borderRight: "1px solid rgba(255,255,255,0.06)" }}
    >
      {/* Logo */}
      <div className="pt-5 pb-3 px-3">
        <div className="flex items-center gap-3 mb-1 min-h-[32px] px-1">
          <SelvaLogo size={52} />
          <div className="overflow-hidden min-w-0">
            <p className="text-xs font-semibold truncate" style={{ letterSpacing: "0.04em", color: "#FDFFED" }}>
              Selva Hub
            </p>
            <p className="text-[10px] truncate" style={{ color: TEXT_DIM }}>
              Portal interno · MVP
            </p>
          </div>
        </div>
      </div>

      {/* Navegação global */}
      <div className="px-3 flex flex-col gap-0.5">
        {GLOBAL_ITEMS.map((item) => (
          <NavRow key={item.label} item={item} />
        ))}
      </div>

      {/* Grupos de produtos */}
      <div className="flex-1 overflow-y-auto px-3 py-2">
        {GROUPS.map((group) => (
          <div key={group.label} className="mt-2">
            <div style={{ borderTop: DIVIDER, margin: "8px 4px 2px" }} />
            <p
              className="text-[10px] font-bold uppercase tracking-[0.1em] mb-1 px-3 py-1"
              style={{ color: "rgba(255,255,255,0.28)" }}
            >
              {group.label}
            </p>
            <div className="flex flex-col gap-0.5">
              {group.items.map((item) => (
                <NavRow key={item.label} item={item} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}
