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

// ─── Permissões: o que falta, e de quem é a falta ────────────────────────────
/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  "Sem permissão" tem três culpados diferentes, e conserto diferente em cada
 * ─────────────────────────────────────────────────────────────────────────────
 *  A Meta responde (#10) "Application does not have permission" para os três, e
 *  é por isso que ler o erro não basta:
 *
 *    TOKEN    o escopo não foi marcado quando o token foi gerado
 *             → gerar de novo, marcando a permissão
 *    ATIVO    o escopo existe, mas não alcança ESTA Página/Instagram
 *             → atribuir o ativo ao System User no Business Manager
 *    APP      escopo e ativo em ordem, e a Meta ainda recusa
 *             → Acesso Avançado / App Review do App, não do token
 *
 *  Mandar "confira instagram_manage_insights" nos três casos manda regerar o
 *  token duas vezes em três — e o token regerado volta com o mesmo erro, porque
 *  nunca foi ele o problema.
 *
 *  Quem separa os três é `debug_token`: ele devolve os escopos do token e, em
 *  `granular_scopes`, PARA QUAIS ativos cada escopo vale. Esta função só lê essa
 *  resposta; ela não adivinha nada.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** O que insights orgânicos do Instagram exigem, e por quê. */
export const PERMISSOES_INSIGHTS: ReadonlyArray<{ escopo: string; para: string }> = [
  { escopo: "pages_show_list", para: "listar as Páginas do portfólio" },
  { escopo: "instagram_basic", para: "ler o perfil do Instagram vinculado à Página" },
  { escopo: "instagram_manage_insights", para: "ler as métricas (reach, accounts_engaged, profile_views, total_interactions)" },
  { escopo: "pages_read_engagement", para: "ler o engajamento da Página" },
];

/** Escopo cujo ativo é o Instagram; os demais miram a Página. */
const ATIVO_DO_ESCOPO = (escopo: string): "instagram" | "pagina" =>
  escopo.startsWith("instagram_") ? "instagram" : "pagina";

export interface VereditoPermissao {
  /** Quem consertar primeiro. `nenhum` = não há o que apontar no token. */
  culpado: "token" | "ativo" | "app" | "indeterminado";
  faltandoNoToken: string[];
  semAcessoAoAtivo: string[];
  titulo: string;
  orientacao: string;
}

export function lerPermissoes(a: {
  escopos: string[];
  granular?: Array<{ scope: string; target_ids?: string[] }>;
  instagramUserId?: string | null;
  pageId?: string | null;
}): VereditoPermissao {
  const tem = new Set(a.escopos ?? []);
  const exigidos = PERMISSOES_INSIGHTS.map((p) => p.escopo);
  const faltandoNoToken = exigidos.filter((e) => !tem.has(e));

  // Escopo concedido, mas restrito a ativos que NÃO incluem o nosso. Lista vazia
  // ou ausente em granular_scopes significa "vale para todos" — não é restrição.
  const semAcessoAoAtivo: string[] = [];
  for (const escopo of exigidos) {
    if (!tem.has(escopo)) continue;
    const g = (a.granular ?? []).find((x) => x.scope === escopo);
    const alvos = g?.target_ids;
    if (!alvos || alvos.length === 0) continue;
    const nosso = ATIVO_DO_ESCOPO(escopo) === "instagram" ? a.instagramUserId : a.pageId;
    if (nosso && !alvos.includes(nosso)) semAcessoAoAtivo.push(escopo);
  }

  if (faltandoNoToken.length) {
    return {
      culpado: "token", faltandoNoToken, semAcessoAoAtivo,
      titulo: `Faltam permissões no token: ${faltandoNoToken.join(", ")}`,
      orientacao:
        `O token alcança a Página e o Instagram, mas não tem ${faltandoNoToken.join(" nem ")}. ` +
        "Gere um System User token novo marcando TODAS estas permissões: " +
        `${exigidos.join(", ")}. Marcar depois não altera um token já emitido — ele precisa ser gerado de novo.`,
    };
  }

  if (semAcessoAoAtivo.length) {
    return {
      culpado: "ativo", faltandoNoToken, semAcessoAoAtivo,
      titulo: "Permissão existe, mas não alcança este ativo",
      orientacao:
        `O token tem ${semAcessoAoAtivo.join(", ")}, porém a Meta restringiu esse acesso a outros ativos — ` +
        "esta Página/Instagram não está entre eles. Gerar outro token não resolve. " +
        "No Business Manager, atribua a Página (e o Instagram vinculado a ela) ao System User dono do token, " +
        "com acesso total, e teste de novo.",
    };
  }

  return {
    culpado: "app", faltandoNoToken, semAcessoAoAtivo,
    titulo: "Token e ativos em ordem — o bloqueio é do App",
    orientacao:
      "O token tem todas as permissões necessárias e elas alcançam esta Página/Instagram. " +
      "Uma recusa (#10) neste estado é do App, não do token: instagram_manage_insights precisa de " +
      "Acesso Avançado (Advanced Access) no App, e o produto Instagram Graph API precisa estar adicionado a ele. " +
      "Regerar o token não muda nada aqui — a mudança é em Meta for Developers → o App → Permissões e Recursos.",
  };
}
