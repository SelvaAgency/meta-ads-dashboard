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
  const pagina = v.pageName ? `"${v.pageName}"` : "a Página";
  const arroba = v.username ? `@${v.username}` : "o Instagram";

  if (v.estado === "SEM_PAGINA") {
    return {
      nivel: "pendente",
      titulo: "Nenhuma Página vinculada",
      explicacao: "Escolha a Página do Facebook deste cliente e clique em Vincular. Escolher no seletor sozinho não salva nada.",
    };
  }
  if (v.estado === "PAGINA_SEM_INSTAGRAM") {
    return {
      nivel: "pendente",
      titulo: "Sem Instagram vinculado",
      explicacao: `Página ${pagina} vinculada e salva, mas ela não tem conta do Instagram vinculada. O vínculo é feito no próprio Instagram ou nas configurações da Página — não aqui.`,
    };
  }

  // Conta pessoal: estado VÁLIDO, não erro — ver cabeçalho. Decidido antes do
  // statusInsight porque para ela "sem métricas" não é resultado de teste
  // nenhum: é o que a plataforma oferece, e testar não vai mudar.
  if (!tipoPermiteInsights(v.tipoConta)) {
    return v.tipoConta === "DESCONHECIDO"
      ? {
          nivel: "pendente",
          titulo: "Instagram vinculado, tipo de conta não identificado",
          explicacao: `Página ${pagina} e ${arroba} salvos. Não foi possível identificar o tipo da conta — rode Testar para saber o que está disponível.`,
        }
      : {
          nivel: "limitado",
          titulo: "Conectado, dados limitados",
          explicacao: v.tipoConta === "PESSOAL"
            ? `Conta pessoal: métricas de insights não disponíveis. Perfil, ${arroba} e link continuam funcionando.`
            : "Conta de criador.",
        };
  }

  switch (v.statusInsight) {
    case "DISPONIVEL":
      return {
        nivel: "ok",
        titulo: "Conectado com métricas",
        explicacao: `${ROTULO_TIPO[v.tipoConta]} ${arroba}, com insights respondendo.`,
      };
    case "INDISPONIVEL":
      return {
        // Business SEM insights é diferente de pessoal sem insights: aqui a
        // conta permite e a API não entregou — quase sempre permissão no token.
        nivel: "limitado",
        titulo: "Conectado, dados limitados",
        explicacao: "Insights indisponíveis para este tipo de conta ou para o token atual. Rode o diagnóstico para ver qual permissão falta.",
      };
    case "ERRO":
      return {
        nivel: "erro",
        titulo: "Conectado, métricas falhando",
        explicacao: "A consulta de insights retornou erro. Veja o diagnóstico para a mensagem da Meta.",
      };
    default:
      // "Instagram vinculado", e NÃO "conectado": o vínculo está salvo, mas
      // ninguém falou com a API por esta conta ainda. Chamar isto de conectado
      // faz o próximo passo (Testar) parecer opcional — foi assim que uma tela
      // inteira de vínculos salvos passou por não-salva.
      return {
        nivel: "pendente",
        titulo: "Instagram vinculado",
        explicacao: `Página ${pagina} e ${arroba} salvos. Rode Testar para verificar as métricas.`,
      };
  }
}

/**
 * A Página escolhida no seletor ainda NÃO é a Página salva.
 *
 * O seletor mostra o portfólio inteiro; salvar é o clique em Vincular. Sem esta
 * distinção na tela, escolher no seletor parece ter vinculado — e o cliente
 * aparece com uma Página que o banco não tem.
 */
export function selecaoPendente(a: { escolhido?: string | null; salvo?: string | null }): boolean {
  return !!a.escolhido && a.escolhido !== (a.salvo ?? null);
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
