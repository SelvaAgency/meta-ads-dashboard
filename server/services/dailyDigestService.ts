/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Jornalzinho diário — um e-mail por pessoa, montado pelo PAPEL dela
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  Substitui o digest antigo, que era estruturalmente vazio: ele só incluía o
 *  que cada pessoa tivesse marcado como "no resumo do dia", e a tabela de
 *  preferências tinha UMA linha no sistema inteiro. Nenhum padrão do catálogo
 *  era "digest" — então o e-mail sempre saía com zero itens, por construção.
 *
 *  Agora o conteúdo vem do papel, não de escolha individual. Ninguém precisa
 *  configurar nada para receber o que lhe diz respeito, e ninguém consegue
 *  receber o que não lhe diz respeito.
 *
 *  Fora do digest de propósito: Trello e Calendar. Os dois já notificam por
 *  conta própria — duplicar seria só ruído (231 alertas de Trello em 14 dias).
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { logger } from "../logger";
import { sendEmail, isEmailConfigured, isDryRun, destinatariosDeTeste, transporteAtivo } from "../emailService";
import {
  financeAtrasos, aniversariantesDe, alertasDoDia, usuariosAtivosComEmail,
  registrarEnvioDigest, emailDigestJaEnviado, listarComunicados, type StatusDigest,
} from "../db";
import { obterBriefingDoDia } from "./briefingService";
import { getJornalExecutivo, type SecoesExecutivas } from "./jornalExecutivo";

export type Papel = "admin" | "developer" | "user";
export type BlocoDigest = "performance" | "financeiro" | "site" | "aniversarios" | "comunicados" | "executivo";

/**
 * A matriz é a regra de produto, num lugar só.
 *
 * Três domínios de informação, cada um com seu público:
 *
 *   performance (clientes/campanhas)  → admin + user
 *   site/clarity/técnico              → admin + developer
 *   financeiro                        → admin
 *
 * O developer NÃO recebe performance de cliente: ele cuida da parte técnica, e
 * resultado de campanha não é o trabalho dele. O user NÃO recebe site técnico
 * pela razão simétrica. Admin é o único que cruza os três.
 *
 * Aniversários e comunicados são institucionais e vão para todos — ninguém
 * escolhe receber ou não.
 *
 * Financeiro é checado aqui E no montador, de propósito. Regra de privacidade
 * que existe em um lugar só é regra que a próxima refatoração apaga sem
 * perceber.
 */
export const BLOCOS_POR_PAPEL: Record<Papel, BlocoDigest[]> = {
  admin:     ["performance", "financeiro", "site", "aniversarios", "comunicados"],
  developer: ["site", "aniversarios", "comunicados"],
  user:      ["performance", "aniversarios", "comunicados"],
};

const papelDe = (role: string | null | undefined): Papel =>
  role === "admin" ? "admin" : role === "developer" ? "developer" : "user";

const BRL = (c: number) => "R$ " + ((c ?? 0) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 });
const fmtData = (ymd: string) => { const [y, m, d] = ymd.split("-"); return `${d}/${m}/${y}`; };
const APP_URL = process.env.APP_URL ?? "https://spaces.selva.agency";

function escapar(s: string): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

/**
 * Junta conta e título sem repetir o nome.
 *
 * Vários alertas já nascem com o nome da conta no título ("CA - MNBR: queda de
 * CTR"), outros não ("Token expirado: CA - ARKA"). Prefixar sempre produzia
 * "CA - MNBR: CA - MNBR: queda de CTR" — feio e, num resumo executivo, custa
 * atenção de quem lê.
 */
function semRepetirConta(nome: string, titulo: string): { titulo: string; detalhe: string } {
  const limpo = titulo.trim();
  if (limpo.toLowerCase().startsWith(`${nome.toLowerCase()}:`)) {
    return { titulo: nome, detalhe: limpo.slice(nome.length + 1).trim() };
  }
  if (limpo.toLowerCase().includes(nome.toLowerCase())) {
    // Nome no meio ("Token expirado: CA - ARKA") — o título já se explica.
    return { titulo: limpo, detalhe: "" };
  }
  return { titulo: nome, detalhe: limpo };
}

// ─── Coletores de conteúdo ───────────────────────────────────────────────────
// Cada um devolve null quando não há nada — bloco vazio não vira seção.

export type Performance = {
  resumo: string | null;
  positivo: string | null;
  atencao: string | null;
  critico: string | null;
  contasCriticas: { nome: string; titulo: string }[];
  contasAtencao: { nome: string; titulo: string }[];
  anomalias: { nome: string; titulo: string; descricao: string }[];
};

export async function getPerformanceResumo(dia: string): Promise<Performance | null> {
  const [bruto, alertas] = await Promise.all([
    obterBriefingDoDia(dia).catch(() => null),
    alertasDoDia(dia, { dominios: ["PERFORMANCE"] }).catch(() => []),
  ]);

  let b = { resumo: null as string | null, positivo: null as string | null, atencao: null as string | null, critico: null as string | null };
  if (bruto) {
    try {
      const j = JSON.parse(bruto);
      b = { resumo: j.resumo ?? null, positivo: j.positivo ?? null, atencao: j.atencao ?? null, critico: j.critico ?? null };
    } catch { b.resumo = bruto.slice(0, 800); }
  }

  const nomeDe = (a: { accountName: string | null }) => a.accountName ?? "Conta sem nome";
  // SYNC_COMPLETE não é notícia para ninguém — 129 em 14 dias de puro ruído.
  const uteis = alertas.filter((a) => a.type !== "SYNC_COMPLETE");
  const rotular = (a: { accountName: string | null; title: string }) => semRepetirConta(nomeDe(a), a.title);
  const contasCriticas = uteis.filter((a) => a.severity === "CRITICAL").map((a) => { const r = rotular(a); return { nome: r.titulo, titulo: r.detalhe }; });
  const contasAtencao = uteis.filter((a) => a.severity === "WARNING").map((a) => { const r = rotular(a); return { nome: r.titulo, titulo: r.detalhe }; });
  const anomalias = uteis.filter((a) => a.type === "ANOMALY")
    .map((a) => { const r = rotular(a); return { nome: r.titulo, titulo: r.detalhe, descricao: String(a.message ?? "").slice(0, 220) }; });

  const vazio = !b.resumo && !b.positivo && !b.atencao && !b.critico
    && contasCriticas.length === 0 && contasAtencao.length === 0 && anomalias.length === 0;
  return vazio ? null : { ...b, contasCriticas, contasAtencao, anomalias };
}

export type Financeiro = Awaited<ReturnType<typeof financeAtrasos>>;

/** Só atraso real: vencimento < hoje e ainda pendente. Sem aviso antecipado. */
export async function getFinanceiroCritico(): Promise<Financeiro | null> {
  const a = await financeAtrasos().catch(() => null);
  return a && a.total > 0 ? a : null;
}

export type ItemSite = { titulo: string; detalhe: string; conta: string | null; grave: boolean };

export async function getSiteClarityCritico(dia: string): Promise<ItemSite[] | null> {
  const alertas = await alertasDoDia(dia, { dominios: ["SITE"], severidades: ["CRITICAL", "WARNING"] as const }).catch(() => []);
  if (alertas.length === 0) return null;
  return alertas.map((a) => {
    const r = semRepetirConta(a.accountName ?? "Site", a.title);
    return {
      titulo: r.detalhe || r.titulo,
      detalhe: String(a.message ?? "").slice(0, 220),
      conta: r.detalhe ? (a.accountName ?? null) : null,
      grave: a.severity === "CRITICAL",
    };
  });
}

export async function getAniversariosHoje(dia: string): Promise<{ nome: string; cargo: string | null }[] | null> {
  const [, m, d] = dia.split("-").map(Number);
  const lista = await aniversariantesDe(d, m).catch(() => []);
  if (lista.length === 0) return null;
  return lista.map((p) => ({ nome: p.name ?? "Alguém do time", cargo: p.jobTitle ?? null }));
}

export async function getComunicadosRelevantes(dia: string): Promise<{ titulo: string; corpo: string }[] | null> {
  const todos = await listarComunicados(20).catch(() => []);
  // Do dia ou fixado: comunicado antigo e não fixado já foi lido, não é notícia.
  const relevantes = todos.filter((c) => {
    const criadoEm = c.createdAt ? new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(c.createdAt)) : null;
    return c.fixado || criadoEm === dia;
  });
  if (relevantes.length === 0) return null;
  return relevantes.slice(0, 5).map((c) => ({ titulo: c.titulo, corpo: String(c.corpo ?? "").slice(0, 400) }));
}

// ─── Montagem ────────────────────────────────────────────────────────────────

export type DigestMontado = {
  papel: Papel;
  dia: string;
  blocos: BlocoDigest[];
  vazio: boolean;
  assunto: string;
  html: string;
  texto: string;
};

export async function buildDailyDigestForRole(role: string | null | undefined, dia: string): Promise<DigestMontado> {
  const papel = papelDe(role);
  const permitidos = new Set(BLOCOS_POR_PAPEL[papel]);

  const [perf, fin, site, niver, comun] = await Promise.all([
    permitidos.has("performance") ? getPerformanceResumo(dia) : null,
    // Segunda tranca, deliberada: mesmo que a matriz mude por engano, financeiro
    // não vaza para quem não é admin.
    permitidos.has("financeiro") && papel === "admin" ? getFinanceiroCritico() : null,
    permitidos.has("site") ? getSiteClarityCritico(dia) : null,
    permitidos.has("aniversarios") ? getAniversariosHoje(dia) : null,
    permitidos.has("comunicados") ? getComunicadosRelevantes(dia) : null,
  ]);

  // Seção executiva (Panorama/lojas/GA4/técnica) — SÓ admin, leitura cross-client.
  // Mesma lógica pura do Panorama; nunca envia nada (a trava vive no sendEmail).
  const exec = papel === "admin" ? await getJornalExecutivo(dia).catch(() => null) : null;

  const blocos: BlocoDigest[] = [];
  if (exec && !exec.secoes.vazio) blocos.push("executivo");
  if (perf) blocos.push("performance");
  if (fin) blocos.push("financeiro");
  if (site) blocos.push("site");
  if (niver) blocos.push("aniversarios");
  if (comun) blocos.push("comunicados");

  /**
   * O executivo entra como DADO (`exec.secoes`), não como HTML pronto.
   *
   * Antes era `SECAO("Leitura executiva do dia", exec.html) + montarHtml(...)`.
   * `SECAO()` devolve um `<tr>`, e essa concatenação o colocava FORA de
   * qualquer `<table>` — o parser descartava `<tr>`/`<td>` e despejava o
   * conteúdo solto no topo do e-mail, antes do card. Era a "leitura executiva
   * em texto corrido" que aparecia duplicando o bloco visual logo abaixo.
   *
   * Agora tudo é composto DENTRO da tabela, a partir dos dados estruturados.
   * `renderExecutivoHtml` continua existindo para a tela do app; o e-mail
   * simplesmente não o usa mais.
   */
  const conteudo: Conteudo = { dia, exec: exec && !exec.secoes.vazio ? exec.secoes : null, perf, fin, site, niver, comun };

  return {
    papel, dia, blocos, vazio: blocos.length === 0,
    assunto: `Jornalzinho SELVA — resumo diário — ${fmtData(dia).slice(0, 5)}`,
    html: montarHtml(conteudo),
    texto: montarTexto(conteudo),
  };
}

export type Conteudo = {
  dia: string;
  /** Seções executivas do dia (só admin). Dados, não HTML — ver acima. */
  exec: SecoesExecutivas | null;
  perf: Performance | null;
  fin: Financeiro | null;
  site: ItemSite[] | null;
  niver: { nome: string; cargo: string | null }[] | null;
  comun: { titulo: string; corpo: string }[] | null;
};

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Montagem do e-mail — 4 grupos, nesta ordem
 * ─────────────────────────────────────────────────────────────────────────────
 *   1. CRÍTICOS   — facultativo. Só aparece se houver crítico real, no topo e
 *                   destacado. Sem ele, o e-mail começa por Performance.
 *   2. PERFORMANCE — o bloco principal. Cards e números, não parágrafo.
 *   3. TÉCNICA     — enxuto de propósito: uma linha por achado.
 *   4. FINANCEIRO  — separado, no fim, para não se misturar com resultado.
 *
 *  Depois deles vem "Do time" (aniversários/comunicados), que é institucional e
 *  não compete com o conteúdo de trabalho.
 *
 *  ── Restrições de e-mail, não de web ───────────────────────────────────────
 *  O Gmail ignora flex, grid e a maior parte de CSS em <style>. Por isso TUDO
 *  aqui é tabela com estilo inline: os "cards" de KPI são <td>, não <div>. É
 *  feio de escrever e é o que sobrevive na caixa de entrada.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Sistema visual do e-mail
 * ─────────────────────────────────────────────────────────────────────────────
 *  O que fazia isto parecer "relatório de sistema" não era falta de estilo — era
 *  excesso: seis cores semânticas, borda em tudo, todo elemento com o mesmo
 *  peso, e nenhum ritmo vertical. Peça bem acabada é o contrário: paleta curta,
 *  hierarquia forte, muito respiro e pouquíssima moldura.
 *
 *  Decisões que sustentam o acabamento:
 *
 *   • UM acento (rosa da Selva). Vermelho/âmbar/verde entram só como
 *     SEMÂNTICA de estado, em tons profundos — vermelho-bombeiro e verde-limão
 *     são o que dá cara de alerta de sistema.
 *   • Régua fina no lugar de moldura. Separar com 1px de hairline em vez de
 *     caixa com borda deixa o olho seguir a coluna.
 *   • Número grande, rótulo pequeno em caixa-alta espaçada. É o contraste de
 *     escala que faz KPI ser lido antes do texto.
 *   • Ritmo de 4px. Todo espaçamento é múltiplo — é o que o olho lê como
 *     "alinhado" mesmo sem saber por quê.
 *
 *  ── O que o Gmail impõe ────────────────────────────────────────────────────
 *  `box-shadow` é removido; profundidade vem de hairline + fundo. Flex e grid
 *  são ignorados; colunas são <td>. CSS em <style> é descartado; tudo inline.
 *  Fonte de sistema, porque webfont não carrega.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const FONTE = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
const T = {
  acento:   "#E85BA8",
  tinta:    "#17171B",
  corpo:    "#4A4A55",
  suave:    "#8A8A96",
  regua:    "#EAEAEF",
  fundo:    "#F1F1F4",
  cartao:   "#FAFAFC",
  critico:  "#C4353A",
  atencao:  "#B26A00",
  bom:      "#17795E",
} as const;

/**
 * Cabeçalho de seção: rótulo curto + régua ocupando o resto da linha.
 * O traço faz o papel que a borda de caixa fazia, sem fechar o conteúdo.
 */
const SECAO = (titulo: string, corpo: string, tom: string = T.tinta) => `
  <tr><td style="padding:32px 32px 0">
    <table width="100%" style="border-collapse:collapse;margin:0 0 16px"><tr>
      <td style="white-space:nowrap;padding:0 14px 0 0;font:700 11px ${FONTE};color:${tom};letter-spacing:1.6px;text-transform:uppercase">${titulo}</td>
      <td style="border-top:1px solid ${T.regua};font-size:0;line-height:0">&nbsp;</td>
    </tr></table>
    ${corpo}
  </td></tr>`;

/** Item de lista: ponto colorido + texto. Substitui a barra lateral em tudo. */
const ITEM = (titulo: string, detalhe: string, tom: string) => `
  <table width="100%" style="border-collapse:collapse;margin:0 0 10px"><tr>
    <td width="14" valign="top" style="padding:6px 0 0"><div style="width:6px;height:6px;border-radius:3px;background:${tom}"></div></td>
    <td valign="top">
      <div style="font:600 14px/1.45 ${FONTE};color:${T.tinta}">${escapar(titulo)}</div>
      ${detalhe ? `<div style="margin:2px 0 0;font:400 13px/1.5 ${FONTE};color:${T.suave}">${escapar(detalhe)}</div>` : ""}
    </td>
  </tr></table>`;

/** Compatibilidade com o formato antigo de lista (mesma assinatura). */
const LINHA = (titulo: string, detalhe: string, cor: string) => ITEM(titulo, detalhe, cor);

/**
 * KPI: número grande, rótulo pequeno. Sem borda — só um fundo levíssimo, que
 * agrupa sem desenhar caixa.
 */
const KPI = (valor: string, rotulo: string, tom: string = T.tinta) => `
  <td width="25%" valign="top" style="padding:0 5px">
    <table width="100%" style="border-collapse:separate;background:${T.cartao};border-radius:12px">
      <tr><td style="padding:16px 12px;text-align:center">
        <div style="font:700 26px/1 ${FONTE};color:${tom};letter-spacing:-0.5px">${escapar(valor)}</div>
        <div style="margin:7px 0 0;font:600 10px ${FONTE};color:${T.suave};letter-spacing:1px;text-transform:uppercase">${escapar(rotulo)}</div>
      </td></tr>
    </table>
  </td>`;

/** Linha de KPIs. Máx. 4 — mais que isso o Gmail espreme no celular. */
// Sem margem negativa: o Gmail costuma descartá-la, e o alinhamento quebraria
// justamente no cliente que mais importa. O respiro entre cards vem do padding
// interno de cada <td>.
const LINHA_KPI = (cards: string[]) => cards.length === 0 ? "" : `
  <table width="100%" style="border-collapse:collapse;margin:0 0 10px"><tr>${cards.join("")}
    ${Array.from({ length: (4 - cards.length % 4) % 4 }, () => '<td width="25%"></td>').join("")}
  </tr></table>`;

const nBR = (v: number) => (v ?? 0).toLocaleString("pt-BR");
const brlCurto = (v: number) => "R$ " + (v ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 });

/** Bloco de alerta do grupo 1. Tom profundo, não vermelho de sistema. */
const CARD_CRITICO = (corpo: string) => `
  <table width="100%" style="border-collapse:separate;background:#FDF4F4;border-radius:12px">
    <tr>
      <td width="3" style="background:${T.critico};border-radius:12px 0 0 12px;font-size:0">&nbsp;</td>
      <td style="padding:18px 20px">${corpo}</td>
    </tr>
  </table>`;

/** Linha de destaque dentro do bloco crítico. */
const LINHA_CRITICA = (titulo: string, detalhe?: string) => `
  <div style="margin:0 0 8px">
    <span style="font:600 14px/1.5 ${FONTE};color:#7E2226">${escapar(titulo)}</span>${
    detalhe ? `<span style="font:400 14px/1.5 ${FONTE};color:#A05257"> — ${escapar(detalhe)}</span>` : ""}
  </div>`;

/** Tabela de números: cabeçalho discreto, régua fina, valor à direita. */
const TABELA = (cabecalhos: string[], linhas: string[]) => `
  <table width="100%" style="border-collapse:collapse;font:400 13px ${FONTE}">
    <tr>${cabecalhos.map((h, i) => `<td style="padding:0 0 8px;font:600 10px ${FONTE};color:${T.suave};letter-spacing:.8px;text-transform:uppercase;text-align:${i === 0 ? "left" : "right"}">${h}</td>`).join("")}</tr>
    ${linhas.join("")}
  </table>`;

const CELULA = (conteudo: string, alinhar: "left" | "right" = "left", cor: string = T.corpo, peso = 400) =>
  `<td style="padding:10px 0;border-top:1px solid ${T.regua};font:${peso} 13px ${FONTE};color:${cor};text-align:${alinhar};white-space:${alinhar === "right" ? "nowrap" : "normal"}">${conteudo}</td>`;

/** Link de saída da seção — discreto, sempre no mesmo lugar. */
const LINK = (href: string, texto: string) => `
  <div style="margin:18px 0 0"><a href="${href}" style="font:600 12px ${FONTE};color:${T.acento};text-decoration:none;letter-spacing:.3px">${texto} &rarr;</a></div>`;

export function montarHtml(c: Conteudo): string {
  const secoes: string[] = [];
  const ex = c.exec;

  /**
   * Memória de quem já apareceu, para o mesmo cliente não sair três vezes.
   *
   * As fontes se sobrepõem por natureza: um cliente com token expirado entra na
   * fila do Panorama (`atencaoPrimeiro`), vira alerta de mídia (`contasAtencao`)
   * e pode ter achado de site. Sem esta trava, o leitor vê o nome repetido e
   * precisa descobrir sozinho se é o mesmo problema — que é o ruído que o
   * Jornalzinho existe para evitar.
   *
   * A ordem de preferência é a de gravidade: quem sai em Críticos não repete em
   * Performance, e quem saiu em qualquer um dos dois não repete em Saúde
   * técnica.
   */
  const jaMostrado = new Set<string>();
  const chave = (nome: string) =>
    nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const marcar = (nome: string) => jaMostrado.add(chave(nome));

  // ── GRUPO 1 · CRÍTICOS (facultativo) ──────────────────────────────────────
  // Só entra com crítico REAL. Um bloco vermelho que aparece todo dia deixa de
  // ser visto — é a diferença entre alerta e enfeite.
  const criticos: string[] = [];
  if (c.perf?.critico) criticos.push(LINHA_CRITICA(c.perf.critico));
  for (const x of (c.perf?.contasCriticas ?? []).slice(0, 5)) { marcar(x.nome); criticos.push(LINHA_CRITICA(x.nome, x.titulo)); }
  for (const i of (c.site ?? []).filter((x) => x.grave).slice(0, 4)) {
    if (i.conta) marcar(i.conta);
    criticos.push(LINHA_CRITICA(i.conta ? `${i.conta}: ${i.titulo}` : i.titulo));
  }
  for (const f of (ex?.fontesComErro ?? []).slice(0, 4)) { marcar(f.nome); criticos.push(LINHA_CRITICA(f.nome, `${f.fonte}: ${f.porque}`)); }
  if (criticos.length > 0) {
    secoes.push(SECAO("Precisa de atenção agora", CARD_CRITICO(criticos.join("")), T.critico));
  }

  // ── GRUPO 2 · PERFORMANCE (bloco principal) ───────────────────────────────
  //
  // Os KPIs saem do Panorama (`ex.destaques`) quando existe — só admin — e, para
  // os demais papéis, são DERIVADOS do que a própria pessoa já recebe. Sem isso,
  // o colaborador via a mesma seção sem card nenhum: só texto, com cara do
  // template antigo. Nenhuma fonte nova de dado entra aqui; o não-admin conta o
  // que já está no `perf` dele.
  if (c.perf || ex) {
    const partes: string[] = [];

    if (ex) {
      const d = ex.destaques;
      partes.push(LINHA_KPI([
        KPI(nBR(d.totalClientes), "clientes"),
        KPI(nBR(d.criticos), "críticos", d.criticos > 0 ? T.critico : T.bom),
        KPI(nBR(d.atencoes), "em atenção", d.atencoes > 0 ? T.atencao : T.bom),
        KPI(nBR(d.totalClientes - d.precisamAtencao), "saudáveis", T.bom),
      ]));
    } else if (c.perf) {
      const nCrit = c.perf.contasCriticas.length;
      const nAten = c.perf.contasAtencao.length;
      const nAnom = c.perf.anomalias.length;
      if (nCrit + nAten + nAnom > 0) {
        partes.push(LINHA_KPI([
          KPI(nBR(nCrit), "críticos", nCrit > 0 ? T.critico : T.bom),
          KPI(nBR(nAten), "em atenção", nAten > 0 ? T.atencao : T.bom),
          KPI(nBR(nAnom), "anomalias", nAnom > 0 ? T.atencao : T.bom),
        ]));
      }
    }

    // Resumo textual CURTO e complementar — nunca o bloco principal.
    if (c.perf?.resumo) {
      partes.push(`<p style="margin:18px 0 0;font:400 14px/1.65 ${FONTE};color:${T.corpo}">${escapar(c.perf.resumo)}</p>`);
    }
    const nota = (texto: string, tom: string) =>
      `<div style="margin:10px 0 0;font:500 13px/1.5 ${FONTE};color:${tom}">${escapar(texto)}</div>`;
    if (c.perf?.positivo) partes.push(nota(c.perf.positivo, T.bom));
    if (c.perf?.atencao) partes.push(nota(c.perf.atencao, T.atencao));

    // Contas em atenção vindas de alerta de MÍDIA. A fila do Panorama saiu
    // daqui: ela virou parte da seção técnica única (grupo 3).
    const atencao = (c.perf?.contasAtencao ?? []).filter((x) => !jaMostrado.has(chave(x.nome))).slice(0, 5);
    if (atencao.length) {
      partes.push(`<div style="margin:26px 0 12px;font:600 11px ${FONTE};color:${T.suave};letter-spacing:1.2px;text-transform:uppercase">Contas em atenção</div>`);
      for (const x of atencao) { marcar(x.nome); partes.push(ITEM(x.nome, x.titulo, T.atencao)); }
    }

    partes.push(LINK(`${APP_URL}/dashboard`, "Abrir o Tracker"));
    if (partes.length) secoes.push(SECAO("Performance", partes.join("")));
  }

  // ── GRUPO 3 · SAÚDE TÉCNICA (seção única) ─────────────────────────────────
  //
  // "Olhar primeiro" (fila do Panorama) e "Técnica" eram duas seções que
  // frequentemente falavam do MESMO cliente por caminhos diferentes — o leitor
  // via o nome duas vezes e tinha que descobrir sozinho se era o mesmo problema.
  // Agora é uma seção só, e o `jaMostrado` garante que nada apareça duas vezes:
  // quem já saiu em Críticos ou em Performance não se repete aqui.
  const tec: string[] = [];
  const push = (nome: string, detalhe: string, tom: string) => {
    if (jaMostrado.has(chave(nome))) return;
    marcar(nome);
    tec.push(ITEM(nome, detalhe, tom));
  };
  for (const a of (ex?.atencaoPrimeiro ?? []).slice(0, 8)) {
    push(a.nome, a.motivo, a.nivel === "critico" ? T.critico : T.atencao);
  }
  for (const i of (c.site ?? []).filter((x) => !x.grave).slice(0, 6)) {
    push(i.conta ? `${i.conta}: ${i.titulo}` : i.titulo, "", T.atencao);
  }
  for (const t of (ex?.saudeTecnica ?? []).slice(0, 5)) push(t.nome, t.texto, "#6B7280");
  for (const pnd of (ex?.pendenciasManuais ?? []).slice(0, 4)) push(pnd.nome, pnd.texto, T.regua);
  if (tec.length) secoes.push(SECAO("Saúde técnica", tec.join("")));

  // ── GRUPO 4 · FINANCEIRO (separado, no fim) ───────────────────────────────
  if (c.fin) {
    const f = c.fin;
    const tabela = (itens: typeof f.aReceber, titulo: string, tom: string, comDesc: boolean) => itens.length === 0 ? "" : `
      <div style="margin:24px 0 10px;font:600 11px ${FONTE};color:${tom};letter-spacing:1.2px;text-transform:uppercase">${titulo}</div>
      ${TABELA(["Quem", "Venceu", "Atraso", "Valor"], itens.map((x) => `<tr>
        ${CELULA(`<strong style="color:${T.tinta};font-weight:600">${escapar(x.nome)}</strong>${comDesc && x.descricao !== x.nome ? `<br><span style="color:${T.suave};font-size:11px">${escapar(x.descricao)}</span>` : ""}`)}
        ${CELULA(fmtData(x.vencimento), "right", T.suave)}
        ${CELULA(`${x.dias}d`, "right", x.dias >= 30 ? T.critico : T.atencao, 600)}
        ${CELULA(BRL(x.valorCents), "right", T.tinta, 600)}
      </tr>`))}`;
    secoes.push(SECAO("Financeiro", `
      ${LINHA_KPI([
        KPI(nBR(f.total), "em atraso", T.critico),
        KPI(brlCurto((f.totalReceberCents ?? 0) / 100), "a receber", T.bom),
        KPI(brlCurto((f.totalPagarCents ?? 0) / 100), "a pagar", T.critico),
      ])}
      ${tabela(f.aReceber, `A receber · ${BRL(f.totalReceberCents)}`, T.bom, true)}
      ${tabela(f.aPagar, `A pagar · ${BRL(f.totalPagarCents)}`, T.critico, false)}
      ${LINK(`${APP_URL}/finance`, "Abrir o Financeiro")}`));
  }

  // ── Do time (institucional) ───────────────────────────────────────────────
  const time: string[] = [];
  for (const p of c.niver ?? []) {
    time.push(`<div style="margin:0 0 8px;font:400 14px/1.5 ${FONTE};color:${T.corpo}">🎉 <strong style="color:${T.tinta};font-weight:600">${escapar(p.nome)}</strong>${p.cargo ? ` · <span style="color:${T.suave}">${escapar(p.cargo)}</span>` : ""}</div>`);
  }
  for (const k of c.comun ?? []) time.push(ITEM(k.titulo, k.corpo, T.acento));
  if (time.length) secoes.push(SECAO("Do time", time.join("")));

  const diaExtenso = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long", day: "numeric", month: "long" })
    .format(new Date(`${c.dia}T12:00:00-03:00`));
  const capitalizado = diaExtenso.charAt(0).toUpperCase() + diaExtenso.slice(1);

  return `
<div style="background:${T.fundo};padding:32px 16px;font-family:${FONTE}">
  <table width="100%" style="max-width:640px;margin:0 auto;border-collapse:separate;background:#FFFFFF;border-radius:16px;overflow:hidden">

    <!-- Capa: marca discreta, data em destaque. O e-mail se apresenta antes de informar. -->
    <tr><td style="background:${T.tinta};padding:30px 32px 28px">
      <div style="font:700 10px ${FONTE};color:${T.acento};letter-spacing:2.6px;text-transform:uppercase">Jornalzinho Selva</div>
      <div style="margin:12px 0 0;font:600 21px/1.3 ${FONTE};color:#FFFFFF;letter-spacing:-0.3px">${escapar(capitalizado)}</div>
      <div style="margin:6px 0 0;font:400 13px ${FONTE};color:#8E8E9C">Seu resumo do dia, montado pelo seu perfil.</div>
    </td></tr>

    ${secoes.join("")}

    <tr><td style="padding:34px 32px 30px">
      <div style="border-top:1px solid ${T.regua};padding:16px 0 0;font:400 11px/1.6 ${FONTE};color:#A6A6B2">
        Enviado automaticamente pelo SELVA Spaces conforme o seu perfil.<br>
        <a href="${APP_URL}" style="color:${T.acento};text-decoration:none;font-weight:600">Abrir o Spaces</a>
      </div>
    </td></tr>
  </table>
</div>`;
}

/**
 * Versão texto puro — a parte `text/plain` do multipart, para cliente que não
 * renderiza HTML e para leitor de tela. NÃO é mostrada junto do HTML: o
 * multipart/alternative faz o cliente escolher UMA das duas. É por isso que
 * repetir o conteúdo aqui não duplica nada na caixa de entrada — o que duplicava
 * era o `<tr>` órfão no HTML, corrigido na origem.
 *
 * Segue os mesmos 4 grupos, para quem lê as duas versões não se perder.
 */
function montarTexto(c: Conteudo): string {
  const p: string[] = [`JORNALZINHO SELVA — ${fmtData(c.dia)}`];
  const ex = c.exec;

  // Mesma memória de deduplicação do HTML — as duas versões precisam contar a
  // mesma história, senão quem lê o texto puro vê repetição que o HTML não tem.
  const visto = new Set<string>();
  const k = (nome: string) =>
    nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

  const criticos: string[] = [];
  if (c.perf?.critico) criticos.push(c.perf.critico);
  for (const x of (c.perf?.contasCriticas ?? []).slice(0, 5)) { visto.add(k(x.nome)); criticos.push(`${x.nome}${x.titulo ? `: ${x.titulo}` : ""}`); }
  for (const i of (c.site ?? []).filter((x) => x.grave).slice(0, 4)) { if (i.conta) visto.add(k(i.conta)); criticos.push(`${i.conta ? i.conta + ": " : ""}${i.titulo}`); }
  for (const f of (ex?.fontesComErro ?? []).slice(0, 4)) { visto.add(k(f.nome)); criticos.push(`${f.nome} — ${f.fonte}: ${f.porque}`); }
  if (criticos.length) { p.push("\nPRECISA DE ATENÇÃO AGORA"); for (const x of criticos) p.push(`! ${x}`); }

  if (c.perf || ex) {
    p.push("\nPERFORMANCE");
    if (ex) {
      const d = ex.destaques;
      p.push(`${d.totalClientes} clientes · ${d.criticos} crítico(s) · ${d.atencoes} em atenção · ${d.totalClientes - d.precisamAtencao} saudáveis`);
    } else if (c.perf) {
      p.push(`${c.perf.contasCriticas.length} crítico(s) · ${c.perf.contasAtencao.length} em atenção · ${c.perf.anomalias.length} anomalia(s)`);
    }
    if (c.perf?.resumo) p.push(c.perf.resumo);
    if (c.perf?.positivo) p.push(`✅ ${c.perf.positivo}`);
    if (c.perf?.atencao) p.push(`⚠️ ${c.perf.atencao}`);
    for (const x of (c.perf?.contasAtencao ?? []).filter((y) => !visto.has(k(y.nome))).slice(0, 5)) {
      visto.add(k(x.nome));
      p.push(`• [atenção] ${x.nome}${x.titulo ? `: ${x.titulo}` : ""}`);
    }
  }

  // Seção técnica ÚNICA — espelha o HTML: fila do Panorama + site + saúde
  // técnica + pendências, sem repetir quem já apareceu acima.
  const tec: string[] = [];
  const addTec = (nome: string, detalhe: string) => {
    if (visto.has(k(nome))) return;
    visto.add(k(nome));
    tec.push(detalhe ? `${nome} — ${detalhe}` : nome);
  };
  for (const a of (ex?.atencaoPrimeiro ?? []).slice(0, 8)) addTec(a.nome, a.motivo);
  for (const i of (c.site ?? []).filter((x) => !x.grave).slice(0, 6)) addTec(`${i.conta ? i.conta + ": " : ""}${i.titulo}`, "");
  for (const t of (ex?.saudeTecnica ?? []).slice(0, 5)) addTec(t.nome, t.texto);
  for (const pnd of (ex?.pendenciasManuais ?? []).slice(0, 4)) addTec(pnd.nome, pnd.texto);
  if (tec.length) { p.push("\nSAÚDE TÉCNICA"); for (const x of tec) p.push(`• ${x}`); }

  if (c.fin) {
    p.push(`\nFINANCEIRO — ${c.fin.total} conta(s) em atraso, total ${BRL(c.fin.totalReceberCents + c.fin.totalPagarCents)}`);
    for (const x of [...c.fin.aReceber, ...c.fin.aPagar]) p.push(`• ${x.nome} — ${BRL(x.valorCents)} · venceu ${fmtData(x.vencimento)} · ${x.dias}d`);
  }

  if (c.niver || c.comun) {
    p.push("\nDO TIME");
    for (const n of c.niver ?? []) p.push(`🎉 ${n.nome}${n.cargo ? ` · ${n.cargo}` : ""}`);
    for (const k of c.comun ?? []) p.push(`• ${k.titulo}`);
  }
  return p.join("\n");
}

// ─── Envio ───────────────────────────────────────────────────────────────────

const dedupDe = (dia: string) => `DIGEST:${dia}`;

export type ResultadoDigestUsuario = {
  userId: number; email: string; papel: Papel;
  status: "enviado" | "falhou" | "pulado_vazio" | "pulado_duplicado";
  blocos: BlocoDigest[]; erro?: string;
};

/**
 * Traduz o resultado do sendEmail no status do recibo.
 *
 * Puro e exportado para ser testável: é ele que decide, indiretamente, quem
 * consome a trava de duplicata — só `sent` consome. Uma tradução errada aqui
 * significa ou digest duplicado, ou digest que nunca sai.
 */
export function statusDoRecibo(envio: {
  ok: boolean; dryRun: boolean; pausado?: boolean; bloqueado?: boolean; pulado?: boolean;
}): StatusDigest {
  if (envio.pausado) return "paused";   // antes de dryRun: pausa também devolve dryRun=true
  if (envio.bloqueado) return "blocked";
  if (envio.pulado) return "skipped";
  if (envio.dryRun) return "dry_run";
  return envio.ok ? "sent" : "failed";
}

export async function sendDailyDigestToUser(
  u: { id: number; name: string | null; email: string; role: string | null },
  dia: string,
  opts: { forcarReenvio?: boolean; tipo?: string } = {},
): Promise<ResultadoDigestUsuario> {
  const papel = papelDe(u.role);
  const base = { userId: u.id, email: u.email, papel };

  if (!opts.forcarReenvio && await emailDigestJaEnviado(u.id, dedupDe(dia))) {
    return { ...base, status: "pulado_duplicado", blocos: [] };
  }

  const d = await buildDailyDigestForRole(u.role, dia);
  if (d.vazio) return { ...base, status: "pulado_vazio", blocos: [] };

  const envio = await sendEmail({
    to: u.email, subject: d.assunto, html: d.html, text: d.texto,
    tipo: opts.tipo ?? "digest", userId: u.id, role: papel, blocos: d.blocos,
  });

  // O recibo grava o que REALMENTE aconteceu. Marcar "enviado" numa falha é o
  // que fazia o job parecer bem-sucedido enquanto ninguém recebia nada.
  //
  // A ordem importa: `pausado` também devolve dryRun=true, então checá-lo
  // primeiro é o que impede uma pausa ser registrada como ensaio. E `bloqueado`
  // precisa vir antes do genérico "falhou" — destinatário fora da política é
  // erro de configuração, não falha de entrega, e some no meio dos `failed`.
  await registrarEnvioDigest(u.id, dedupDe(dia), u.email, statusDoRecibo(envio));

  return envio.ok
    ? { ...base, status: "enviado", blocos: d.blocos }
    : { ...base, status: "falhou", blocos: d.blocos, erro: envio.erro };
}

export type ResultadoJob = {
  dia: string; transporte: string; dryRun: boolean; redirecionadoPara: string[];
  destinatarios: number; enviados: number; falhados: number; pulados: number;
  detalhes: ResultadoDigestUsuario[];
};

/** O job da manhã. Um digest por pessoa, conteúdo filtrado pelo papel dela. */
export async function runDailyDigestJob(dia: string, opts: { forcarReenvio?: boolean } = {}): Promise<ResultadoJob> {
  const vazio: ResultadoJob = {
    dia, transporte: transporteAtivo(), dryRun: isDryRun(), redirecionadoPara: destinatariosDeTeste(),
    destinatarios: 0, enviados: 0, falhados: 0, pulados: 0, detalhes: [],
  };
  if (!isEmailConfigured()) {
    logger.error("[Digest] Nenhum transporte de email configurado — digest não enviado.");
    return vazio;
  }

  const pessoas = await usuariosAtivosComEmail();
  logger.info(`[Digest] início · dia=${dia} · ${pessoas.length} destinatário(s) · transporte=${transporteAtivo()}${destinatariosDeTeste().length ? ` · DESVIADO para ${destinatariosDeTeste().join(", ")}` : ""}`);

  const detalhes: ResultadoDigestUsuario[] = [];
  for (const p of pessoas) {
    try {
      detalhes.push(await sendDailyDigestToUser(p as never, dia, opts));
    } catch (e) {
      detalhes.push({ userId: p.id, email: p.email, papel: papelDe((p as { role?: string }).role), status: "falhou", blocos: [], erro: (e as Error)?.message });
    }
  }

  const r: ResultadoJob = {
    ...vazio,
    destinatarios: pessoas.length,
    enviados: detalhes.filter((d) => d.status === "enviado").length,
    falhados: detalhes.filter((d) => d.status === "falhou").length,
    pulados: detalhes.filter((d) => d.status.startsWith("pulado")).length,
    detalhes,
  };
  logger.info(`[Digest] fim · ${r.enviados} enviado(s) · ${r.falhados} falha(s) · ${r.pulados} pulado(s)`);
  for (const d of detalhes.filter((x) => x.status === "falhou")) logger.error(`[Digest] falhou user#${d.userId} (${d.email}): ${d.erro}`);
  return r;
}

/**
 * "Enviar digest de teste agora".
 *
 * RECUSA sem EMAIL_TEST_RECIPIENT, em vez de cair na lista real. A regra vive no
 * servidor: teste que depende do front lembrar de restringir é teste que um dia
 * vai para a empresa inteira.
 */
export async function enviarDigestDeTeste(ator: { id: number; name: string | null; role: string | null }, dia: string) {
  const destinos = destinatariosDeTeste();
  if (destinos.length === 0) {
    throw new Error("Defina EMAIL_TEST_RECIPIENT antes de enviar o teste — sem ela o digest iria para os destinatários reais.");
  }
  const d = await buildDailyDigestForRole(ator.role, dia);
  const envio = await sendEmail({
    to: destinos[0], subject: d.assunto, html: d.html, text: d.texto,
    tipo: "digest_teste", userId: ator.id, role: d.papel, blocos: d.blocos,
  });
  return {
    dia, papel: d.papel, blocos: d.blocos, vazio: d.vazio,
    transporte: transporteAtivo(), destinos, ...envio,
  };
}

/** Quem receberia o quê, sem mandar nada — a prévia antes de qualquer disparo. */
export async function previewDigest(dia: string) {
  const pessoas = await usuariosAtivosComEmail();
  const porPapel = new Map<Papel, { nome: string | null; email: string }[]>();
  for (const p of pessoas) {
    const papel = papelDe((p as { role?: string }).role);
    if (!porPapel.has(papel)) porPapel.set(papel, []);
    porPapel.get(papel)!.push({ nome: p.name, email: p.email });
  }
  const jaEnviados: number[] = [];
  for (const p of pessoas) if (await emailDigestJaEnviado(p.id, dedupDe(dia))) jaEnviados.push(p.id);

  return {
    dia,
    total: pessoas.length,
    porPapel: (["admin", "developer", "user"] as Papel[]).map((papel) => ({
      papel, blocos: BLOCOS_POR_PAPEL[papel], pessoas: porPapel.get(papel) ?? [],
    })),
    jaEnviadosHoje: jaEnviados.length,
    dryRun: isDryRun(),
    transporte: transporteAtivo(),
    redirecionadoPara: destinatariosDeTeste(),
    emailConfigurado: isEmailConfigured(),
  };
}
