/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Grupos do Jornalzinho — segmentação por GRUPO FIXO, não por escolha livre
 * ─────────────────────────────────────────────────────────────────────────────
 *  A primeira versão deixava cada pessoa marcar clientes um a um. Funcionava,
 *  mas o custo era ilimitado por construção: a narrativa da IA é cacheada por
 *  CONJUNTO de contas, e cada combinação diferente vira um conjunto novo — logo
 *  uma chamada de LLM nova. Com N pessoas escolhendo livremente, o teto é N
 *  narrativas por dia, e ninguém percebe o custo subindo.
 *
 *  Com grupo fixo o teto é o número de grupos: hoje três narrativas por dia
 *  (GTM 1, GTM 2 e a geral de quem não tem grupo). É a mesma segmentação, com
 *  custo que não cresce com o time.
 *
 *  ── Clientes resolvidos por TOKEN, não por id ──────────────────────────────
 *  O grupo declara pedaços de nome, e a resolução acontece contra as contas
 *  ativas na hora do uso. Duas consequências que valem o incômodo:
 *
 *   • id de conta muda entre ambientes — id cravado aqui viraria e-mail do
 *     cliente errado sem ninguém notar;
 *   • cliente que ainda não existe entra sozinho no dia em que a conta for
 *     criada (é o caso de Aiká e UMDSA), sem deploy.
 *
 *  Tokens são tentados do MAIS ESPECÍFICO ao mais genérico ("scaffold play"
 *  antes de "play"): o genérico só entra se o específico não resolver. E
 *  ambiguidade NUNCA vira escolha automática — o cliente fica de fora e a
 *  pendência é reportada, porque escolher sozinho erraria o grupo inteiro.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type GrupoJornalzinho = "gtm1" | "gtm2" | "todos" | "nenhum";

export interface DefinicaoGrupo {
  id: GrupoJornalzinho;
  rotulo: string;
  /** Descrição curta para a tela — quem é o grupo, em uma linha. */
  descricao: string;
  /** Alvos de cliente. Vazio = grupo sem recorte (todos/nenhum). */
  alvos: { rotulo: string; tokens: string[] }[];
  /** E-mails que entram neste grupo ao aplicar o padrão. */
  emailsPadrao: string[];
}

export const GRUPOS: DefinicaoGrupo[] = [
  {
    id: "gtm1",
    rotulo: "GTM 1",
    descricao: "Ultramalhas, Elwing, Carol G (e Aiká quando existir no Tracker)",
    emailsPadrao: ["beth@selva.agency", "bruna@selva.agency", "namie@selva.agency"],
    alvos: [
      { rotulo: "Ultramalhas", tokens: ["ultramalhas", "ultra malhas"] },
      { rotulo: "Elwing", tokens: ["elwing"] },
      { rotulo: "Carol G", tokens: ["caroline garrafa", "caroline", "carol"] },
      // Ainda sem conta no Tracker: fica como pendência até a conta existir, e
      // aí entra sozinha. Declarar desde já é o que torna isso automático.
      { rotulo: "Aiká", tokens: ["aika"] },
    ],
  },
  {
    id: "gtm2",
    rotulo: "GTM 2",
    descricao: "Musa, Arka, Play (e UMDSA quando existir no Tracker)",
    emailsPadrao: ["natalia@selva.agency", "bad@selva.agency"],
    alvos: [
      { rotulo: "Musa", tokens: ["musa"] },
      { rotulo: "Arka", tokens: ["arka"] },
      { rotulo: "Play", tokens: ["scaffold play", "scaffold", "play"] },
      { rotulo: "UMDSA", tokens: ["umdsa"] },
    ],
  },
  {
    id: "todos",
    rotulo: "Todos os clientes",
    descricao: "Sem recorte — visão completa do portfólio.",
    emailsPadrao: [],
    alvos: [],
  },
  {
    id: "nenhum",
    rotulo: "Nenhum cliente",
    descricao: "Só avisos gerais do sistema; nada de cliente.",
    emailsPadrao: [],
    alvos: [],
  },
];

export const ehGrupoValido = (v: unknown): v is GrupoJornalzinho =>
  typeof v === "string" && GRUPOS.some((g) => g.id === v);

export const grupoPorId = (id: string | null | undefined): DefinicaoGrupo | undefined =>
  GRUPOS.find((g) => g.id === id);

/** Normalização usada na comparação de nomes: sem acento, caixa ou separador. */
export const normalizar = (v: string) =>
  v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

export interface ResolucaoGrupo {
  grupo: GrupoJornalzinho;
  /** Clientes que o grupo alcança hoje. */
  aplicados: { rotulo: string; accountId: number; nome: string }[];
  /** Alvos que não viraram cliente — com o motivo, para ninguém adivinhar. */
  pendencias: { rotulo: string; tipo: "ambiguo" | "sem_cliente"; detalhe: string }[];
}

/**
 * Resolve os clientes de um grupo contra a lista de contas ativas.
 *
 * Devolve também as pendências: um grupo aplicado pela metade em silêncio é
 * pior do que um grupo que diz o que não conseguiu resolver.
 */
export function resolverGrupo(
  grupo: GrupoJornalzinho,
  contas: { id: number; nome: string }[],
): ResolucaoGrupo {
  const def = grupoPorId(grupo);
  const aplicados: ResolucaoGrupo["aplicados"] = [];
  const pendencias: ResolucaoGrupo["pendencias"] = [];
  if (!def || def.alvos.length === 0) return { grupo, aplicados, pendencias };

  const jaUsados = new Set<number>();
  for (const alvo of def.alvos) {
    let escolhido: { id: number; nome: string } | null = null;
    let ambiguidade: string | null = null;

    for (const t of alvo.tokens) {
      const hits = contas.filter((c) => normalizar(c.nome).includes(normalizar(t)));
      if (hits.length === 1) { escolhido = hits[0]; break; }
      if (hits.length > 1) ambiguidade = `"${t}" casou com: ${hits.map((h) => h.nome).join(", ")}`;
      // hits.length === 0 → tenta o próximo token
    }

    if (escolhido && !jaUsados.has(escolhido.id)) {
      jaUsados.add(escolhido.id);
      aplicados.push({ rotulo: alvo.rotulo, accountId: escolhido.id, nome: escolhido.nome });
      continue;
    }
    if (escolhido) continue; // já entrou por outro alvo

    pendencias.push(ambiguidade
      ? { rotulo: alvo.rotulo, tipo: "ambiguo", detalhe: `${ambiguidade} — ajuste necessário, nada aplicado` }
      : { rotulo: alvo.rotulo, tipo: "sem_cliente", detalhe: `nenhum cliente ativo casou com ${alvo.tokens.map((t) => `"${t}"`).join(" / ")}` });
  }
  return { grupo, aplicados, pendencias };
}

/**
 * Contas que o grupo enxerga. `null` = SEM RECORTE (vê tudo).
 *
 * `null` e `[]` são coisas opostas e por isso não podem ser o mesmo valor:
 * "todos" (e quem não tem grupo) não filtra nada; "nenhum" filtra tudo e recebe
 * só avisos gerais do sistema.
 */
export function contasDoGrupo(
  grupo: GrupoJornalzinho | null | undefined,
  contas: { id: number; nome: string }[],
): number[] | null {
  if (!grupo || grupo === "todos") return null;
  if (grupo === "nenhum") return [];
  return resolverGrupo(grupo, contas).aplicados.map((a) => a.accountId);
}
