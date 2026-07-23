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
  };
};

export type ProdutoWoo = { nome: string; quantidade: number; receita: number };
export type StatusPedido = { status: string; quantidade: number };

export type SnapWoo = {
  dia: string;
  metricsJson: {
    status?: "ok" | "sem_dados" | "erro";
    receita?: number | null;
    pedidos?: number | null;
    ticketMedio?: number | null;
    cupons?: { codigo: string; usos: number; desconto: number }[];
    // Já chegam no payload (o router devolve o metricsJson inteiro) — só não
    // eram tipados porque a v1 do Panorama não os lia.
    produtos?: ProdutoWoo[];
    pedidosPorStatus?: StatusPedido[];
    reembolsos?: number | null;
    cancelamentos?: number | null;
  };
};

export type ClientePanorama = {
  accountId: number;
  nome: string;
  fontes: FontePanorama[];
  loja: { platform: string; lastSyncAt: string | Date | null; lastSyncStatus: string | null; lastSyncError: string | null } | null;
  uptime: { dia: string; metricsJson: { status?: string } } | null;
  seguranca: { dia: string; metricsJson: { https?: boolean; sslValido?: boolean | null; daysToSslExpiry?: number | null; score?: number | null } } | null;
  pagespeed: { dia: string; metricsJson: { performanceScore?: number | null; lcp?: number | null } } | null;
  ga4_7d: SnapGA4 | null;
  ga4_30d: SnapGA4 | null;
  woo_7d: SnapWoo | null;
  woo_30d: SnapWoo | null;
};

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
  fonte: "woocommerce" | "ga4";
  rotuloFonte: string;
  janela: "7d" | "30d";
  dia: string;
  receita: number | null;
  pedidos: number | null;
  ticketMedio: number | null;
};

const wooTemDado = (s: SnapWoo | null): boolean => s?.metricsJson?.status === "ok";
const ga4Detectou = (s: SnapGA4 | null): boolean => s?.metricsJson?.ecommerce?.status === "detectado";

/**
 * Woo existe → Woo (receita real). Só GA4 detectou → GA4 (fonte inicial).
 * Nada → null (a célula vira "—" e o cliente não é penalizado).
 *
 * Woo prefere 30d (o 7d pode ser sem_dados numa loja de venda esparsa — caso
 * BAESH); GA4 prefere 7d, caindo para 30d, espelhando a aba Site (F5-A).
 */
export function vendasDe(c: ClientePanorama): Vendas | null {
  const woo = wooTemDado(c.woo_30d) ? { s: c.woo_30d!, janela: "30d" as const }
    : wooTemDado(c.woo_7d) ? { s: c.woo_7d!, janela: "7d" as const } : null;
  if (woo) {
    const m = woo.s.metricsJson;
    return {
      fonte: "woocommerce", rotuloFonte: "Woo", janela: woo.janela, dia: woo.s.dia,
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

export type Achado = {
  chave: string;
  severidade: "critico" | "atencao" | "info";
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
    if (f.status === "erro") {
      a.push({ chave: `fonte_${f.chave}`, severidade: "critico", texto: `${f.rotulo} com erro${f.porque ? ` — ${f.porque}` : ""}` });
    }
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
  const wooZerado = [{ s: c.woo_7d, j: "7d" }, { s: c.woo_30d, j: "30d" }]
    .find(({ s }) => wooTemDado(s) && (s!.metricsJson.pedidos ?? 0) > 0 && s!.metricsJson.receita === 0);
  if (wooZerado) {
    const m = wooZerado.s!.metricsJson;
    const cupom = m.cupons?.[0];
    a.push({
      chave: "pedido_pago_r0", severidade: "atencao",
      texto: `${m.pedidos} pedido${m.pedidos === 1 ? "" : "s"} pago${m.pedidos === 1 ? "" : "s"} somando R$ 0 em ${wooZerado.j}${cupom ? ` — cupom "${cupom.codigo}" descontou 100%` : ""} — teste interno ou cupom indevido?`,
    });
  } else if (funil && (funil.e.purchases ?? 0) > 0 && (funil.e.receita == null || funil.e.receita === 0)) {
    // Purchase sem valor no GA4 — só quando o Woo NÃO explicou a mesma coisa
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

// ─── Nível e ordenação ───────────────────────────────────────────────────────

export type Nivel = "critico" | "atencao" | "ok" | "sem_dados";

export type Avaliacao = { nivel: Nivel; motivos: string[]; achados: Achado[] };

const temAlgumDado = (c: ClientePanorama): boolean =>
  !!(c.uptime || c.seguranca || c.pagespeed || c.ga4_7d || c.ga4_30d || c.woo_7d || c.woo_30d);

/**
 * O nível é o pior achado — e os motivos são os textos dos achados, do pior
 * para o mais leve. "Sem dados" é neutro: nada conectado não é problema.
 */
export function avaliarCliente(c: ClientePanorama): Avaliacao {
  const achados = achadosDe(c);
  const criticos = achados.filter((x) => x.severidade === "critico");
  const atencoes = achados.filter((x) => x.severidade === "atencao");
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

// ─── Resumo do portfólio (stat tiles + barra de saúde) ───────────────────────

export type ResumoPortfolio = {
  totalClientes: number;
  precisamAtencao: number;
  criticos: number;
  atencoes: number;
  lojasWoo: number;
  achadosCriticos: number;
  achadosAtencao: number;
  /** Sempre nesta ordem — a barra empilhada não reordena por tamanho. */
  distribuicao: { nivel: Nivel; quantidade: number }[];
};

export function resumoPortfolio(
  avaliacoes: { nivel: Nivel; achados: Achado[] }[],
  clientes: ClientePanorama[],
): ResumoPortfolio {
  const conta = (n: Nivel) => avaliacoes.filter((a) => a.nivel === n).length;
  const achados = avaliacoes.flatMap((a) => a.achados);
  return {
    totalClientes: avaliacoes.length,
    precisamAtencao: conta("critico") + conta("atencao"),
    criticos: conta("critico"),
    atencoes: conta("atencao"),
    lojasWoo: clientes.filter((c) => c.loja?.platform === "woocommerce").length,
    achadosCriticos: achados.filter((x) => x.severidade === "critico").length,
    achadosAtencao: achados.filter((x) => x.severidade === "atencao").length,
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

// ─── Ranking de produtos e distribuição por status (Woo) ─────────────────────

/** O snapshot Woo que vale para o cliente — mesma preferência de vendasDe. */
function wooEscolhido(c: ClientePanorama): SnapWoo | null {
  if (wooTemDado(c.woo_30d)) return c.woo_30d;
  if (wooTemDado(c.woo_7d)) return c.woo_7d;
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
  const w = wooEscolhido(c);
  const produtos = w?.metricsJson.produtos;
  if (!w || !produtos || produtos.length === 0) return null;
  const janela: "7d" | "30d" = w === c.woo_30d ? "30d" : "7d";
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
  completed: "Concluídos", processing: "Processando", pending: "Pendentes",
  "on-hold": "Em espera", cancelled: "Cancelados", refunded: "Reembolsados", failed: "Falhos",
};
const TOM_STATUS: Record<string, "ok" | "atencao" | "critico" | "neutro"> = {
  completed: "ok", processing: "ok", pending: "atencao", "on-hold": "atencao",
  cancelled: "critico", refunded: "critico", failed: "critico",
};

export type DistribuicaoStatus = {
  janela: "7d" | "30d";
  total: number;
  itens: { status: string; rotulo: string; quantidade: number; tom: "ok" | "atencao" | "critico" | "neutro" }[];
};

export function distribuicaoStatus(c: ClientePanorama): DistribuicaoStatus | null {
  const w = wooEscolhido(c);
  const lista = w?.metricsJson.pedidosPorStatus;
  if (!w || !lista || lista.length === 0) return null;
  const janela: "7d" | "30d" = w === c.woo_30d ? "30d" : "7d";
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
