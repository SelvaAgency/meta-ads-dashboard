/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Jornalzinho executivo — leitura diária a partir dos dados REAIS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  Uma seção do digest de admin, montada dos snapshots já gravados (Panorama,
 *  lojas Woo/VNDA, GA4, saúde técnica, fontes). Reaproveita a MESMA lógica pura
 *  do Panorama (`@shared/panoramaLogic`) — Jornalzinho e Panorama nunca
 *  discordam. NADA de IA solta, fonte externa, ou soma indevida.
 *
 *  Regras que a seção herda por construção:
 *   · Woo/VNDA = receita real (a mesma métrica → PODEM somar entre si);
 *   · GA4 = funil/origem (nunca somado à receita real);
 *   · Meta/Google = mídia atribuída — FORA desta seção nesta versão;
 *   · cliente sem e-commerce não vira problema;
 *   · fonte atrasada/erro vira aviso, nunca número inventado;
 *   · toda linha carrega dado/fonte/data.
 *
 *  ENTREGA nesta etapa: gerar, salvar e auditar como paused — SEM envio real. A
 *  trava de envio vive no sendEmail (EMAIL_AUTOMATION_ENABLED); aqui só se monta
 *  o conteúdo.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import {
  avaliarCliente, ordenarClientes, resumoPortfolio, vendasDe, funilDe, rankingProdutos,
  type ClientePanorama, type Nivel,
} from "@shared/panoramaLogic";
import {
  getAllActiveMetaAdAccountsForListing, snapshotsParaPanorama, lojasParaPanorama,
  getAppSetting, setAppSetting, vndaContaComoLojaReal,
} from "../db";
import { fontesDeTodasAsContas } from "./fontesDoCliente";
import { logger } from "../logger";

// ─── Montagem dos clientes (mesmos readers do Panorama; router intocado) ─────

async function montarClientesPanorama(): Promise<ClientePanorama[]> {
  const [contas, fontes, snaps, lojas, vndaReal] = await Promise.all([
    getAllActiveMetaAdAccountsForListing(),
    fontesDeTodasAsContas(),
    snapshotsParaPanorama(),
    lojasParaPanorama(),
    vndaContaComoLojaReal(),
  ]);
  const fontesPorConta = new Map(fontes.map((f) => [f.accountId, f.fontes]));
  const lojaPorConta = new Map(lojas.map((l) => [l.accountId, l]));
  const snap = (accountId: number, provider: string, estrategia?: string) => {
    const s = snaps.find((x) => x.accountId === accountId && x.provider === provider &&
      (estrategia === undefined || x.estrategia === estrategia));
    return s ? { dia: s.dia, metricsJson: s.metricsJson as any } : null;
  };
  // Loja real: Woo OU VNDA (VNDA só quando o mapa foi validado — mesmo portão do Panorama).
  const lojaSnap = (accountId: number, estrategia: string) => {
    const s = snaps.find((x) => x.accountId === accountId && x.estrategia === estrategia &&
      (x.provider === "woocommerce" || (x.provider === "vnda" && vndaReal)));
    return s ? { dia: s.dia, metricsJson: s.metricsJson as any, provider: s.provider } : null;
  };
  return contas.map((c) => {
    const l7 = lojaSnap(c.id, "7d"), l30 = lojaSnap(c.id, "30d");
    return {
      accountId: c.id, nome: c.accountName ?? `Conta ${c.id}`,
      fontes: fontesPorConta.get(c.id) ?? [],
      loja: lojaPorConta.get(c.id) ?? null,
      plataformaLoja: (l30?.provider ?? l7?.provider ?? null) as any,
      uptime: snap(c.id, "uptime_check"), seguranca: snap(c.id, "security_check"), pagespeed: snap(c.id, "pagespeed"),
      ga4_7d: snap(c.id, "ga4", "7d"), ga4_30d: snap(c.id, "ga4", "30d"),
      loja_7d: l7, loja_30d: l30,
    } as ClientePanorama;
  });
}

// ─── Builder PURO das seções ─────────────────────────────────────────────────

export type Ciclos = {
  lojas?: { em?: string; total?: number; ok?: number; falhas?: number } | null;
  ga4?: { em?: string; total?: number; ok?: number; falhas?: number; semDados?: number } | null;
};

export type SecoesExecutivas = {
  dia: string;
  destaques: { totalClientes: number; precisamAtencao: number; criticos: number; atencoes: number; achadosCriticos: number; achadosAtencao: number; receitaRealLojas: number; lojasComReceita: number; trafegoGA4: number };
  atencaoPrimeiro: { nome: string; nivel: Nivel; motivo: string }[];
  vendasReais: { nome: string; fonte: string; receita: number | null; pedidos: number | null; ticket: number | null; dia: string }[];
  funil: { nome: string; janela: string; texto: string; dia: string }[];
  saudeTecnica: { nome: string; texto: string }[];
  fontesComErro: { nome: string; fonte: string; porque: string }[];
  oportunidades: { nome: string; texto: string }[];
  pendenciasManuais: { nome: string; texto: string }[];
  rodape: { fonte: string; info: string }[];
  vazio: boolean;
};

const brl = (v: number): string =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: v % 1 === 0 ? 0 : 2 }).format(v);
const fmtDia = (dia?: string): string => { const p = (dia ?? "").split("-"); return p[2] && p[1] ? `${p[2]}/${p[1]}` : (dia ?? "—"); };
const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

export function montarSecoesExecutivas(clientes: ClientePanorama[], dia: string, ciclos: Ciclos = {}): SecoesExecutivas {
  const avaliacoes = clientes.map((c) => ({ cliente: c, ...avaliarCliente(c) }));
  const resumo = resumoPortfolio(avaliacoes.map((a) => ({ nivel: a.nivel, achados: a.achados })), clientes);

  // Receita real de LOJAS (Woo + VNDA — mesma métrica; NUNCA GA4/Meta/Google).
  let receitaRealLojas = 0, lojasComReceita = 0, trafegoGA4 = 0;
  const vendas = clientes.map((c) => ({ c, v: vendasDe(c) }));
  for (const { v } of vendas) {
    if (v?.fonte === "loja" && v.receita != null) { receitaRealLojas += v.receita; lojasComReceita++; }
  }
  for (const c of clientes) trafegoGA4 += num(c.ga4_7d?.metricsJson?.sessions);

  // 2. Atenção primeiro — fila do Panorama (crítico → atenção), com motivo.
  const fila = ordenarClientes(avaliacoes.map((a) => ({ ...a, nome: a.cliente.nome })))
    .filter((a) => a.nivel === "critico" || a.nivel === "atencao");
  const atencaoPrimeiro = fila.map((a) => ({ nome: a.cliente.nome, nivel: a.nivel, motivo: a.motivos[0] ?? "—" }));

  // 3. Vendas reais por loja (só loja real: Woo/VNDA).
  const vendasReais = vendas
    .filter(({ v }) => v?.fonte === "loja")
    .map(({ c, v }) => ({ nome: c.nome, fonte: v!.rotuloFonte, receita: v!.receita, pedidos: v!.pedidos, ticket: v!.ticketMedio, dia: v!.dia }));

  // 4. Funil & comportamento — gargalos GA4 (achado medido).
  const funil = avaliacoes.flatMap((a) => {
    const f = funilDe(a.cliente); if (!f) return [];
    const g = a.achados.find((x) => x.chave === "vazamento_checkout" || x.chave === "vazamento_carrinho");
    return g ? [{ nome: a.cliente.nome, janela: f.janela, texto: g.texto, dia: f.dia }] : [];
  });

  // 5. Saúde técnica.
  const CHAVES_TEC = new Set(["fora_do_ar", "ssl_invalido", "ssl_expirando", "pagespeed_baixo"]);
  const saudeTecnica = avaliacoes.flatMap((a) =>
    a.achados.filter((x) => CHAVES_TEC.has(x.chave)).map((x) => ({ nome: a.cliente.nome, texto: x.texto })));

  // 6. Fontes com PROBLEMA — o sistema registrou falha (erro) ou a conexão
  //    precisa de ação (atenção: token expirado, sync antigo). ARKA (Meta
  //    "precisa de ação" desde 03/06) cai aqui. Ausente NUNCA entra.
  const fontesComErro = clientes.flatMap((c) =>
    c.fontes.filter((f) => f.status === "erro" || f.status === "atencao")
      .map((f) => ({ nome: c.nome, fonte: f.rotulo, porque: f.porque ?? "precisa de ação" })));

  // 7. Oportunidades — só com dado medido: produto em alta de loja com receita real.
  const oportunidades = vendas.flatMap(({ c, v }) => {
    if (v?.fonte !== "loja" || !(v.receita && v.receita > 0)) return [];
    const rk = rankingProdutos(c); if (!rk || rk.medida !== "receita" || !rk.itens[0]) return [];
    return [{ nome: c.nome, texto: `produto em alta: ${rk.itens[0].nome} (${brl(rk.itens[0].receita)} · ${rk.janela})` }];
  });

  // 8. Pendências manuais — fonte de AUTENTICAÇÃO (Meta/Google/GA4) que precisa
  //    de reconexão humana (erro ou atenção). É o caso do reconnect Meta da ARKA.
  const AUTH_SOURCES = new Set(["meta", "google_ads", "ga4"]);
  const pendenciasManuais = clientes.flatMap((c) =>
    c.fontes.filter((f) => AUTH_SOURCES.has(f.chave) && (f.status === "erro" || f.status === "atencao"))
      .map((f) => ({ nome: c.nome, texto: `reconectar ${f.rotulo} — ${f.porque ?? "a conexão precisa de ação"}` })));

  // 9. Rodapé de fontes — datas/ciclos + aviso de e-mail pausado.
  const rodape: { fonte: string; info: string }[] = [];
  if (ciclos.lojas) rodape.push({ fonte: "Lojas (Woo/VNDA)", info: `ciclo ${fmtDia(dia)} · ${ciclos.lojas.ok ?? "?"}/${ciclos.lojas.total ?? "?"} ok` });
  if (ciclos.ga4) rodape.push({ fonte: "GA4", info: `ciclo ${fmtDia(dia)} · ${ciclos.ga4.ok ?? "?"}/${ciclos.ga4.total ?? "?"} ok` });
  rodape.push({ fonte: "E-mail", info: "envio automático PAUSADO — este Jornalzinho não é enviado" });

  const destaques = {
    totalClientes: resumo.totalClientes, precisamAtencao: resumo.precisamAtencao,
    criticos: resumo.criticos, atencoes: resumo.atencoes,
    achadosCriticos: resumo.achadosCriticos, achadosAtencao: resumo.achadosAtencao,
    receitaRealLojas, lojasComReceita, trafegoGA4,
  };
  const vazio = clientes.length === 0;
  return { dia, destaques, atencaoPrimeiro, vendasReais, funil, saudeTecnica, fontesComErro, oportunidades, pendenciasManuais, rodape, vazio };
}

// ─── Render (curto, escaneável) ──────────────────────────────────────────────

const esc = (s: string): string => s.replace(/[&<>]/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[m]!));
const DOT: Record<Nivel, string> = { critico: "🔴", atencao: "🟡", ok: "🟢", sem_dados: "⚪" };

export function renderExecutivoTexto(s: SecoesExecutivas): string {
  const L: string[] = [];
  const d = s.destaques;
  L.push(`JORNALZINHO EXECUTIVO — ${fmtDia(s.dia)}`);
  L.push(`Destaques: ${d.totalClientes} clientes · ${d.precisamAtencao} precisam atenção (${d.criticos} crít · ${d.atencoes} atenção) · achados ${d.achadosCriticos}🔴/${d.achadosAtencao}🟡`);
  L.push(`Receita real de lojas (Woo+VNDA): ${brl(d.receitaRealLojas)} em ${d.lojasComReceita} loja(s) · tráfego GA4 7d: ${d.trafegoGA4.toLocaleString("pt-BR")} sessões`);
  if (s.atencaoPrimeiro.length) { L.push("\nAtenção primeiro:"); s.atencaoPrimeiro.forEach((a) => L.push(`  ${DOT[a.nivel]} ${a.nome} — ${a.motivo}`)); }
  if (s.vendasReais.length) { L.push("\nVendas reais por loja:"); s.vendasReais.forEach((v) => L.push(`  • ${v.nome} [${v.fonte}]: ${v.receita != null ? brl(v.receita) : "—"} · ${v.pedidos ?? "—"} ped · ticket ${v.ticket != null ? brl(v.ticket) : "—"} (${fmtDia(v.dia)})`)); }
  if (s.funil.length) { L.push("\nFunil & comportamento:"); s.funil.forEach((f) => L.push(`  • ${f.nome} [GA4 ${f.janela}]: ${f.texto}`)); }
  if (s.saudeTecnica.length) { L.push("\nSaúde técnica:"); s.saudeTecnica.forEach((t) => L.push(`  • ${t.nome}: ${t.texto}`)); }
  if (s.fontesComErro.length) { L.push("\nFontes com erro:"); s.fontesComErro.forEach((f) => L.push(`  • ${f.nome} — ${f.fonte}: ${f.porque}`)); }
  if (s.oportunidades.length) { L.push("\nOportunidades:"); s.oportunidades.forEach((o) => L.push(`  • ${o.nome}: ${o.texto}`)); }
  if (s.pendenciasManuais.length) { L.push("\nPendências manuais:"); s.pendenciasManuais.forEach((p) => L.push(`  • ${p.nome}: ${p.texto}`)); }
  L.push("\nFontes:"); s.rodape.forEach((r) => L.push(`  · ${r.fonte}: ${r.info}`));
  return L.join("\n");
}

export function renderExecutivoHtml(s: SecoesExecutivas): string {
  const d = s.destaques;
  const li = (arr: string[]) => arr.length ? `<ul style="margin:4px 0 10px;padding-left:18px">${arr.map((x) => `<li style="margin:2px 0">${x}</li>`).join("")}</ul>` : "";
  const h = (t: string) => `<p style="margin:12px 0 2px;font-weight:bold;font-size:13px;color:#111">${esc(t)}</p>`;
  const P: string[] = [];
  P.push(`<div style="font:13px/1.5 Arial,sans-serif;color:#222">`);
  P.push(`<p style="font-size:15px;font-weight:bold;margin:0 0 6px">Jornalzinho executivo — ${fmtDia(s.dia)}</p>`);
  P.push(h("Destaques do dia"));
  P.push(li([
    `${d.totalClientes} clientes · <strong>${d.precisamAtencao}</strong> precisam de atenção (${d.criticos} crítico · ${d.atencoes} atenção)`,
    `Achados: ${d.achadosCriticos} 🔴 · ${d.achadosAtencao} 🟡`,
    `Receita real de lojas (Woo+VNDA): <strong>${brl(d.receitaRealLojas)}</strong> em ${d.lojasComReceita} loja(s)`,
    `Tráfego GA4 (7d): ${d.trafegoGA4.toLocaleString("pt-BR")} sessões`,
  ]));
  if (s.atencaoPrimeiro.length) { P.push(h("Atenção primeiro")); P.push(li(s.atencaoPrimeiro.map((a) => `${DOT[a.nivel]} <strong>${esc(a.nome)}</strong> — ${esc(a.motivo)}`))); }
  if (s.vendasReais.length) { P.push(h("Vendas reais por loja")); P.push(li(s.vendasReais.map((v) => `<strong>${esc(v.nome)}</strong> [${esc(v.fonte)}]: ${v.receita != null ? brl(v.receita) : "—"} · ${v.pedidos ?? "—"} ped · ticket ${v.ticket != null ? brl(v.ticket) : "—"} <span style="color:#888">(${fmtDia(v.dia)})</span>`))); }
  if (s.funil.length) { P.push(h("Funil & comportamento")); P.push(li(s.funil.map((f) => `<strong>${esc(f.nome)}</strong> [GA4 ${f.janela}]: ${esc(f.texto)}`))); }
  if (s.saudeTecnica.length) { P.push(h("Saúde técnica")); P.push(li(s.saudeTecnica.map((t) => `<strong>${esc(t.nome)}</strong>: ${esc(t.texto)}`))); }
  if (s.fontesComErro.length) { P.push(h("Fontes com erro")); P.push(li(s.fontesComErro.map((f) => `<strong>${esc(f.nome)}</strong> — ${esc(f.fonte)}: ${esc(f.porque)}`))); }
  if (s.oportunidades.length) { P.push(h("Oportunidades")); P.push(li(s.oportunidades.map((o) => `<strong>${esc(o.nome)}</strong>: ${esc(o.texto)}`))); }
  if (s.pendenciasManuais.length) { P.push(h("Pendências manuais")); P.push(li(s.pendenciasManuais.map((p) => `<strong>${esc(p.nome)}</strong>: ${esc(p.texto)}`))); }
  P.push(`<p style="margin:12px 0 2px;font-size:11px;color:#888">Fontes: ${s.rodape.map((r) => `${esc(r.fonte)} (${esc(r.info)})`).join(" · ")}</p>`);
  P.push(`</div>`);
  return P.join("");
}

// ─── Orquestração: gerar + persistir (sem envio) ─────────────────────────────

export type JornalExecutivo = { dia: string; secoes: SecoesExecutivas; html: string; texto: string; geradoEm: string };

/** Gera a seção executiva do dia. Só leitura — nenhum envio, nenhuma credencial. */
export async function getJornalExecutivo(dia: string): Promise<JornalExecutivo> {
  const clientes = await montarClientesPanorama();
  const [lojas, ga4] = await Promise.all([
    getAppSetting<Ciclos["lojas"]>("woo:ultimoCiclo"),
    getAppSetting<Ciclos["ga4"]>("ga4:ultimoCiclo"),
  ]);
  const secoes = montarSecoesExecutivas(clientes, dia, { lojas, ga4 });
  return { dia, secoes, html: renderExecutivoHtml(secoes), texto: renderExecutivoTexto(secoes), geradoEm: new Date().toISOString() };
}

/**
 * Gera e PERSISTE o último Jornalzinho executivo em app_settings (KV existente,
 * sem migração), para visualizar no app sem re-rodar. NÃO envia nada.
 */
export async function gerarEPersistirExecutivo(dia: string): Promise<JornalExecutivo> {
  const j = await getJornalExecutivo(dia);
  await setAppSetting("jornalzinho:executivo", j);
  logger.info(`[JornalExecutivo] gerado e salvo (dia ${dia}) — ${j.secoes.atencaoPrimeiro.length} em atenção · ${j.secoes.vendasReais.length} lojas · SEM ENVIO`);
  return j;
}

export async function lerUltimoExecutivo(): Promise<JornalExecutivo | null> {
  return getAppSetting<JornalExecutivo>("jornalzinho:executivo");
}
