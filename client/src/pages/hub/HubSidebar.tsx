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
import { classesDaGaveta, BotaoFecharGaveta, usePonteiroFino, type MenuMobileControles } from "@/components/MenuMobile";
import { Link, useLocation } from "wouter";
import {
  Home,
  CalendarCheck,
  KeyRound,
  Bell,
  Settings,
  Bot,
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
  PencilRuler,
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
// Itens do BIT (Dashboard, Relatórios) usam laranja — hover e seleção. O resto
// do menu segue rosa. Mesmo comportamento com a sidebar expandida ou colapsada.
const ACTIVE_BG_ORANGE = "rgba(239,112,27,0.15)";
const ACTIVE_CLR_ORANGE = "#EF701B";
const HOVER_ORANGE = "hover:bg-[#EF701B]/10";
const TEXT_NORMAL = "rgba(255,255,255,0.55)";
const TEXT_DIM = "rgba(255,255,255,0.35)";
const DIVIDER = "0.5px solid rgba(255,255,255,0.08)";
const HOVER_CLS = "hover:bg-white/[0.06]";

type Accent = "orange" | undefined;

type NavItem = {
  label: string;
  icon: LucideIcon;
  /**
   * Porta aberta dentro de um grupo restrito. O Financeiro é admin-only, mas
   * todo colaborador precisa entrar para lançar reembolso — a própria rota
   * decide o que mostrar a cada papel. Sem isto, o item sairia com cadeado e
   * o colaborador não teria como pedir reembolso nenhum.
   */
  livre?: boolean;
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
  /** Cor de destaque (hover/seleção) dos itens do grupo. Padrão: rosa. */
  accent?: Accent;
}

// ─── Navegação global (topo) ─────────────────────────────────────────────────
const NAV_GLOBAL: NavItem[] = [
  { label: "Home", icon: Home, kind: "internal", href: "/" },
  { label: "Tarefas", icon: CalendarCheck, kind: "placeholder" },
  { label: "Acessos", icon: KeyRound, kind: "internal", href: "/access" },
  { label: "Notificações", icon: Bell, kind: "internal", href: "/notificacoes" },
  { label: "Configurações", icon: Settings, kind: "internal", href: "/settings" },
];

// ─── Produtos agrupados por área ─────────────────────────────────────────────
const NAV_GROUPS: NavGroup[] = [
  {
    label: "Brand Inteligent Tracker (BIT)",
    accent: "orange",
    items: [
      // Apps integrados abrem via iframe dentro do Spaces (ver integratedAppsConfig).
      { label: "Dashboard", icon: Bot, kind: "app", href: "/tracker", flyout: true },
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
      { label: "Financeiro", icon: DollarSign, kind: "app", href: "/finance", livre: true },
      { label: "Contratos", icon: FileSignature, kind: "app", href: "/contracts" },
      { label: "Propostas", icon: ScrollText, kind: "placeholder" },
      { label: "Colaboradores", icon: Users, kind: "internal", href: "/people" },
      /**
       * A bancada de peças fora de produção.
       *
       * Mora no grupo restrito e SEM `livre`: a página é de admin e dev, então
       * o cadeado que o grupo dá aos outros papéis está certo aqui. O Financeiro
       * é `livre` porque todo colaborador precisa lançar reembolso; a bancada é
       * o oposto — ela mostra peças meio prontas, e quem não participa da
       * decisão de produto não tem como saber que aquilo não vale.
       *
       * `kind: "app"` porque `/rascunho` é rota CRUA do Tracker — ela renderiza
       * dentro do shell. O `href` aponta para a rota crua, e não para
       * `/tracker?rota=…`: quem chega no topo é redirecionado por `Interna`, que
       * é o mesmo caminho de todo deep-link de alerta. Apontar direto para o
       * shell abreviaria um salto e quebraria o destaque do item ativo, que
       * compara `location === href`.
       */
      { label: "Rascunho", icon: PencilRuler, kind: "app", href: "/rascunho" },
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

function rowClass(open: boolean, active: boolean, placeholder: boolean, accent?: Accent) {
  const hover = accent === "orange" ? HOVER_ORANGE : HOVER_CLS;
  return `flex items-center ${open ? "gap-3 px-3" : "justify-center"} py-2 rounded-lg transition-all duration-150 ${
    active || placeholder ? "" : `cursor-pointer ${hover}`
  } ${placeholder ? "cursor-default" : ""}`;
}

function rowStyle(active: boolean, placeholder: boolean, accent?: Accent) {
  if (active) {
    return accent === "orange"
      ? { background: ACTIVE_BG_ORANGE, color: ACTIVE_CLR_ORANGE }
      : { background: ACTIVE_BG, color: ACTIVE_CLR };
  }
  return { color: placeholder ? TEXT_DIM : TEXT_NORMAL };
}

function NavRow({ item, open, active, accent }: { item: NavItem; open: boolean; active: boolean; accent?: Accent }) {
  const placeholder = item.kind === "placeholder";
  const cls = rowClass(open, active, placeholder, accent);
  const style = rowStyle(active, placeholder, accent);
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
function TrackerItem({ item, open, active, accent }: { item: Extract<NavItem, { kind: "app" }>; open: boolean; active: boolean; accent?: Accent }) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const hoverVale = usePonteiroFino();
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
    /**
     * O flyout de clientes abre por HOVER e é posicionado com
     * `getBoundingClientRect` + `position: fixed`. No celular isso é duplamente
     * errado: o toque dispara `mouseenter` (abrindo um painel que ninguém
     * pediu) e a posição calculada a partir de uma sidebar de 288px cairia
     * fora da tela.
     *
     * Sem ponteiro fino, a linha vira o que já é por baixo: um link. Tocar
     * abre o Tracker, e o cliente se escolhe lá dentro.
     */
    <div ref={rowRef}
      onMouseEnter={hoverVale ? openFlyout : undefined}
      onMouseLeave={hoverVale ? scheduleClose : undefined}
    >
      <NavRow item={item} open={open} active={active} accent={accent} />

      {pos && (
        <div
          className="fixed z-50 w-56 rounded-xl border border-border bg-popover p-2 shadow-lg"
          style={{ top: pos.top, left: pos.left }}
          /* Guardados por simetria: hoje o painel nem renderiza sem ponteiro
             fino (`pos` fica null), mas um handler de mouse sem guarda neste
             arquivo é exatamente o que a próxima refatoração copiaria. */
          onMouseEnter={hoverVale ? () => closeTimer.current && clearTimeout(closeTimer.current) : undefined}
          onMouseLeave={hoverVale ? scheduleClose : undefined}
        >
          <p className="px-2 pb-1.5 pt-1 text-[11px] text-muted-foreground">Clientes · Brand Inteligent Tracker</p>
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

export function HubSidebar({ mobile }: { mobile?: MenuMobileControles }) {
  const [location] = useLocation();
  const { user } = useAuth();
  const isAdmin = canAccessAdmin((user as { role?: string } | null)?.role);
  // Administrativo não some mais para não-admin: aparece com cadeado. Saber que
  // a área existe (e que não é para você) é diferente de achar que ela não existe.
  const groups = NAV_GROUPS;
  // Notificações é "Em breve" para todos (placeholder sem destino), igual Tarefas.
  const navGlobal: NavItem[] = NAV_GLOBAL;
  // Sem ponteiro fino (celular/tablet), hover não existe — ver usePonteiroFino.
  const hoverVale = usePonteiroFino();
  const [hovering, setHovering] = useState(false);
  const [recolhida, setRecolhida] = useState(lerRecolhida);
  // Ao clicar em recolher, o mouse AINDA está sobre a sidebar, então hovering
  // continua true e ela não fecharia — parece que o clique não fez nada (foi o
  // que o chefe reclamou). `acabouDeRecolher` ignora o hover atual até o mouse
  // sair e entrar de novo: aí sim a expansão por hover volta.
  const [acabouDeRecolher, setAcabouDeRecolher] = useState(false);
  const leaveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const alternarRecolhida = () => {
    setRecolhida((v) => {
      const novo = !v;
      try { localStorage.setItem(CHAVE_RECOLHIDA, novo ? "1" : "0"); } catch { /* sessão só */ }
      // Só ao FECHAR precisamos suprimir o hover; ao abrir, a sidebar já fica
      // aberta e não há o que suprimir.
      if (novo) setAcabouDeRecolher(true);
      return novo;
    });
  };

  // Colapso:
  //  · App integrado          → colapsada automaticamente; hover expande.
  //  · Recolhida pela pessoa  → colapsada; hover expande (igual ao app mode).
  //  · Resto                  → expandida.
  // Exceção: logo após clicar em recolher, o hover é ignorado (acabouDeRecolher),
  // para o clique fechar de verdade mesmo com o mouse ainda em cima.
  const appMode = isIntegratedAppRoute(location);
  const colapsavel = appMode || recolhida;
  /**
   * A gaveta mobile nasce EXPANDIDA, sempre.
   *
   * O estado colapsado depende de hover para expandir, e no celular não há
   * hover: a gaveta abriria com 64px de largura, mostrando ícones sem rótulo —
   * um menu ilegível que nunca abriria. No desktop nada muda, porque o
   * hambúrguer é `md:hidden` e `mobile.aberto` nunca sai de false.
   */
  const open = mobile?.aberto ? true : colapsavel ? hovering && !acabouDeRecolher : true;

  const isActive = (item: NavItem) => {
    if (item.kind === "app") return location === item.href;
    if (item.kind === "internal") return location === item.href;
    return false;
  };

  return (
    <aside
      /**
       * As classes de desktop estão intactas. `hidden md:flex` continua ali: no
       * mobile a gaveta é montada só quando aberta, o que evita que a sidebar
       * apareça por um instante durante a hidratação.
       *
       * `classesDaGaveta` só adiciona variantes `max-md:` — nada é removido, e
       * acima de 768px o resultado é o mesmo DOM de antes.
       */
      className={`${open ? "w-64" : "w-16"} flex-shrink-0 flex flex-col ${mobile?.aberto ? "flex" : "hidden"} md:flex transition-all duration-200 group/side ${classesDaGaveta(!!mobile?.aberto)}`}
      style={{ background: "#0A0A0A", borderRight: "1px solid rgba(255,255,255,0.06)" }}
      {...(mobile?.propsDaGaveta ?? {})}
      /**
       * No toque, `mouseenter` dispara e `mouseleave` frequentemente não vem: o
       * estado ficaria preso em "hovering", e a sidebar do portal acabaria
       * expandida para sempre depois do primeiro toque.
       */
      onMouseEnter={hoverVale ? () => {
        if (leaveTimeout.current) clearTimeout(leaveTimeout.current);
        setHovering(true);
      } : undefined}
      onMouseLeave={hoverVale ? () => {
        // O mouse saiu: o próximo hover volta a expandir normalmente. É aqui que
        // a supressão do clique-recolher se encerra.
        setAcabouDeRecolher(false);
        leaveTimeout.current = setTimeout(() => setHovering(false), 300);
      } : undefined}
    >
      {mobile && <BotaoFecharGaveta fechar={mobile.fechar} />}

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
          {navGlobal.map((item) => (
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
                  item.livre
                    ? <NavRow key={item.label} item={item} open={open} active={isActive(item)} />
                    : <LinhaBloqueada key={item.label} item={item} open={open} />
                ))}
              </div>
            ) : (
            <div className="flex flex-col gap-0.5">
              {group.items.map((item) =>
                item.kind === "app" && item.flyout ? (
                  <TrackerItem key={item.label} item={item} open={open} active={isActive(item)} accent={group.accent} />
                ) : (
                  <NavRow key={item.label} item={item} open={open} active={isActive(item)} accent={group.accent} />
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
      {/* Uma linha só: "N online · N offline". O texto antigo ("colaboradores
          online · vagabundos offline") quebrava na largura de 256px e perdia a
          leitura de relance. A brincadeira migrou para o tooltip, que lista quem
          está online — no texto principal, número seco. whitespace-nowrap
          garante que nunca mais quebre. */}
      <p
        className="text-[11px] cursor-help flex items-center gap-1.5 whitespace-nowrap"
        style={{ color: TEXT_DIM }}
        title={titulo}
      >
        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: online > 0 ? "#1D9E75" : TEXT_DIM }} />
        <span style={{ color: online > 0 ? "rgba(255,255,255,0.55)" : TEXT_DIM }}>{online} online</span>
        <span className="opacity-40">·</span>
        <span>{offline} offline</span>
      </p>
    </div>
  );
}
