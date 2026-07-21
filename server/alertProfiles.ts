/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Que alerta importa para cada tipo de conta
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  Até aqui o detector de anomalias rodava as seis regras para TODA conta, com
 *  os mesmos limiares. O tipo da conta já mandava nos KPIs da tela e na análise
 *  da IA — mas não nos alertas.
 *
 *  O efeito medido em produção (30 dias, jul/2026): MNBR e Ultra Malhas, ambas
 *  MESSAGES, recebendo alerta de queda de CTR com o mesmo peso de uma conta de
 *  vendas. E ROAS_DROP só não disparava nelas porque o ROAS é zero — o que faz
 *  `currRoas > 0` ser falso. Sorte, não desenho: bastava uma conversão com
 *  valor entrar para a conta de mensagens começar a ser cobrada por ROAS.
 *
 *  Alerta que cobra a métrica errada não é só ruído: ele ensina o time a
 *  ignorar a lista inteira, e aí o alerta que importava passa junto.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { type GoalType, GOAL_TYPES, mapGoalToType } from "../shared/goalTypes";

/** As seis regras do detector. */
export type RegraAlerta =
  | "ROAS_DROP" | "CPA_SPIKE" | "CTR_DROP"
  | "PERFORMANCE_DROP" | "RESULTS_DROP" | "FREQUENCY_HIGH";

export const REGRAS_ALERTA: RegraAlerta[] = [
  "ROAS_DROP", "CPA_SPIKE", "CTR_DROP", "PERFORMANCE_DROP", "RESULTS_DROP", "FREQUENCY_HIGH",
];

/**
 *  critica    → é o produto daquele tipo; sobe um nível de gravidade
 *  primaria   → importa; gravidade como calculada (o comportamento de hoje)
 *  secundaria → contexto; desce um nível — e LOW não vira email nem crítico
 *  ignorada   → nem é avaliada
 */
export type Peso = "critica" | "primaria" | "secundaria" | "ignorada";

export type PerfilAlerta = Record<RegraAlerta, Peso>;

export type Severidade = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

/**
 * DEFAULT é tudo "primaria" DE PROPÓSITO: é o comportamento atual, byte a byte.
 * Conta em Automático, conta sem campanha e tipo desconhecido caem aqui e não
 * mudam de comportamento. A F3 só age onde há tipo declarado.
 */
const TUDO_PRIMARIA: PerfilAlerta = {
  ROAS_DROP: "primaria", CPA_SPIKE: "primaria", CTR_DROP: "primaria",
  PERFORMANCE_DROP: "primaria", RESULTS_DROP: "primaria", FREQUENCY_HIGH: "primaria",
};

export const PERFIL_DE_ALERTA: Record<GoalType, PerfilAlerta> = {
  // Vende: resultado e retorno são o produto. CTR é meio, não fim.
  SALES: {
    RESULTS_DROP: "critica", ROAS_DROP: "critica", CPA_SPIKE: "primaria",
    CTR_DROP: "secundaria", PERFORMANCE_DROP: "secundaria", FREQUENCY_HIGH: "secundaria",
  },
  // Otimiza por valor: o ROAS é a régua principal.
  VALUE: {
    ROAS_DROP: "critica", RESULTS_DROP: "critica", CPA_SPIKE: "primaria",
    CTR_DROP: "secundaria", PERFORMANCE_DROP: "secundaria", FREQUENCY_HIGH: "secundaria",
  },
  // Lead: volume e CPL. ROAS não existe — formulário não tem receita.
  LEADS: {
    RESULTS_DROP: "critica", CPA_SPIKE: "critica", CTR_DROP: "primaria",
    PERFORMANCE_DROP: "secundaria", FREQUENCY_HIGH: "secundaria", ROAS_DROP: "ignorada",
  },
  // Conversa iniciada e custo por conversa. CTR é secundário; ROAS não se aplica.
  MESSAGES: {
    RESULTS_DROP: "critica", CPA_SPIKE: "primaria", CTR_DROP: "secundaria",
    PERFORMANCE_DROP: "secundaria", FREQUENCY_HIGH: "secundaria", ROAS_DROP: "ignorada",
  },
  // Tráfego: entrega e cliques. Quem paga por sessão não é cobrado por ROAS.
  TRAFFIC: {
    PERFORMANCE_DROP: "critica", RESULTS_DROP: "primaria", CTR_DROP: "primaria",
    CPA_SPIKE: "secundaria", FREQUENCY_HIGH: "secundaria", ROAS_DROP: "ignorada",
  },
  // Interação é o resultado; saturação de frequência derruba engajamento.
  ENGAGEMENT: {
    RESULTS_DROP: "critica", PERFORMANCE_DROP: "primaria", FREQUENCY_HIGH: "primaria",
    CTR_DROP: "secundaria", CPA_SPIKE: "secundaria", ROAS_DROP: "ignorada",
  },
  // Alcance É o produto, e frequência alta é o defeito clássico do tipo.
  // Nem ROAS nem CPA se aplicam — não há conversão a cobrar.
  AWARENESS: {
    PERFORMANCE_DROP: "critica", FREQUENCY_HIGH: "critica", RESULTS_DROP: "secundaria",
    CTR_DROP: "secundaria", ROAS_DROP: "ignorada", CPA_SPIKE: "ignorada",
  },
  // Views e custo por view. Frequência importa: vídeo repetido cansa rápido.
  VIDEO: {
    RESULTS_DROP: "critica", CPA_SPIKE: "primaria", PERFORMANCE_DROP: "primaria",
    FREQUENCY_HIGH: "primaria", CTR_DROP: "secundaria", ROAS_DROP: "ignorada",
  },
  // Crescimento de seguidores e o custo dele.
  FOLLOWERS: {
    RESULTS_DROP: "critica", CPA_SPIKE: "primaria", PERFORMANCE_DROP: "primaria",
    CTR_DROP: "secundaria", FREQUENCY_HIGH: "secundaria", ROAS_DROP: "ignorada",
  },
  // Instalação e CPI. ROAS de app exigiria receita no app, que não medimos.
  APP: {
    RESULTS_DROP: "critica", CPA_SPIKE: "critica", CTR_DROP: "secundaria",
    PERFORMANCE_DROP: "secundaria", FREQUENCY_HIGH: "secundaria", ROAS_DROP: "ignorada",
  },
  DEFAULT: TUDO_PRIMARIA,
};

/** O perfil daquele tipo. Tipo desconhecido cai em DEFAULT, nunca em vazio. */
export function perfilDe(tipo: GoalType | string | null | undefined): PerfilAlerta {
  if (!tipo) return PERFIL_DE_ALERTA.DEFAULT;
  return PERFIL_DE_ALERTA[tipo as GoalType] ?? PERFIL_DE_ALERTA.DEFAULT;
}

/** Esta regra deve sequer ser avaliada para este tipo? (1ª trava) */
export function regraVale(regra: RegraAlerta, tipo: GoalType | string | null | undefined): boolean {
  return perfilDe(tipo)[regra] !== "ignorada";
}

const ESCALA: Severidade[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

/**
 * Ajusta a gravidade pelo peso da métrica naquele tipo (2ª trava).
 *
 * As duas travas são redundantes de propósito: se amanhã alguém acrescentar um
 * tipo sem perfil, a lista de permissão deixa passar — mas o rebaixamento ainda
 * segura o alerta longe do crítico.
 */
export function ajustarSeveridade(
  severidade: Severidade,
  regra: RegraAlerta,
  tipo: GoalType | string | null | undefined,
): Severidade | null {
  const peso = perfilDe(tipo)[regra];
  if (peso === "ignorada") return null;
  const i = ESCALA.indexOf(severidade);
  if (i < 0) return severidade;
  if (peso === "critica") return ESCALA[Math.min(i + 1, ESCALA.length - 1)];
  if (peso === "secundaria") return ESCALA[Math.max(i - 1, 0)];
  return severidade;
}

/**
 * O tipo da conta, num lugar só.
 *
 * O override manual VENCE sempre — inclusive quando a detecção discorda. Em
 * produção há dois casos assim: ELWING marcada MESSAGES enquanto as campanhas
 * dizem LEAD_GENERATION, e MNBR marcada MESSAGES com campanhas dizendo
 * VISIT_INSTAGRAM_PROFILE. Quem configurou à mão sabia de algo que a contagem
 * de campanhas não sabe.
 */
export function resolverTipoDaConta(
  conta: { goalTypeOverride?: string | null } | null | undefined,
  objetivosDasCampanhas: readonly (string | null | undefined)[] = [],
): GoalType {
  if (conta?.goalTypeOverride) return mapGoalToType(conta.goalTypeOverride);

  const contagem = new Map<string, number>();
  for (const g of objetivosDasCampanhas) {
    if (g) contagem.set(g, (contagem.get(g) ?? 0) + 1);
  }
  const dominante = Array.from(contagem.entries()).sort((a, b) => b[1] - a[1])[0]?.[0];
  return dominante ? mapGoalToType(dominante) : "DEFAULT";
}

/** Todo tipo tem perfil, e todo perfil cobre as seis regras. */
export function perfisCompletos(): boolean {
  return GOAL_TYPES.every((t) => {
    const p = PERFIL_DE_ALERTA[t];
    return !!p && REGRAS_ALERTA.every((r) => !!p[r]);
  });
}
