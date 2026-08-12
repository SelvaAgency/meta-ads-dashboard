/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Instagram — os estados de um vínculo, e por que são DOIS eixos
 * ─────────────────────────────────────────────────────────────────────────────
 *  Puro, compartilhado entre servidor e tela. Compartilhado de propósito: o
 *  servidor decide o estado e a tela o desenha, e duas cópias da regra
 *  divergiriam — a tela diria "conectado" para o que o servidor sabe ser
 *  limitado.
 *
 *  ── Identidade do perfil ≠ estado da API ───────────────────────────────────
 *  Um único campo "tipoConta" com BUSINESS | CREATOR | PESSOAL | SEM_INSTAGRAM |
 *  INSIGHTS_INDISPONIVEIS misturaria duas perguntas diferentes:
 *
 *    QUEM é este perfil?          Business, Creator, pessoal
 *    O que a API ENTREGA hoje?    insights respondem, ou não
 *
 *  Elas variam separadamente. Uma conta Business pode ter insights indisponíveis
 *  por permissão faltando no token, e isso não a torna pessoal. Um perfil
 *  pessoal nunca terá insights, e isso não é falha de nada.
 *
 *  Juntar os dois num campo só obrigaria a inventar um valor para cada
 *  combinação — e o primeiro caso não previsto viraria "DESCONHECIDO", que é
 *  como um estado legítimo vira erro.
 *
 *  ── Conta pessoal NÃO é erro ───────────────────────────────────────────────
 *  É a regra que este arquivo existe para garantir. Perfil pessoal é um estado
 *  VÁLIDO com limitação conhecida: dá para mostrar @, link e o que a API
 *  devolver de básico. Tratá-lo como falha faria alguém tentar consertar uma
 *  conta que está exatamente como o cliente quer.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** QUEM é o perfil. Não diz nada sobre o que a API entrega. */
export type TipoConta = "BUSINESS" | "CREATOR" | "PESSOAL" | "DESCONHECIDO";

/** O que a API ENTREGA hoje. Não diz nada sobre quem é o perfil. */
export type StatusInsight = "DISPONIVEL" | "INDISPONIVEL" | "NAO_TESTADO" | "ERRO";

/** O vínculo entre o cliente e o Instagram, do ponto de vista da conexão. */
export type EstadoVinculo =
  | "SEM_PAGINA"
  | "PAGINA_SEM_INSTAGRAM"
  | "VINCULADO";

export const ROTULO_TIPO: Record<TipoConta, string> = {
  BUSINESS: "Conta comercial",
  CREATOR: "Conta de criador",
  PESSOAL: "Conta pessoal",
  DESCONHECIDO: "Tipo não identificado",
};

export const ROTULO_INSIGHT: Record<StatusInsight, string> = {
  DISPONIVEL: "Métricas disponíveis",
  INDISPONIVEL: "Métricas não disponíveis",
  NAO_TESTADO: "Métricas ainda não testadas",
  ERRO: "Falha ao consultar métricas",
};

/**
 * Só Business e Creator têm insights na API do Instagram. Perfil pessoal não —
 * e isso é característica da plataforma, não configuração errada de ninguém.
 */
export const tipoPermiteInsights = (t: TipoConta): boolean =>
  t === "BUSINESS" || t === "CREATOR";

/**
 * Traduz o par (identidade, API) no que a tela mostra.
 *
 * `nivel` separa o que exige AÇÃO do que é só característica:
 *
 *   ok        funcionando com métricas
 *   limitado  funcionando, sem métricas — por natureza da conta. NÃO é problema
 *   pendente  falta um passo humano (vincular Página, vincular Instagram)
 *   erro      algo quebrou e tem conserto
 *
 * "limitado" existe para conta pessoal não cair em "erro". É a distinção que
 * este módulo inteiro protege.
 */
export interface LeituraDoVinculo {
  nivel: "ok" | "limitado" | "pendente" | "erro";
  titulo: string;
  explicacao: string;
}

export function lerVinculo(v: {
  estado: EstadoVinculo;
  tipoConta: TipoConta;
  statusInsight: StatusInsight;
  username?: string | null;
  pageName?: string | null;
}): LeituraDoVinculo {
  if (v.estado === "SEM_PAGINA") {
    return {
      nivel: "pendente",
      titulo: "Nenhuma Página vinculada",
      explicacao: "Escolha a Página do Facebook deste cliente para o Instagram ser encontrado.",
    };
  }
  if (v.estado === "PAGINA_SEM_INSTAGRAM") {
    return {
      nivel: "pendente",
      titulo: "Página conectada, Instagram não vinculado",
      explicacao: `A Página${v.pageName ? ` "${v.pageName}"` : ""} não tem conta do Instagram vinculada. O vínculo é feito no próprio Instagram ou nas configurações da Página.`,
    };
  }

  const arroba = v.username ? `@${v.username}` : "Instagram";

  // Conta pessoal: estado VÁLIDO, não erro — ver cabeçalho.
  if (!tipoPermiteInsights(v.tipoConta)) {
    return {
      nivel: v.tipoConta === "DESCONHECIDO" ? "pendente" : "limitado",
      titulo: v.tipoConta === "DESCONHECIDO"
        ? `${arroba} conectado, tipo de conta não identificado`
        : `${arroba} conectado, com dados limitados`,
      explicacao: v.tipoConta === "PESSOAL"
        ? "Conta pessoal: métricas de insights não disponíveis. Perfil, @ e link continuam funcionando."
        : v.tipoConta === "CREATOR"
          ? "Conta de criador."
          : "Não foi possível identificar o tipo da conta. Teste a conexão para saber o que está disponível.",
    };
  }

  switch (v.statusInsight) {
    case "DISPONIVEL":
      return {
        nivel: "ok",
        titulo: `${arroba} conectado, com métricas`,
        explicacao: `${ROTULO_TIPO[v.tipoConta]} com insights respondendo.`,
      };
    case "INDISPONIVEL":
      return {
        // Business SEM insights é diferente de pessoal sem insights: aqui a
        // conta permite e a API não entregou — quase sempre permissão no token.
        nivel: "limitado",
        titulo: `${arroba} conectado, sem métricas`,
        explicacao: "Insights indisponíveis para este tipo de conta ou para o token atual. Rode o diagnóstico para ver qual permissão falta.",
      };
    case "ERRO":
      return {
        nivel: "erro",
        titulo: `${arroba} conectado, métricas falhando`,
        explicacao: "A consulta de insights retornou erro. Veja o diagnóstico para a mensagem da Meta.",
      };
    default:
      return {
        nivel: "pendente",
        titulo: `${arroba} conectado`,
        explicacao: "Métricas ainda não testadas. Use Testar conexão.",
      };
  }
}

/**
 * Deriva o tipo a partir do que a Graph API devolve.
 *
 * `account_type` não vem em toda resposta: quando a Página expõe
 * `instagram_business_account`, o vínculo JÁ é profissional (a Meta só cria
 * esse objeto para Business/Creator). Ausência de campo, então, não significa
 * pessoal — significa não identificado, e é por isso que DESCONHECIDO existe
 * separado de PESSOAL.
 */
export function tipoDaResposta(bruto: {
  account_type?: string | null;
  vinculadoAPagina?: boolean;
}): TipoConta {
  const t = String(bruto.account_type ?? "").toUpperCase();
  if (t === "BUSINESS") return "BUSINESS";
  if (t === "CREATOR" || t === "MEDIA_CREATOR") return "CREATOR";
  if (t === "PERSONAL") return "PESSOAL";
  // Vinculado à Página sem tipo declarado: profissional, mas qual não se sabe.
  return bruto.vinculadoAPagina ? "BUSINESS" : "DESCONHECIDO";
}
