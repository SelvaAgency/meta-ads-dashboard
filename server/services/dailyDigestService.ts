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
  registrarEnvioDigest, emailDigestJaEnviado, listarComunicados,
} from "../db";
import { obterBriefingDoDia } from "./briefingService";

export type Papel = "admin" | "developer" | "user";
export type BlocoDigest = "performance" | "financeiro" | "site" | "aniversarios" | "comunicados";

/**
 * A matriz é a regra de produto, num lugar só.
 *
 * Financeiro é o único bloco restrito, e a restrição está aqui E no montador —
 * de propósito. Regra de privacidade que existe em um lugar só é regra que a
 * próxima refatoração apaga sem perceber.
 */
export const BLOCOS_POR_PAPEL: Record<Papel, BlocoDigest[]> = {
  admin:     ["performance", "financeiro", "site", "aniversarios", "comunicados"],
  developer: ["performance", "site", "aniversarios", "comunicados"],
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

  const blocos: BlocoDigest[] = [];
  if (perf) blocos.push("performance");
  if (fin) blocos.push("financeiro");
  if (site) blocos.push("site");
  if (niver) blocos.push("aniversarios");
  if (comun) blocos.push("comunicados");

  return {
    papel, dia, blocos, vazio: blocos.length === 0,
    assunto: `Jornalzinho SELVA — resumo diário — ${fmtData(dia).slice(0, 5)}`,
    html: montarHtml({ dia, perf, fin, site, niver, comun }),
    texto: montarTexto({ dia, perf, fin, site, niver, comun }),
  };
}

type Conteudo = {
  dia: string;
  perf: Performance | null;
  fin: Financeiro | null;
  site: ItemSite[] | null;
  niver: { nome: string; cargo: string | null }[] | null;
  comun: { titulo: string; corpo: string }[] | null;
};

const SECAO = (titulo: string, corpo: string) => `
  <tr><td style="padding:20px 24px 0">
    <p style="margin:0 0 10px;font:bold 11px Arial,sans-serif;color:#E85BA8;letter-spacing:1.2px;text-transform:uppercase">${titulo}</p>
    ${corpo}
  </td></tr>`;

const LINHA = (titulo: string, detalhe: string, cor: string) => `
  <div style="border-left:3px solid ${cor};padding:6px 0 6px 10px;margin:8px 0">
    <p style="margin:0;font:bold 14px Arial,sans-serif;color:#1a1a1a">${escapar(titulo)}</p>
    ${detalhe ? `<p style="margin:3px 0 0;font:13px Arial,sans-serif;color:#555">${escapar(detalhe)}</p>` : ""}
  </div>`;

function montarHtml(c: Conteudo): string {
  const secoes: string[] = [];

  if (c.perf) {
    const p = c.perf;
    const bloco = (emoji: string, txt: string | null, cor: string) =>
      txt ? `<p style="margin:6px 0;font:14px Arial,sans-serif;color:${cor}">${emoji} ${escapar(txt)}</p>` : "";
    const lista = (itens: { nome: string; titulo: string }[], cor: string) =>
      itens.slice(0, 6).map((i) => LINHA(i.nome, i.titulo, cor)).join("");
    secoes.push(SECAO("Performance", `
      ${p.resumo ? `<p style="margin:0 0 8px;font:14px Arial,sans-serif;color:#333">${escapar(p.resumo)}</p>` : ""}
      ${bloco("✅", p.positivo, "#16A34A")}${bloco("⚠️", p.atencao, "#D97706")}${bloco("🚨", p.critico, "#DC2626")}
      ${p.contasCriticas.length ? `<p style="margin:14px 0 2px;font:bold 12px Arial,sans-serif;color:#DC2626">Contas críticas</p>${lista(p.contasCriticas, "#DC2626")}` : ""}
      ${p.contasAtencao.length ? `<p style="margin:14px 0 2px;font:bold 12px Arial,sans-serif;color:#D97706">Contas em atenção</p>${lista(p.contasAtencao, "#D97706")}` : ""}
      ${p.anomalias.length ? `<p style="margin:14px 0 2px;font:bold 12px Arial,sans-serif;color:#666">Anomalias</p>${p.anomalias.slice(0, 5).map((a) => LINHA(a.titulo ? `${a.nome}: ${a.titulo}` : a.nome, a.descricao, "#94A3B8")).join("")}` : ""}
      <p style="margin:12px 0 0"><a href="${APP_URL}/dashboard" style="font:13px Arial,sans-serif;color:#E85BA8;text-decoration:none">Abrir o Tracker →</a></p>`));
  }

  if (c.fin) {
    const f = c.fin;
    const tabela = (itens: typeof f.aReceber, titulo: string, cor: string, comDesc: boolean) => itens.length === 0 ? "" : `
      <p style="margin:14px 0 4px;font:bold 12px Arial,sans-serif;color:${cor}">${titulo}</p>
      <table style="width:100%;border-collapse:collapse;font:13px Arial,sans-serif">
        <tr style="text-align:left;color:#888"><th style="padding:4px 0;font-weight:normal">Quem</th><th style="font-weight:normal">Venceu</th><th style="font-weight:normal">Atraso</th><th style="text-align:right;font-weight:normal">Valor</th></tr>
        ${itens.map((x) => `<tr style="border-top:1px solid #eee">
          <td style="padding:7px 0;color:#333">${escapar(x.nome)}${comDesc && x.descricao !== x.nome ? `<br><span style="color:#999;font-size:11px">${escapar(x.descricao)}</span>` : ""}</td>
          <td style="color:#333">${fmtData(x.vencimento)}</td>
          <td style="color:${x.dias >= 30 ? "#DC2626" : "#D97706"};font-weight:bold">${x.dias}d</td>
          <td style="text-align:right;color:#333;font-weight:bold">${BRL(x.valorCents)}</td></tr>`).join("")}
      </table>`;
    secoes.push(SECAO("Financeiro crítico", `
      <p style="margin:0;font:14px Arial,sans-serif;color:#333">${f.total} conta(s) em atraso · total <strong>${BRL(f.totalReceberCents + f.totalPagarCents)}</strong></p>
      ${tabela(f.aReceber, `A receber vencidas — ${BRL(f.totalReceberCents)}`, "#16A34A", true)}
      ${tabela(f.aPagar, `A pagar vencidas — ${BRL(f.totalPagarCents)}`, "#DC2626", false)}
      <p style="margin:12px 0 0"><a href="${APP_URL}/finance" style="font:13px Arial,sans-serif;color:#E85BA8;text-decoration:none">Abrir o Financeiro →</a></p>`));
  }

  if (c.site) {
    secoes.push(SECAO("Site e Clarity", c.site.slice(0, 8)
      .map((i) => LINHA(i.conta ? `${i.conta}: ${i.titulo}` : i.titulo, i.detalhe, i.grave ? "#DC2626" : "#D97706")).join("")));
  }

  if (c.niver) {
    secoes.push(SECAO("Aniversários", c.niver.map((p) =>
      `<p style="margin:6px 0;font:14px Arial,sans-serif;color:#333">🎉 <strong>${escapar(p.nome)}</strong>${p.cargo ? ` · <span style="color:#777">${escapar(p.cargo)}</span>` : ""}</p>`).join("")));
  }

  if (c.comun) {
    secoes.push(SECAO("Comunicados", c.comun.map((k) => LINHA(k.titulo, k.corpo, "#E85BA8")).join("")));
  }

  const diaExtenso = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long", day: "numeric", month: "long" })
    .format(new Date(`${c.dia}T12:00:00-03:00`));

  return `
<div style="background:#f4f4f5;padding:24px 12px">
  <table style="max-width:640px;margin:0 auto;width:100%;border-collapse:collapse;background:#fff;border-radius:10px;overflow:hidden">
    <tr><td style="background:#1a1a1a;padding:20px 24px">
      <p style="margin:0;font:bold 15px Arial,sans-serif;color:#E85BA8;letter-spacing:1.5px">JORNALZINHO SELVA</p>
      <p style="margin:4px 0 0;font:13px Arial,sans-serif;color:#999">Bom dia! Resumo de ${diaExtenso}.</p>
    </td></tr>
    ${secoes.join("")}
    <tr><td style="padding:22px 24px 24px">
      <p style="margin:18px 0 0;border-top:1px solid #eee;padding-top:14px;font:11px Arial,sans-serif;color:#aaa">
        Enviado automaticamente pelo SELVA Spaces conforme o seu perfil.
        <a href="${APP_URL}" style="color:#E85BA8;text-decoration:none">Abrir o Spaces</a>
      </p>
    </td></tr>
  </table>
</div>`;
}

function montarTexto(c: Conteudo): string {
  const p: string[] = [`JORNALZINHO SELVA — ${fmtData(c.dia)}`];
  if (c.perf) {
    p.push("\nPERFORMANCE");
    if (c.perf.resumo) p.push(c.perf.resumo);
    if (c.perf.positivo) p.push(`✅ ${c.perf.positivo}`);
    if (c.perf.atencao) p.push(`⚠️ ${c.perf.atencao}`);
    if (c.perf.critico) p.push(`🚨 ${c.perf.critico}`);
    for (const x of c.perf.contasCriticas.slice(0, 6)) p.push(`• [crítico] ${x.nome}${x.titulo ? `: ${x.titulo}` : ""}`);
    for (const x of c.perf.contasAtencao.slice(0, 6)) p.push(`• [atenção] ${x.nome}${x.titulo ? `: ${x.titulo}` : ""}`);
  }
  if (c.fin) {
    p.push(`\nFINANCEIRO CRÍTICO — ${c.fin.total} conta(s), total ${BRL(c.fin.totalReceberCents + c.fin.totalPagarCents)}`);
    for (const x of [...c.fin.aReceber, ...c.fin.aPagar]) p.push(`• ${x.nome} — ${BRL(x.valorCents)} · venceu ${fmtData(x.vencimento)} · ${x.dias}d`);
  }
  if (c.site) { p.push("\nSITE E CLARITY"); for (const i of c.site.slice(0, 8)) p.push(`• ${i.conta ? i.conta + ": " : ""}${i.titulo}`); }
  if (c.niver) { p.push("\nANIVERSÁRIOS"); for (const n of c.niver) p.push(`🎉 ${n.nome}${n.cargo ? ` · ${n.cargo}` : ""}`); }
  if (c.comun) { p.push("\nCOMUNICADOS"); for (const k of c.comun) p.push(`• ${k.titulo}`); }
  return p.join("\n");
}

// ─── Envio ───────────────────────────────────────────────────────────────────

const dedupDe = (dia: string) => `DIGEST:${dia}`;

export type ResultadoDigestUsuario = {
  userId: number; email: string; papel: Papel;
  status: "enviado" | "falhou" | "pulado_vazio" | "pulado_duplicado";
  blocos: BlocoDigest[]; erro?: string;
};

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
  await registrarEnvioDigest(u.id, dedupDe(dia), u.email, envio.dryRun ? "dry_run" : envio.ok ? "sent" : "failed");

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
