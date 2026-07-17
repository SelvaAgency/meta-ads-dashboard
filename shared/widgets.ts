/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Widgets da visão geral do Tracker — catálogo único
 * ─────────────────────────────────────────────────────────────────────────────
 *  Fonte de verdade compartilhada client+server, como shared/notifications.ts.
 *
 *  Modelo de preferência copiado do notification_prefs, e pelo mesmo motivo:
 *  AUSÊNCIA DE LINHA = default do catálogo. Só gravamos o que a pessoa mexeu.
 *  Assim, mudar o default depois vale para quem nunca personalizou — e quem
 *  personalizou não é atropelado.
 *
 *  `papeis` não é enfeite: é permissão. Um widget que não serve ao papel não
 *  aparece nem no painel de personalizar. O backend valida de novo — isto aqui
 *  só decide o que a tela mostra.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import type { Role } from "./permissions";

export type WidgetKey =
  | "midia_geral"
  | "acoes"
  | "panorama";

export type Widget = {
  key: WidgetKey;
  nome: string;
  descricao: string;
  /** Visível por padrão para estes papéis. Fora daqui: existe, mas desligado. */
  padraoPara: Role[];
  /** Quem PODE ligar. Vazio = todos. */
  papeis?: Role[];
  /** Ordem inicial. A pessoa pode reordenar depois; isto é só o ponto de partida. */
  ordem: number;
};

/**
 * O catálogo espelha os blocos que a tela REALMENTE tem, um a um. Widget que
 * não corresponde a um bloco separável seria uma promessa que a interface não
 * cumpre: o usuário desliga e nada acontece.
 *
 * Só widgets do Tracker. Financeiro, Comunicados/Jornalzinho e Tarefas são do
 * Spaces — na landing do Tracker seriam deslocados, e o Financeiro ainda
 * traria um problema de permissão para uma tela que não é dele. Quando a Home
 * do Spaces virar modular, eles entram lá com este mesmo mecanismo.
 */
export const WIDGETS: Widget[] = [
  {
    key: "midia_geral",
    nome: "Mídia paga",
    descricao: "Resumo do dia, semáforo das contas e carrossel de clientes.",
    padraoPara: ["admin", "user", "developer"],
    ordem: 10,
  },
  // O widget "sites" isolado saiu: virava bloco dominante no topo. Os dados de
  // site foram dissolvidos — resumo no Resumo do Dia, ações no bloco de Ações
  // com filtro Mídia/Site. Acompanhar sem dominar (decisão do D1.2).
  {
    key: "acoes",
    nome: "Ações sugeridas",
    descricao: "O que fazer hoje — mídia e site, com filtro por origem.",
    padraoPara: ["admin", "user", "developer"],
    ordem: 30,
  },
  {
    key: "panorama",
    nome: "Panorama geral",
    descricao: "Tabela de performance de todas as contas.",
    padraoPara: ["admin", "user"],
    ordem: 40,
  },
];

export const WIDGET_KEYS = WIDGETS.map((w) => w.key);

export function ehWidget(v: string): v is WidgetKey {
  return (WIDGET_KEYS as string[]).includes(v);
}

export function widgetPorKey(k: string): Widget | undefined {
  return WIDGETS.find((w) => w.key === k);
}

/** Este papel pode sequer ver o widget? */
export function widgetServeRole(w: Widget, role: Role): boolean {
  return !w.papeis || w.papeis.includes(role);
}

export type PrefWidget = { widgetKey: string; visivel: boolean; ordem: number | null };

export type WidgetResolvido = { key: WidgetKey; nome: string; descricao: string; visivel: boolean; ordem: number };

/**
 * Catálogo + preferências → o que a tela renderiza, na ordem.
 * Widget fora do papel some por completo: não aparece nem para ligar.
 */
export function resolverWidgets(role: Role, prefs: PrefWidget[]): WidgetResolvido[] {
  const porKey = new Map(prefs.map((p) => [p.widgetKey, p]));
  return WIDGETS.filter((w) => widgetServeRole(w, role))
    .map((w) => {
      const p = porKey.get(w.key);
      return {
        key: w.key,
        nome: w.nome,
        descricao: w.descricao,
        visivel: p ? p.visivel : w.padraoPara.includes(role),
        ordem: p?.ordem ?? w.ordem,
      };
    })
    .sort((a, b) => a.ordem - b.ordem);
}
