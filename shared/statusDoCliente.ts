/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  O dado que este analista está vendo está atualizado?
 * ─────────────────────────────────────────────────────────────────────────────
 *  Puro, compartilhado. Camada COMPLEMENTAR à saúde do robô, e não substituta:
 *
 *    social_coleta_execucoes  o robô rodou? quantas contas?
 *    isto aqui                o número na minha frente é de quando?
 *
 *  As duas respondem coisas diferentes, e a primeira não responde a segunda. Uma
 *  rodada com "11 de 12 contas" é saudável do ponto de vista operacional — e a
 *  décima segunda é justamente a que alguém está olhando agora.
 *
 *  ── A distinção que dá o nome ao módulo ────────────────────────────────────
 *  Última TENTATIVA e última coleta VÁLIDA não são a mesma data. Uma conta que
 *  falha há três dias tem tentativa de hoje e dado de três dias atrás; mostrar
 *  só a tentativa faria o número parecer fresco, e mostrar só a última válida
 *  esconderia que o robô vem tentando e falhando.
 *
 *  Deriva do que já existe — os snapshots do próprio cliente. Nenhuma fonte
 *  nova.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { quando } from "./statusDaColeta";

export interface SnapshotDoCliente {
  dia: string;
  coletadoEm: string | Date;
  statusColeta: string;
  origem?: string | null;
  seguidores: number | null;
  storiesVistos: number | null;
  metricas: Record<string, number>;
}

/** O que a tela lista como "dados atualizados". Ordem é a de importância. */
export const CAMPOS_DO_STATUS: Array<{ chave: string; rotulo: string }> = [
  { chave: "seguidores", rotulo: "seguidores" },
  { chave: "profile_views", rotulo: "visitas ao perfil" },
  { chave: "reach", rotulo: "alcance" },
  { chave: "total_interactions", rotulo: "interações" },
  { chave: "website_clicks", rotulo: "cliques no link" },
  { chave: "publicacoes", rotulo: "publicações" },
  { chave: "stories", rotulo: "stories" },
];

export const ROTULO_ORIGEM: Record<string, string> = {
  cron: "Coleta automática",
  manual: "Coleta manual",
};

export interface StatusDoCliente {
  nivel: "ok" | "atencao" | "erro" | "nunca";
  /**
   * A linha que responde "posso confiar neste número?" — e é a única que
   * precisa ser lida. Tudo o mais é detalhe.
   */
  principal: string;
  /** Origem, quando está em dia; as duas datas, quando não está. */
  secundaria: string | null;
  /** "Hoje às 06:20" — a última tentativa. */
  atualizadoEm: string | null;
  fonte: string | null;
  atualizados: string[];
  faltando: string[];
  /** Preenchido só quando a última tentativa NÃO trouxe dado. */
  ultimaValidaEm: string | null;
}

/** Um snapshot conta como válido quando trouxe algum número. */
function trouxeDado(s: SnapshotDoCliente): boolean {
  return s.seguidores !== null || Object.keys(s.metricas ?? {}).length > 0;
}

function camposDe(s: SnapshotDoCliente, publicacoesNoDia: number): { atualizados: string[]; faltando: string[] } {
  const tem = (chave: string): boolean => {
    if (chave === "seguidores") return s.seguidores !== null;
    if (chave === "stories") return s.storiesVistos !== null;
    if (chave === "publicacoes") return publicacoesNoDia > 0;
    return typeof s.metricas?.[chave] === "number";
  };
  const atualizados: string[] = [];
  const faltando: string[] = [];
  for (const c of CAMPOS_DO_STATUS) (tem(c.chave) ? atualizados : faltando).push(c.rotulo);
  return { atualizados, faltando };
}

/**
 * O bloco de status de UMA conta.
 *
 * `snapshots` são os do cliente, em qualquer ordem — a função ordena. Passar só
 * os do período selecionado daria "nunca coletado" para quem tem dado de duas
 * semanas atrás, então quem chama deve mandar a série inteira.
 */
export function lerStatusDoCliente(
  snapshots: SnapshotDoCliente[],
  agora: Date,
  publicacoesNoDia = 0,
): StatusDoCliente {
  const ordenados = snapshots.slice().sort((a, b) => b.dia.localeCompare(a.dia));
  const ultimo = ordenados[0];

  if (!ultimo) {
    return {
      nivel: "nunca",
      principal: "Dados ainda não coletados",
      secundaria: "Os números da tela são leitura ao vivo, sem histórico.",
      atualizadoEm: null, fonte: null,
      atualizados: [], faltando: CAMPOS_DO_STATUS.map((c) => c.rotulo),
      ultimaValidaEm: null,
    };
  }

  const fonte = ultimo.origem ? ROTULO_ORIGEM[ultimo.origem] ?? ultimo.origem : null;
  const atualizadoEm = quando(ultimo.coletadoEm, agora);

  // A última tentativa não trouxe nada: a data que importa é a da última que
  // trouxe, e as duas precisam aparecer juntas.
  if (ultimo.statusColeta === "erro" || !trouxeDado(ultimo)) {
    const valida = ordenados.find((s) => s.statusColeta !== "erro" && trouxeDado(s));
    const validaEm = valida ? quando(valida.coletadoEm, agora) : null;
    return {
      nivel: "erro",
      // "Desatualizados" e não "erro": o problema de quem lê não é a falha, é a
      // idade do número que está na tela.
      principal: "Dados desatualizados",
      secundaria: validaEm
        ? `Última coleta válida: ${validaEm} · Última tentativa: ${atualizadoEm}`
        : `Nenhuma coleta trouxe dado até agora · Última tentativa: ${atualizadoEm}`,
      atualizadoEm, fonte,
      atualizados: [], faltando: CAMPOS_DO_STATUS.map((c) => c.rotulo),
      ultimaValidaEm: validaEm,
    };
  }

  const { atualizados, faltando } = camposDe(ultimo, publicacoesNoDia);
  if (faltando.length > 0) {
    return {
      nivel: "atencao",
      principal: `Dados atualizados ${atualizadoEm}`,
      // A lista completa fica no detalhe expandível; aqui só a quantidade, para
      // a linha caber no cabeçalho sem virar parágrafo.
      secundaria: `${fonte ?? "Coleta"} · parcial, ${faltando.length} item(ns) sem dado`,
      atualizadoEm, fonte, atualizados, faltando, ultimaValidaEm: null,
    };
  }
  return {
    nivel: "ok",
    principal: `Dados atualizados ${atualizadoEm}`,
    secundaria: fonte,
    atualizadoEm, fonte, atualizados, faltando: [], ultimaValidaEm: null,
  };
}
