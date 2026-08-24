/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Panorama de Sites — o julgamento, puro
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  A tela responde UMA pergunta: "quais clientes precisam de atenção primeiro
 *  e por quê?". Este módulo transforma os dados crus do servidor em:
 *
 *   · nível por cliente (critico > atencao > ok > sem_dados) SEMPRE com os
 *     motivos — não existe ranking mágico, todo lugar na fila tem um porquê;
 *   · achados — regra sobre dado medido, sem IA e sem inferência solta;
 *   · a célula de Vendas com UMA fonte só: Woo quando o dado Woo existe
 *     (receita real da loja), GA4 quando só ele detectou (fonte inicial),
 *     traço quando não há e-commerce — e ausência NUNCA vira problema.
 *
 *  Regras herdadas do resto do sistema, de propósito:
 *   · nunca somar receita de fontes diferentes;
 *   · denominador zero/base pequena = sem julgamento, não 0%;
 *   · 403/WAF é bloqueio, não queda (caso UMA);
 *   · divergência Woo×GA4 não aparece — nem como erro, nem como aviso.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ─── Tipos do payload (espelham panorama.sites) ──────────────────────────────

import type { EventosGA4 } from "./eventosDoCliente";

export type FontePanorama = {
  chave: string;
  rotulo: string;
  status: "ok" | "atencao" | "erro" | "ausente";
  porque?: string;
};

export type EcomGA4 = {
  status: "detectado" | "sem_dados" | "indisponivel";
  receita: number | null;
  transacoes: number | null;
  ticketMedio: number | null;
  addToCart: number | null;
  beginCheckout: number | null;
  purchases: number | null;
  taxaCarrinhoCheckout: number | null;
  taxaCheckoutPurchase: number | null;
};

export type SnapGA4 = {
  dia: string;
  metricsJson: {
    sessions?: number;
    anterior?: { sessions?: number } | null;
    ecommerce?: EcomGA4 | null;
    /**
     * Os eventos de conversão acompanhados. Ausente nos snapshots anteriores.
     *
     * Vive aqui porque é aqui que o coletor grava, mas a LEITURA é da página do
     * cliente — ver `shared/eventosDoCliente`. O Panorama não os soma: cada site
     * tem estratégia de conversão própria, e a soma entre carteiras mede a
     * composição do portfólio, não performance.
     */
    eventos?: EventosGA4 | null;
  };
};

export type ProdutoWoo = { nome: string; quantidade: number; receita: number };
export type StatusPedido = { status: string; quantidade: number };

/**
 * Snapshot de LOJA REAL — o mesmo shape neutro para qualquer plataforma
 * (WooCommerce, VNDA/Olist, …). A agregação do servidor grava sempre este
 * formato, então a lógica de venda não precisa saber a plataforma para ler.
 */
export type SnapLoja = {
  dia: string;
  metricsJson: {
    status?: "ok" | "sem_dados" | "erro";
    receita?: number | null;
    pedidos?: number | null;
    ticketMedio?: number | null;
    cupons?: { codigo: string; usos: number; desconto: number }[];
    produtos?: ProdutoWoo[];
    pedidosPorStatus?: StatusPedido[];
    reembolsos?: number | null;
    cancelamentos?: number | null;
  };
};

/** Plataforma da loja real conectada, quando há uma. */
export type PlataformaLoja = "woocommerce" | "vnda" | "wix";

export type ClientePanorama = {
  accountId: number;
  nome: string;
  fontes: FontePanorama[];
  loja: { platform: string; lastSyncAt: string | Date | null; lastSyncStatus: string | null; lastSyncError: string | null } | null;
  /** Plataforma dos snapshots loja_* (Woo ou VNDA); null quando não há loja real. */
  plataformaLoja?: PlataformaLoja | string | null;
  uptime: { dia: string; metricsJson: { status?: string } } | null;
  seguranca: {
    dia: string;
    metricsJson: {
      https?: boolean; sslValido?: boolean | null; daysToSslExpiry?: number | null;
      score?: number | null;
      /**
       * O veredito do próprio verificador — `bom` · `atencao` · `critico`.
       *
       * Gravado por `checarSeguranca` junto com o score, e é a MESMA semântica
       * que a página individual do cliente mostra. Ler daqui em vez de
       * recalcular é o que impede as duas telas de divergirem.
       */
      status?: "bom" | "atencao" | "critico" | null;
      redirecionaParaHttps?: boolean | null;
    };
  } | null;
  pagespeed: { dia: string; metricsJson: { performanceScore?: number | null; lcp?: number | null } } | null;
  ga4_7d: SnapGA4 | null;
  ga4_30d: SnapGA4 | null;
  loja_7d: SnapLoja | null;
  loja_30d: SnapLoja | null;
};

/** Rótulo curto da plataforma para o chip de fonte de venda. */
/**
 * Rótulo curto da plataforma, para caber na célula do Panorama.
 *
 * Era `p === "vnda" ? "VNDA" : "Woo"` — mesmo defeito da tabela de Lojas: tudo
 * que não fosse VNDA virava Woo, então a receita da Wix apareceria etiquetada
 * como WooCommerce. Rótulo errado numa célula de receita é pior que rótulo
 * ausente: manda olhar a integração errada quando o número parecer estranho.
 *
 * O mapa é curto de propósito (a célula é estreita) e explícito: plataforma
 * nova sem rótulo aparece com o próprio id, não como "Woo".
 */
const ROTULO_CURTO: Record<string, string> = {
  woocommerce: "Woo",
  vnda: "VNDA",
  wix: "Wix",
  shopify: "Shopify",
};

export function rotuloPlataforma(p: ClientePanorama["plataformaLoja"]): string {
  return ROTULO_CURTO[String(p ?? "")] ?? String(p ?? "loja");
}

// ─── Limiares — declarados, não mágicos ──────────────────────────────────────

/** Abaixo disso, checkout→purchase é vazamento (BAESH: 6,7%). */
export const LIMIAR_CHECKOUT_PURCHASE = 30;
/** Abaixo disso, carrinho→checkout é vazamento (UMA: 24%). */
export const LIMIAR_CARRINHO_CHECKOUT = 40;
/** Base mínima de eventos para julgar taxa de funil — sem base, sem veredito. */
export const BASE_MINIMA_FUNIL = 20;
/** Queda de sessões 7d vs anterior que vira achado (com base mínima). */
export const QUEDA_FORTE_TRAFEGO = -40;
export const BASE_MINIMA_TRAFEGO = 100;
/** PageSpeed "muito baixo" — faixa vermelha do Lighthouse é < 50; 40 corta o extremo. */
export const PAGESPEED_MUITO_BAIXO = 40;

// ─── Vendas: uma fonte só ────────────────────────────────────────────────────

export type Vendas = {
  fonte: "loja" | "ga4";
  /** "woocommerce" | "vnda" quando fonte==="loja". */
  plataforma?: string | null;
  rotuloFonte: string;
  janela: "7d" | "30d";
  dia: string;
  receita: number | null;
  pedidos: number | null;
  ticketMedio: number | null;
};

const lojaTemDado = (s: SnapLoja | null): boolean => s?.metricsJson?.status === "ok";
const ga4Detectou = (s: SnapGA4 | null): boolean => s?.metricsJson?.ecommerce?.status === "detectado";

/**
 * Loja real (Woo OU VNDA) existe → receita real da loja. Só GA4 detectou → GA4
 * (fonte inicial). Nada → null (a célula vira "—", cliente não é penalizado).
 *
 * Loja prefere 30d (o 7d pode ser sem_dados numa loja de venda esparsa — caso
 * BAESH); GA4 prefere 7d, caindo para 30d, espelhando a aba Site (F5-A).
 */
export function vendasDe(c: ClientePanorama): Vendas | null {
  const loja = lojaTemDado(c.loja_30d) ? { s: c.loja_30d!, janela: "30d" as const }
    : lojaTemDado(c.loja_7d) ? { s: c.loja_7d!, janela: "7d" as const } : null;
  if (loja) {
    const m = loja.s.metricsJson;
    return {
      // Sem fallback de plataforma: inventar uma faz a origem do número mentir —
      // a receita da Wix apareceria etiquetada como Woo, e quem estranhasse o
      // valor iria conferir a integração errada.
      fonte: "loja", plataforma: (c.plataformaLoja ?? "loja") as PlataformaLoja,
      rotuloFonte: rotuloPlataforma(c.plataformaLoja), janela: loja.janela, dia: loja.s.dia,
      receita: m.receita ?? null, pedidos: m.pedidos ?? null, ticketMedio: m.ticketMedio ?? null,
    };
  }
  const ga4 = ga4Detectou(c.ga4_7d) ? { s: c.ga4_7d!, janela: "7d" as const }
    : ga4Detectou(c.ga4_30d) ? { s: c.ga4_30d!, janela: "30d" as const } : null;
  if (ga4) {
    const e = ga4.s.metricsJson.ecommerce!;
    return {
      fonte: "ga4", rotuloFonte: "GA4 — fonte inicial", janela: ga4.janela, dia: ga4.s.dia,
      receita: e.receita, pedidos: e.transacoes, ticketMedio: e.ticketMedio,
    };
  }
  return null;
}

// ─── Achados: regra sobre dado medido ────────────────────────────────────────

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Três naturezas de achado, e a terceira nasceu de um falso positivo real
 * ─────────────────────────────────────────────────────────────────────────────
 *    critico   o site ou a venda está quebrado AGORA
 *    atencao   merece investigação; pode não ser problema
 *    info      parece problema e não é
 *    medicao   NÓS não conseguimos medir — não é afirmação sobre o cliente
 *
 *  ── Por que `medicao` existe ───────────────────────────────────────────────
 *  O PageSpeed dá timeout na coleta da manhã e volta ao normal na remedição
 *  manual. Pela regra antiga isso virava `critico` — "fonte com erro" —, e o
 *  cliente aparecia em vermelho no Panorama e no Jornalzinho por um site que
 *  estava no ar, com SSL válido e recebendo tráfego.
 *
 *  Falha de medição não é falha do site. A distinção não é cosmética: ela muda
 *  quem entra em `nivel: "critico"`, e portanto quem a equipe vai olhar
 *  primeiro numa segunda-feira.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export type SeveridadeDoAchado = "critico" | "atencao" | "info" | "medicao";

/**
 * Fontes cujo erro é falha de MEDIÇÃO, e não problema do cliente.
 *
 * Um conjunto nomeado, e não um `if` por fonte: acrescentar a próxima é uma
 * linha, e a razão fica escrita num lugar só.
 *
 * Só `pagespeed` por enquanto, e é deliberado. Ele é um teste sintético de
 * laboratório — carrega a página num navegador remoto e cronometra —, e o
 * timeout dele diz respeito ao teste. Erro de GA4 ou de importação de loja
 * continua crítico: ali "não estamos recebendo dado" é um problema operacional
 * que alguém precisa resolver, e não um ruído que se resolve remedindo.
 */
export const FONTES_DE_MEDICAO = new Set(["pagespeed"]);

export type Achado = {
  chave: string;
  severidade: SeveridadeDoAchado;
  /**
   * `aberto` = problema real e ainda relevante.
   * `contextualizado` = existe nos dados, mas a equipe explicou e ele não conta
   * como problema. "Resolvido" não é um valor aqui: quando o problema sai dos
   * dados, a regra para de emitir o achado e ele simplesmente não existe mais.
   */
  status?: "aberto" | "contextualizado";
  texto: string;
  /** Aba da seção Site para investigar (deep-link /site?account=…&aba=…). */
  aba?: string;
};

const pct = (v: number): string => `${v.toFixed(1).replace(".", ",")}%`;

/** Funil da janela que detectou e-commerce — 7d primeiro, como na aba Site. */
export function funilDe(c: ClientePanorama): { e: EcomGA4; janela: "7d" | "30d"; dia: string } | null {
  if (ga4Detectou(c.ga4_7d)) return { e: c.ga4_7d!.metricsJson.ecommerce!, janela: "7d", dia: c.ga4_7d!.dia };
  if (ga4Detectou(c.ga4_30d)) return { e: c.ga4_30d!.metricsJson.ecommerce!, janela: "30d", dia: c.ga4_30d!.dia };
  return null;
}

export function achadosDe(c: ClientePanorama): Achado[] {
  const a: Achado[] = [];

  // ── Crítico: quebrado agora ──
  const up = c.uptime?.metricsJson?.status;
  if (up === "fora_do_ar") {
    a.push({ chave: "fora_do_ar", severidade: "critico", texto: "site fora do ar", aba: "uptime" });
  }
  const seg = c.seguranca?.metricsJson;
  if (seg && (seg.https === false || seg.sslValido === false || (typeof seg.daysToSslExpiry === "number" && seg.daysToSslExpiry <= 0))) {
    a.push({ chave: "ssl_invalido", severidade: "critico", texto: "SSL vencido ou HTTPS quebrado", aba: "seguranca" });
  } else if (seg && typeof seg.daysToSslExpiry === "number" && seg.daysToSslExpiry <= 7) {
    a.push({ chave: "ssl_expirando", severidade: "critico", texto: `certificado vence em ${seg.daysToSslExpiry} dia${seg.daysToSslExpiry === 1 ? "" : "s"}`, aba: "seguranca" });
  }
  // Fonte esperada quebrada: o SISTEMA registrou falha. Ausente nunca entra.
  for (const f of c.fontes) {
    if (f.status !== "erro") continue;
    /*
     * Falha de medição não entra como crítico.
     *
     * O PageSpeed dá timeout de manhã e volta na remedição manual: tratar isso
     * como "fonte com erro" pintava de vermelho um site no ar, com SSL válido e
     * recebendo tráfego. O achado CONTINUA existindo — a equipe precisa saber
     * que a medição falhou e refazê-la —, mas ele não decide o nível do cliente.
     */
    const medicao = FONTES_DE_MEDICAO.has(f.chave);
    a.push({
      chave: `fonte_${f.chave}`,
      severidade: medicao ? "medicao" : "critico",
      texto: medicao
        ? `${f.rotulo} · medição não concluída${f.porque ? ` — ${f.porque}` : ""}`
        : `${f.rotulo} com erro${f.porque ? ` — ${f.porque}` : ""}`,
      aba: medicao ? "tecnico" : undefined,
    });
  }
  if (c.loja?.lastSyncStatus === "erro") {
    a.push({ chave: "loja_sync", severidade: "critico", texto: `importação da loja falhou${c.loja.lastSyncError ? ` — ${c.loja.lastSyncError}` : ""}` });
  }

  // ── Atenção: vazando dinheiro ──
  const funil = funilDe(c);
  if (funil) {
    const { e, janela } = funil;
    if (e.taxaCheckoutPurchase != null && (e.beginCheckout ?? 0) >= BASE_MINIMA_FUNIL && e.taxaCheckoutPurchase < LIMIAR_CHECKOUT_PURCHASE) {
      a.push({
        chave: "vazamento_checkout", severidade: "atencao", aba: "performance",
        texto: `checkout convertendo ${pct(e.taxaCheckoutPurchase)} (${e.beginCheckout} iniciaram, ${e.purchases ?? 0} compraram · ${janela})`,
      });
    } else if (e.taxaCarrinhoCheckout != null && (e.addToCart ?? 0) >= BASE_MINIMA_FUNIL && e.taxaCarrinhoCheckout < LIMIAR_CARRINHO_CHECKOUT) {
      a.push({
        chave: "vazamento_carrinho", severidade: "atencao", aba: "performance",
        texto: `só ${pct(e.taxaCarrinhoCheckout)} do carrinho chegam ao checkout (${janela})`,
      });
    }
  }

  // Pedidos pagos somando R$ 0 (caso Scaffold: cupom de 100% em pedido de teste)
  const lojaZerada = [{ s: c.loja_7d, j: "7d" }, { s: c.loja_30d, j: "30d" }]
    .find(({ s }) => lojaTemDado(s) && (s!.metricsJson.pedidos ?? 0) > 0 && s!.metricsJson.receita === 0);
  if (lojaZerada) {
    const m = lojaZerada.s!.metricsJson;
    const cupom = m.cupons?.[0];
    a.push({
      chave: "pedido_pago_r0", severidade: "atencao",
      texto: `${m.pedidos} pedido${m.pedidos === 1 ? "" : "s"} pago${m.pedidos === 1 ? "" : "s"} somando R$ 0 em ${lojaZerada.j}${cupom ? ` — cupom "${cupom.codigo}" descontou 100%` : ""} — teste interno ou cupom indevido?`,
    });
  } else if (funil && (funil.e.purchases ?? 0) > 0 && (funil.e.receita == null || funil.e.receita === 0)) {
    // Purchase sem valor no GA4 — só quando a LOJA NÃO explicou a mesma coisa
    // (senão o mesmo pedido de teste viraria dois achados).
    a.push({
      chave: "purchase_sem_valor", severidade: "atencao", aba: "performance",
      texto: `purchase sem valor no GA4 (${funil.e.purchases} compra${funil.e.purchases === 1 ? "" : "s"}, receita zerada) — tagueamento sem value?`,
    });
  }

  // Queda forte de tráfego — só com base real no período anterior
  const t = c.ga4_7d?.metricsJson;
  if (t && typeof t.sessions === "number" && typeof t.anterior?.sessions === "number" && t.anterior.sessions >= BASE_MINIMA_TRAFEGO) {
    const varPct = ((t.sessions - t.anterior.sessions) / t.anterior.sessions) * 100;
    if (varPct <= QUEDA_FORTE_TRAFEGO) {
      a.push({
        chave: "queda_trafego", severidade: "atencao", aba: "performance",
        texto: `sessões caíram ${pct(Math.abs(varPct))} vs semana anterior (${t.anterior.sessions} → ${t.sessions})`,
      });
    }
  }

  const ps = c.pagespeed?.metricsJson?.performanceScore;
  if (typeof ps === "number" && ps < PAGESPEED_MUITO_BAIXO) {
    a.push({ chave: "pagespeed_baixo", severidade: "atencao", texto: `PageSpeed em ${ps}/100`, aba: "tecnico" });
  }

  // ── Info: parece problema, não é ──
  if (up === "bloqueado") {
    a.push({ chave: "waf", severidade: "info", texto: "acesso bloqueado por WAF (403) — não é queda", aba: "uptime" });
  }

  return a;
}

/**
 * Subconjunto COMERCIAL dos achados — o que o Bloco Comercial do cliente mostra.
 * São exatamente os achados de venda que `achadosDe` já calcula por regra medida
 * (sem IA, sem inferência): pedido pago R$0/cupom 100%, purchase sem valor,
 * checkout baixo, carrinho vazando, queda de tráfego com possível impacto.
 *
 * Reusa a MESMA função — o Bloco Comercial e o Panorama nunca discordam sobre
 * um problema de venda.
 */
export const CHAVES_COMERCIAIS = new Set([
  "pedido_pago_r0", "purchase_sem_valor", "vazamento_checkout", "vazamento_carrinho", "queda_trafego",
]);

export function achadosComerciais(c: ClientePanorama): Achado[] {
  return achadosDe(c).filter((a) => CHAVES_COMERCIAIS.has(a.chave));
}

// ─── Nível e ordenação ───────────────────────────────────────────────────────

export type Nivel = "critico" | "atencao" | "ok" | "sem_dados";

export type Avaliacao = { nivel: Nivel; motivos: string[]; achados: Achado[] };

const temAlgumDado = (c: ClientePanorama): boolean =>
  !!(c.uptime || c.seguranca || c.pagespeed || c.ga4_7d || c.ga4_30d || c.loja_7d || c.loja_30d);

/**
 * O nível é o pior achado — e os motivos são os textos dos achados, do pior
 * para o mais leve. "Sem dados" é neutro: nada conectado não é problema.
 */
/**
 * Avalia um cliente, aplicando o contexto que a equipe deu a cada achado.
 *
 * ── Por que o contexto entra AQUI e não depois ──────────────────────────────
 * Tudo desce desta função: os contadores do Panorama, a lista "Atenção
 * primeiro", a saúde do portfólio, o adendo do cabeçalho e o jornalzinho.
 * Aplicar o contexto depois — na redação da IA — deixava os NÚMEROS intactos:
 * o alerta explicado continuava inflando "Achados abertos" e mantendo o cliente
 * em "Precisam atenção", enquanto o texto ao lado dizia que estava resolvido.
 *
 * Era a inconsistência exata do pedido. Entrando aqui, a explicação vale em toda
 * tela de uma vez, sem cada consumidor precisar saber que contexto existe.
 *
 * ── O dado não muda; a CLASSIFICAÇÃO muda ──────────────────────────────────
 * 28,7% continua 28,7%, e o achado continua na lista com o texto original. Ele
 * ganha `status: "contextualizado"` e para de contar como problema aberto — é
 * disso que "DADO ≠ INTERPRETAÇÃO" é feito na camada de regra. Remover o
 * contexto devolve o achado ao estado aberto, porque nada foi apagado.
 *
 * ── Só o contexto de PONTO muda status, e isso é deliberado ─────────────────
 * O contexto da conta é texto livre e não nomeia achado nenhum — decidir por ele
 * quais chaves silenciar exigiria uma chamada de modelo, e aí os contadores do
 * portfólio passariam a depender de IA: não determinísticos, não cacheáveis, não
 * testáveis. O contexto da conta continua governando a INTERPRETAÇÃO (a prosa da
 * análise); o do ponto governa a CLASSIFICAÇÃO.
 */
export function avaliarCliente(
  c: ClientePanorama,
  contextosDePonto: Array<{ chave: string; texto: string }> = [],
): Avaliacao {
  const explicados = new Set(
    contextosDePonto.filter((x) => x.texto?.trim()).map((x) => x.chave),
  );
  const achados = achadosDe(c).map((a) => ({
    ...a,
    status: explicados.has(a.chave) ? ("contextualizado" as const) : ("aberto" as const),
  }));

  // O nível do cliente olha só o que continua ABERTO. Sem isso, um cliente com
  // um único alerta já explicado seguiria em "Precisam atenção" para sempre.
  const abertos = achados.filter((x) => x.status === "aberto");
  const criticos = abertos.filter((x) => x.severidade === "critico");
  const atencoes = abertos.filter((x) => x.severidade === "atencao");
  if (criticos.length) return { nivel: "critico", motivos: [...criticos, ...atencoes].map((x) => x.texto), achados };
  if (atencoes.length) return { nivel: "atencao", motivos: atencoes.map((x) => x.texto), achados };
  if (temAlgumDado(c)) return { nivel: "ok", motivos: [], achados };
  return { nivel: "sem_dados", motivos: [], achados };
}

const PESO: Record<Nivel, number> = { critico: 0, atencao: 1, ok: 2, sem_dados: 3 };

export function ordenarClientes<T extends { nivel: Nivel; nome: string }>(linhas: T[]): T[] {
  return [...linhas].sort((a, b) => PESO[a.nivel] - PESO[b.nivel] || a.nome.localeCompare(b.nome, "pt-BR"));
}

// ─── Formatação das células ──────────────────────────────────────────────────

export const fmtBRL = (v: number): string =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: v % 1 === 0 ? 0 : 2 }).format(v);

export const fmtDia = (dia: string): string => {
  const [, m, d] = dia.split("-");
  return m && d ? `${d}/${m}` : dia;
};

export type Celula = {
  valor: string;
  detalhe?: string;
  fonte?: string;
  dia?: string;
  estado: "ok" | "atencao" | "critico" | "vazio";
};

export function celulaSaude(c: ClientePanorama): Celula {
  const up = c.uptime?.metricsJson?.status;
  const seg = c.seguranca?.metricsJson;
  const ps = c.pagespeed?.metricsJson?.performanceScore;
  if (!c.uptime && !c.seguranca && !c.pagespeed) return { valor: "—", estado: "vazio" };
  if (up === "fora_do_ar") return { valor: "fora do ar", fonte: "checks", dia: c.uptime!.dia, estado: "critico" };
  if (seg && (seg.https === false || seg.sslValido === false)) {
    return { valor: "SSL quebrado", fonte: "checks", dia: c.seguranca!.dia, estado: "critico" };
  }
  if (up === "bloqueado") return { valor: "WAF 403", detalhe: "não é queda", fonte: "checks", dia: c.uptime!.dia, estado: "atencao" };
  const partes: string[] = [];
  if (up === "no_ar") partes.push("no ar");
  if (typeof ps === "number") partes.push(`PS ${ps}`);
  return {
    valor: partes.join(" · ") || "medido",
    fonte: "checks", dia: (c.pagespeed ?? c.uptime ?? c.seguranca)!.dia,
    estado: typeof ps === "number" && ps < PAGESPEED_MUITO_BAIXO ? "atencao" : "ok",
  };
}

export function celulaTrafego(c: ClientePanorama): Celula {
  const m = c.ga4_7d?.metricsJson;
  if (!m || typeof m.sessions !== "number") return { valor: "—", estado: "vazio" };
  const ant = m.anterior?.sessions;
  const detalhe = typeof ant === "number" && ant > 0
    ? `${((m.sessions - ant) / ant * 100) >= 0 ? "+" : ""}${(((m.sessions - ant) / ant) * 100).toFixed(0)}% vs anterior`
    : undefined;
  return {
    valor: `${m.sessions.toLocaleString("pt-BR")} sessões`, detalhe,
    fonte: "GA4 · 7d", dia: c.ga4_7d!.dia, estado: "ok",
  };
}

export function celulaFunil(c: ClientePanorama): Celula {
  const f = funilDe(c);
  if (!f) return { valor: "—", estado: "vazio" };
  const { e, janela } = f;
  const taxa = e.taxaCheckoutPurchase;
  const fraco = taxa != null && (e.beginCheckout ?? 0) >= BASE_MINIMA_FUNIL && taxa < LIMIAR_CHECKOUT_PURCHASE;
  return {
    valor: `${e.purchases ?? 0} compra${(e.purchases ?? 0) === 1 ? "" : "s"}`,
    detalhe: taxa != null ? `checkout→compra ${pct(taxa)}` : undefined,
    fonte: `GA4 · ${janela}`, dia: f.dia, estado: fraco ? "atencao" : "ok",
  };
}

export function celulaVendas(c: ClientePanorama): Celula {
  const v = vendasDe(c);
  if (!v) return { valor: "—", detalhe: "sem loja conectada e sem e-commerce no GA4", estado: "vazio" };
  return {
    valor: v.receita != null ? fmtBRL(v.receita) : "receita indisponível",
    detalhe: v.pedidos != null ? `${v.pedidos} pedido${v.pedidos === 1 ? "" : "s"}${v.ticketMedio != null ? ` · ticket ${fmtBRL(v.ticketMedio)}` : ""}` : undefined,
    fonte: `${v.rotuloFonte} · ${v.janela}`, dia: v.dia,
    estado: v.receita === 0 && (v.pedidos ?? 0) > 0 ? "atencao" : "ok",
  };
}

/** true quando a venda vem de loja REAL (Woo/VNDA), não de GA4 fonte inicial. */
export const vendaDeLojaReal = (v: Vendas | null): boolean => v?.fonte === "loja";

// ─── Resumo do portfólio (stat tiles + barra de saúde) ───────────────────────

export type ResumoPortfolio = {
  totalClientes: number;
  precisamAtencao: number;
  criticos: number;
  atencoes: number;
  lojasConectadas: number;
  achadosCriticos: number;
  achadosAtencao: number;
  /**
   * Medições que o sistema não conseguiu concluir.
   *
   * Conta SEPARADO dos achados, e nunca dentro deles: somar "PageSpeed deu
   * timeout" a "checkout vazando" produziria um contador que sobe por dois
   * motivos incomparáveis — um pede remedir, o outro pede agir.
   */
  falhasDeMedicao: number;
  /** Sempre nesta ordem — a barra empilhada não reordena por tamanho. */
  distribuicao: { nivel: Nivel; quantidade: number }[];
};

export function resumoPortfolio(
  avaliacoes: { nivel: Nivel; achados: Achado[] }[],
  clientes: ClientePanorama[],
): ResumoPortfolio {
  const conta = (n: Nivel) => avaliacoes.filter((a) => a.nivel === n).length;
  // Só os ABERTOS entram na contagem. Um achado contextualizado continua na
  // lista (o fato foi observado), mas deixou de ser problema a resolver — e
  // contá-lo faria "Achados abertos" nunca baixar depois de uma explicação.
  const achados = avaliacoes.flatMap((a) => a.achados).filter((x) => x.status !== "contextualizado");
  return {
    totalClientes: avaliacoes.length,
    precisamAtencao: conta("critico") + conta("atencao"),
    criticos: conta("critico"),
    atencoes: conta("atencao"),
    lojasConectadas: clientes.filter((c) => c.loja?.platform === "woocommerce" || c.loja?.platform === "vnda" || c.loja?.platform === "wix").length,
    achadosCriticos: achados.filter((x) => x.severidade === "critico").length,
    achadosAtencao: achados.filter((x) => x.severidade === "atencao").length,
    falhasDeMedicao: achados.filter((x) => x.severidade === "medicao").length,
    distribuicao: (["critico", "atencao", "ok", "sem_dados"] as Nivel[])
      .map((nivel) => ({ nivel, quantidade: conta(nivel) })),
  };
}

// ─── Funil visual ────────────────────────────────────────────────────────────

export type EtapaFunil = {
  nome: string;
  chave: "add_to_cart" | "begin_checkout" | "purchase";
  /** Absoluto medido — null quando o GA4 não devolveu a etapa (vira "—"). */
  valor: number | null;
  /** Passagem da etapa ANTERIOR para esta. null na primeira e sem base. */
  taxaPassagem: number | null;
  /** Quantos se perderam da etapa anterior para esta. null sem base. */
  perda: number | null;
};

export type FunilVisual = {
  janela: "7d" | "30d";
  dia: string;
  /** begin_checkout < BASE_MINIMA_FUNIL — as taxas ainda valem, mas com ressalva. */
  amostraPequena: boolean;
  etapas: EtapaFunil[];
};

/** Passagem só com denominador real: sem base é null, nunca 0%. */
const passagem = (atual: number | null, anterior: number | null): number | null =>
  atual != null && anterior != null && anterior > 0 ? (atual / anterior) * 100 : null;

export function funilVisual(c: ClientePanorama): FunilVisual | null {
  const f = funilDe(c);
  if (!f) return null;
  const { e, janela, dia } = f;
  const add = e.addToCart ?? null;
  const chk = e.beginCheckout ?? null;
  const buy = e.purchases ?? null;
  const perda = (atual: number | null, anterior: number | null): number | null =>
    atual != null && anterior != null ? Math.max(0, anterior - atual) : null;
  return {
    janela, dia,
    amostraPequena: chk != null && chk < BASE_MINIMA_FUNIL,
    etapas: [
      { nome: "Carrinho", chave: "add_to_cart", valor: add, taxaPassagem: null, perda: null },
      { nome: "Checkout", chave: "begin_checkout", valor: chk, taxaPassagem: passagem(chk, add), perda: perda(chk, add) },
      { nome: "Compra", chave: "purchase", valor: buy, taxaPassagem: passagem(buy, chk), perda: perda(buy, chk) },
    ],
  };
}

// ─── Ranking de produtos e distribuição por status (loja real) ───────────────

/** O snapshot de loja que vale para o cliente — mesma preferência de vendasDe. */
function lojaEscolhida(c: ClientePanorama): SnapLoja | null {
  if (lojaTemDado(c.loja_30d)) return c.loja_30d;
  if (lojaTemDado(c.loja_7d)) return c.loja_7d;
  return null;
}

export type RankingProdutos = {
  janela: "7d" | "30d";
  medida: "receita" | "quantidade";
  itens: (ProdutoWoo & { valor: number })[];
  /** Ressalva honesta quando a receita foi zerada (cupom 100% — caso Scaffold). */
  observacao?: string;
};

/**
 * Ranking de produtos. Se toda a receita está zerada (pedidos pagos com cupom
 * de 100%), a medida vira QUANTIDADE — barras por receita seriam todas zero,
 * uma mentira visual. A ressalva deixa claro que os pedidos existem e são R$ 0.
 */
export function rankingProdutos(c: ClientePanorama, limite = 5): RankingProdutos | null {
  const w = lojaEscolhida(c);
  const produtos = w?.metricsJson.produtos;
  if (!w || !produtos || produtos.length === 0) return null;
  const janela: "7d" | "30d" = w === c.loja_30d ? "30d" : "7d";
  const receitaTotal = produtos.reduce((a, p) => a + (p.receita ?? 0), 0);
  const usaReceita = receitaTotal > 0;
  const medida: "receita" | "quantidade" = usaReceita ? "receita" : "quantidade";
  const itens = produtos
    .map((p) => ({ ...p, valor: medida === "receita" ? (p.receita ?? 0) : (p.quantidade ?? 0) }))
    .filter((p) => p.valor > 0)            // nunca barra falsa de valor zero
    .sort((a, b) => b.valor - a.valor)
    .slice(0, limite);
  if (itens.length === 0) return null;
  return {
    janela, medida, itens,
    observacao: usaReceita ? undefined : "Receita zerada por desconto de 100% — ranking por quantidade vendida.",
  };
}

const ROTULO_STATUS: Record<string, string> = {
  // WooCommerce
  completed: "Concluídos", processing: "Processando", pending: "Pendentes",
  "on-hold": "Em espera", cancelled: "Cancelados", refunded: "Reembolsados", failed: "Falhos",
  // VNDA / Olist
  confirmed: "Confirmados", received: "Recebidos", canceled: "Cancelados",
};
const TOM_STATUS: Record<string, "ok" | "atencao" | "critico" | "neutro"> = {
  completed: "ok", processing: "ok", pending: "atencao", "on-hold": "atencao",
  cancelled: "critico", refunded: "critico", failed: "critico",
  confirmed: "ok", received: "atencao", canceled: "critico",
};

export type DistribuicaoStatus = {
  janela: "7d" | "30d";
  total: number;
  itens: { status: string; rotulo: string; quantidade: number; tom: "ok" | "atencao" | "critico" | "neutro" }[];
};

export function distribuicaoStatus(c: ClientePanorama): DistribuicaoStatus | null {
  const w = lojaEscolhida(c);
  const lista = w?.metricsJson.pedidosPorStatus;
  if (!w || !lista || lista.length === 0) return null;
  const janela: "7d" | "30d" = w === c.loja_30d ? "30d" : "7d";
  const total = lista.reduce((a, s) => a + s.quantidade, 0);
  if (total === 0) return null;
  return {
    janela, total,
    itens: [...lista]
      .sort((a, b) => b.quantidade - a.quantidade)
      .map((s) => ({
        status: s.status, quantidade: s.quantidade,
        rotulo: ROTULO_STATUS[s.status] ?? (s.status.charAt(0).toUpperCase() + s.status.slice(1)),
        tom: TOM_STATUS[s.status] ?? "neutro",
      })),
  };
}

/** Clientes que entram na seção E-commerce — só quem tem base real. */
export function temEcommerce(c: ClientePanorama): boolean {
  return vendasDe(c) !== null;
}

// ─── Segurança do portfólio ──────────────────────────────────────────────────

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Segurança — indicador próprio, ao lado do PageSpeed
 * ─────────────────────────────────────────────────────────────────────────────
 *  HTTPS e validade de certificado são binários e verificáveis: ou o site serve
 *  em HTTPS ou não; ou o certificado vence em N dias ou não. É a leitura mais
 *  objetiva do portfólio inteiro, e ficava diluída dentro de `celulaSaude`,
 *  competindo com PageSpeed e uptime numa string só.
 *
 *  ── O `score` ENTRA, e a composição dele está escrita ─────────────────────
 *  Uma revisão anterior o deixou de fora por supor que a fórmula não estava
 *  documentada. Ela está, em `server/services/siteHealthService.ts`, e é
 *  inteiramente explicável por deduções nomeadas a partir de 100:
 *
 *    −40  sem HTTPS                    −20  HSTS ausente
 *    −30  certificado inválido         −20  CSP ausente
 *    −10  sem redirect http→https      −15  X-Frame-Options ausente
 *    −20  certificado vence em ≤7d     −10  X-Content-Type-Options ausente
 *    −10  certificado vence em ≤30d    −10  Referrer-Policy ausente
 *                                       −5  Permissions-Policy ausente
 *
 *  O `status` (`bom` · `atencao` · `critico`) vem gravado junto, e é o MESMO
 *  que a página individual do cliente exibe. Lê-lo daqui, em vez de recalcular,
 *  é o que impede as duas telas de discordarem sobre o mesmo site.
 *
 *  ── E ele NÃO entra na saúde geral ─────────────────────────────────────────
 *  `avaliarCliente` continua exatamente como estava. Segurança é um indicador
 *  ao lado do PageSpeed, e não um segundo critério de nível — um site com
 *  headers faltando não é "crítico"; é um site com headers faltando.
 *
 *  ── Dias até vencer é o único número aqui, e ele é medido ──────────────────
 *  Vem de `daysToSslExpiry`, direto do certificado. Não é estimativa.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Dias de antecedência a partir dos quais o vencimento vira aviso. */
export const SSL_AVISO_DIAS = 30;
/** Abaixo disto o vencimento é crítico — o mesmo corte que `achadosDe` usa. */
export const SSL_CRITICO_DIAS = 7;

export type EstadoDeSeguranca = "ok" | "expirando" | "quebrado" | "sem_medicao";

export interface SegurancaDoSite {
  accountId: number;
  nome: string;
  estado: EstadoDeSeguranca;
  https: boolean | null;
  sslValido: boolean | null;
  /** Dias até o certificado vencer. `null` quando não medido. */
  diasParaVencer: number | null;
  /** 0–100, com a composição documentada acima. `null` quando não medido. */
  score: number | null;
  /** O veredito do verificador, como a página do cliente também mostra. */
  status: "bom" | "atencao" | "critico" | null;
  redirecionaParaHttps: boolean | null;
  dia: string | null;
}

/**
 * A leitura compacta de segurança de um site — a linha da tabela.
 *
 * Ordem: o que quebra primeiro, o que vence depois, o que falta por último. Um
 * site sem HTTPS não precisa que ninguém leia a nota de headers antes.
 */
export function resumoDeSeguranca(s: SegurancaDoSite): {
  texto: string; tom: "ok" | "atencao" | "critico" | "vazio";
} {
  if (s.estado === "sem_medicao") return { texto: "sem verificação", tom: "vazio" };
  if (s.https === false) return { texto: "sem HTTPS", tom: "critico" };
  if (s.sslValido === false) return { texto: "certificado inválido", tom: "critico" };
  if (s.diasParaVencer != null && s.diasParaVencer <= 0) {
    return { texto: "certificado vencido", tom: "critico" };
  }
  if (s.diasParaVencer != null && s.diasParaVencer <= SSL_CRITICO_DIAS) {
    return { texto: `vence em ${s.diasParaVencer}d`, tom: "critico" };
  }
  if (s.diasParaVencer != null && s.diasParaVencer <= SSL_AVISO_DIAS) {
    return { texto: `vence em ${s.diasParaVencer}d`, tom: "atencao" };
  }
  // Nada quebrado e nada vencendo: o que sobra é o que a nota mede — headers.
  // O tom sai do `status` do verificador, e não de um corte nosso.
  const base = s.diasParaVencer != null ? `SSL ${s.diasParaVencer}d` : "SSL válido";
  return {
    texto: base,
    tom: s.status === "atencao" ? "atencao" : "ok",
  };
}

export interface SegurancaDoPortfolio {
  sites: SegurancaDoSite[];
  ok: number;
  expirando: number;
  quebrado: number;
  semMedicao: number;
  /** Os que pedem ação, do mais urgente para o menos. Vazio é resposta boa. */
  urgentes: SegurancaDoSite[];
  /** O certificado que vence primeiro, entre os medidos. */
  proximoVencimento: SegurancaDoSite | null;
}

export function segurancaDoSite(c: ClientePanorama): SegurancaDoSite {
  const m = c.seguranca?.metricsJson;
  const base = {
    accountId: c.accountId, nome: c.nome,
    https: m?.https ?? null,
    sslValido: m?.sslValido ?? null,
    diasParaVencer: typeof m?.daysToSslExpiry === "number" ? m.daysToSslExpiry : null,
    score: typeof m?.score === "number" ? m.score : null,
    status: m?.status ?? null,
    redirecionaParaHttps: m?.redirecionaParaHttps ?? null,
    dia: c.seguranca?.dia ?? null,
  };
  // Sem snapshot não se afirma nada. "Sem medição" não é "inseguro" — e pintar
  // de vermelho quem não foi medido faria a equipe caçar um problema nosso.
  if (!c.seguranca || !m) return { ...base, estado: "sem_medicao" };
  if (m.https === false || m.sslValido === false
      || (typeof m.daysToSslExpiry === "number" && m.daysToSslExpiry <= 0)) {
    return { ...base, estado: "quebrado" };
  }
  if (typeof m.daysToSslExpiry === "number" && m.daysToSslExpiry <= SSL_AVISO_DIAS) {
    return { ...base, estado: "expirando" };
  }
  return { ...base, estado: "ok" };
}

const PESO_SEGURANCA: Record<EstadoDeSeguranca, number> = {
  quebrado: 0, expirando: 1, sem_medicao: 2, ok: 3,
};

export function segurancaDoPortfolio(clientes: ClientePanorama[]): SegurancaDoPortfolio {
  const sites = clientes.map(segurancaDoSite);
  const conta = (e: EstadoDeSeguranca) => sites.filter((s) => s.estado === e).length;
  const medidos = sites.filter((s) => s.diasParaVencer != null);
  return {
    sites,
    ok: conta("ok"),
    expirando: conta("expirando"),
    quebrado: conta("quebrado"),
    semMedicao: conta("sem_medicao"),
    urgentes: sites
      .filter((s) => s.estado === "quebrado" || s.estado === "expirando")
      .sort((a, b) => PESO_SEGURANCA[a.estado] - PESO_SEGURANCA[b.estado]
        || (a.diasParaVencer ?? 1e9) - (b.diasParaVencer ?? 1e9)),
    // Entre os MEDIDOS: um site sem medição não tem "próximo vencimento", e
    // colocá-lo aqui como 0 dias inventaria uma urgência.
    proximoVencimento: medidos.length
      ? medidos.slice().sort((a, b) => (a.diasParaVencer ?? 0) - (b.diasParaVencer ?? 0))[0]
      : null,
  };
}

// ─── O indicador de cada site ────────────────────────────────────────────────

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Cada site mostra o melhor indicador QUE ELE TEM — e diz qual é
 * ─────────────────────────────────────────────────────────────────────────────
 *  Não existe uma métrica que cubra o portfólio inteiro. PageSpeed exige site
 *  configurado; GA4 exige propriedade conectada; receita exige loja. A
 *  interseção pode ser vazia, e forçar uma coluna única exigiria inventar um
 *  score composto — um número sem fonte, com aparência de medida.
 *
 *  A saída é honesta e mais útil: cada card mostra o indicador mais objetivo
 *  disponível para aquele site, NOMEADO, com unidade e fonte. Quem lê sabe que
 *  a Elwing está sendo avaliada por PageSpeed e a Ultramalhas por uptime — em
 *  vez de achar que os dois números são a mesma régua.
 *
 *  ── A ordem é de objetividade, e não de preferência ────────────────────────
 *    1. PageSpeed   escala 0–100, mesmo método, comparável entre sites
 *    2. Uptime      binário e verificável
 *    3. Tráfego     só a VARIAÇÃO — sessões absolutas medem tamanho do cliente
 *
 *  Sessões absolutas ficam fora de propósito: 2.000 da UMA e 200 da Elwing não
 *  se comparam, e exibi-las lado a lado como "o indicador" convidaria a isso.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export type ChaveDoIndicador = "pagespeed" | "uptime" | "trafego" | "nenhum";

export interface IndicadorDoSite {
  chave: ChaveDoIndicador;
  /** O nome do que está sendo medido — sempre visível no card. */
  rotulo: string;
  /** O valor pronto para a tela. "—" quando não há indicador. */
  valor: string;
  /** A unidade/escala, para o número não ficar solto. */
  unidade: string | null;
  fonte: string | null;
  dia: string | null;
  /** `true` só onde a comparação entre clientes é legítima. */
  comparavel: boolean;
  estado: "ok" | "atencao" | "critico" | "vazio";
}

export function indicadorDoSite(c: ClientePanorama): IndicadorDoSite {
  const ps = c.pagespeed?.metricsJson?.performanceScore;
  if (typeof ps === "number") {
    return {
      chave: "pagespeed", rotulo: "PageSpeed", valor: String(Math.round(ps)),
      unidade: "de 100", fonte: "PageSpeed · mobile", dia: c.pagespeed!.dia,
      comparavel: true,
      estado: ps < PAGESPEED_MUITO_BAIXO ? "atencao" : "ok",
    };
  }

  const up = c.uptime?.metricsJson?.status;
  if (up) {
    const rotulos: Record<string, { v: string; e: IndicadorDoSite["estado"] }> = {
      no_ar: { v: "No ar", e: "ok" },
      fora_do_ar: { v: "Fora do ar", e: "critico" },
      bloqueado: { v: "WAF 403", e: "atencao" },
    };
    const r = rotulos[up] ?? { v: up, e: "ok" as const };
    return {
      chave: "uptime", rotulo: "Disponibilidade", valor: r.v, unidade: null,
      fonte: "Verificação de uptime", dia: c.uptime!.dia,
      // Comparável em forma, mas não é escala: dois "No ar" não se ordenam.
      comparavel: false, estado: r.e,
    };
  }

  const t = c.ga4_7d?.metricsJson;
  const ant = t?.anterior?.sessions;
  if (typeof t?.sessions === "number" && typeof ant === "number" && ant > 0) {
    const varPct = ((t.sessions - ant) / ant) * 100;
    return {
      chave: "trafego", rotulo: "Tráfego 7d",
      valor: `${varPct >= 0 ? "+" : ""}${varPct.toFixed(0)}%`,
      unidade: "vs. período anterior", fonte: "GA4 · 7d", dia: c.ga4_7d!.dia,
      // Variação é de cada site contra SI MESMO — ordenar clientes por ela
      // compararia velocidades de mudança, não estados. Fora do ranking.
      comparavel: false,
      estado: varPct <= QUEDA_FORTE_TRAFEGO ? "atencao" : "ok",
    };
  }

  return {
    chave: "nenhum", rotulo: "Sem medição técnica", valor: "—",
    unidade: null, fonte: null, dia: null, comparavel: false, estado: "vazio",
  };
}

/**
 * Quantos sites do portfólio têm a métrica comparável.
 *
 * A tela usa isto para dizer "8 de 13 sites têm medição de PageSpeed" em cima
 * do ranking. Sem essa frase, um ranking de 8 linhas num portfólio de 13 se lê
 * como o portfólio inteiro — e os 5 ausentes parecem os piores.
 */
export function coberturaComparavel(clientes: ClientePanorama[]): { com: number; total: number } {
  return {
    com: clientes.filter((c) => indicadorDoSite(c).comparavel).length,
    total: clientes.length,
  };
}
