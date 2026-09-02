/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Quem pode disparar uma chamada de IA — e por qual porta
 * ─────────────────────────────────────────────────────────────────────────────
 *  Estes testes leem o CÓDIGO, e não o comportamento em execução: as regras que
 *  eles guardam são de fiação, e fiação errada não quebra teste de unidade —
 *  ela só gasta dinheiro em silêncio.
 *
 *  A auditoria de 19/08/2026 mediu o custo do silêncio: 11 deploys num dia
 *  dispararam 11 ciclos completos de sync, cada um com uma chamada ao modelo
 *  por conta, contra 1 ciclo previsto. Nada falhou, nada logou erro.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const semComentarios = (t: string) =>
  t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
const fonte = (p: string) => semComentarios(readFileSync(new URL(p, import.meta.url), "utf-8"));

const autoSync = () => fonte("./autoSync.ts");
const servidor = () => fonte("./_core/index.ts");
const statusIA = () => fonte("./services/aiStatusService.ts");

describe("boot não dispara ciclo de IA", () => {
  /**
   * A regressão mais cara desta frente, e a mais fácil de reintroduzir: uma
   * linha dentro do `setTimeout` de aquecimento.
   */
  it("o bloco de boot não chama runAutoSync", () => {
    const s = autoSync();
    const i = s.indexOf("setTimeout(async () => {");
    expect(i, "o bloco de boot sumiu — o teste precisa de nova âncora").toBeGreaterThan(0);
    const boot = s.slice(i, s.indexOf("}, 15000);", i));
    expect(boot).not.toContain("runAutoSync");
    expect(boot).not.toContain("syncAllAccounts");
    expect(boot).not.toContain("refreshAccountAiStatus");
  });

  it("o que sobrou no boot não chama modelo", () => {
    const s = autoSync();
    const boot = s.slice(s.indexOf("setTimeout(async () => {"), s.indexOf("}, 15000);"));
    // Conferido na auditoria: nenhum dos dois toca o LLM.
    expect(boot).toContain("rebuildScheduledReportJobs");
    expect(boot).toContain("runAnomalyDetection");
  });

  it("nenhum outro timer roda o ciclo na subida", () => {
    // `setInterval` ou um segundo `setTimeout` com o ciclo dentro seria o mesmo
    // comportamento com outro nome.
    const s = autoSync();
    for (const m of s.match(/set(Timeout|Interval)\([\s\S]{0,600}?\}, ?\d+\)/g) ?? []) {
      expect(m, "um timer voltou a rodar o ciclo").not.toContain("runAutoSync(");
    }
  });
});

describe("o cron continua sendo a fonte da rodada diária", () => {
  it("06:00 dispara runAutoSync, com o motivo nomeado", () => {
    const s = autoSync();
    expect(s).toContain('cron.schedule("0 0 6 * * *"');
    const linha = s.slice(s.indexOf('cron.schedule("0 0 6 * * *"'), s.indexOf('cron.schedule("0 0 6 * * *"') + 400);
    expect(linha).toContain('runAutoSync("cron")');
  });

  it("a frequência do cron diário não mudou", () => {
    expect(autoSync().match(/cron\.schedule\("0 0 6 \* \* \*"/g)?.length).toBe(1);
  });
});

describe("guard de execução única", () => {
  it("existe, e recusa a segunda execução sem tocar em conta nenhuma", () => {
    const s = autoSync();
    expect(s).toContain("let cicloEmAndamento");
    const inicio = s.slice(s.indexOf("async function runAutoSync"), s.indexOf("Financeiro v4"));
    expect(inicio).toContain("if (cicloEmAndamento)");
    expect(inicio).toContain("return");
  });

  it("a trava é liberada em finally", () => {
    // Sem `finally`, uma exceção no meio do laço prenderia a trava e nenhum
    // ciclo rodaria até o próximo restart — remédio pior que a doença.
    const s = autoSync();
    const corpo = s.slice(s.indexOf("async function runAutoSync"), s.indexOf("async function runGeracaoRecomendacoes"));
    expect(corpo).toContain("} finally {");
    expect(corpo.slice(corpo.indexOf("} finally {"))).toContain("cicloEmAndamento = null");
  });

  it("o guard NÃO bloqueia o sync de uma conta só", () => {
    // Sincronizar uma conta é ação legítima da equipe e não passa pelo ciclo.
    const s = autoSync();
    const conta = s.slice(s.indexOf("export async function syncAccount"), s.indexOf("export async function syncAllAccounts"));
    expect(conta).not.toContain("cicloEmAndamento");
  });
});

describe("/api/sync-now — da equipe, e não do mundo", () => {
  it("exige autenticação", () => {
    const s = servidor();
    const rota = s.slice(s.indexOf('app.post("/api/sync-now"'), s.indexOf('app.post("/api/sync-now"') + 1200);
    expect(rota).toContain("authenticateRequest");
    expect(rota).toContain("401");
  });

  it("NÃO restringe a admin ou dev — a equipe precisa sincronizar", () => {
    // A contenção de custo mora no guarda de frescor, e não em tirar a
    // ferramenta de quem trabalha com ela.
    const s = servidor();
    const rota = s.slice(s.indexOf('app.post("/api/sync-now"'), s.indexOf('app.post("/api/sync-now"') + 1200);
    expect(rota).not.toContain("canAccessAdmin");
    expect(rota).not.toContain("canManageContent");
    expect(rota).not.toContain("403");
  });

  it("registra quem disparou", () => {
    const s = servidor();
    const rota = s.slice(s.indexOf('app.post("/api/sync-now"'), s.indexOf('app.post("/api/sync-now"') + 1200);
    expect(rota).toContain('syncAllAccounts("manual"');
    expect(rota).toContain("tipo: \"user\"");
  });

  it("usa a autenticação existente, e não uma paralela", () => {
    // Um segundo mecanismo divergiria do primeiro no dia em que a sessão
    // mudasse — e divergiria em silêncio.
    expect(servidor()).toContain("sdk.authenticateRequest");
  });
});

describe("sincronizar dados ≠ regerar análise", () => {
  it("o sync NÃO força a análise", () => {
    const s = autoSync();
    const trecho = s.slice(s.indexOf("refreshAccountAiStatus(account.id"), s.indexOf("refreshAccountAiStatus(account.id") + 200);
    expect(trecho).not.toContain("forcar");
  });

  it("o botão de reanálise força", () => {
    const r = fonte("./routers.ts");
    const bloco = r.slice(r.indexOf("refreshStatus: protectedProcedure"), r.indexOf("refreshStatus: protectedProcedure") + 900);
    expect(bloco).toContain("forcar: true");
  });

  it("a reanálise em massa força", () => {
    const r = fonte("./routers.ts");
    const bloco = r.slice(r.indexOf("refreshAllStatus:"), r.indexOf("refreshAllStatus:") + 900);
    expect(bloco).toContain("forcar: true");
  });

  it("o guarda de frescor roda ANTES de montar o prompt", () => {
    // Depois seria inútil para o custo: o gasto é a chamada ao modelo, e o
    // prompt já estaria pronto.
    const s = statusIA();
    const corpo = s.slice(s.indexOf("export async function refreshAccountAiStatus"));
    expect(corpo.indexOf("decidirGeracaoDaAnalise")).toBeLessThan(corpo.indexOf("invokeLLM"));
    expect(corpo.indexOf("decidirGeracaoDaAnalise")).toBeLessThan(corpo.indexOf("const prompt ="));
  });

  it("reusar devolve a análise gravada, e nunca uma vazia", () => {
    const s = statusIA();
    const corpo = s.slice(s.indexOf("if (!decisao.gerar)"), s.indexOf("const prompt ="));
    expect(corpo).toContain("if (cor && resumo)");
  });
});

describe("o gatilho chega ao registro", () => {
  it("invokeLLM lê o contexto, sem receber por parâmetro", () => {
    const s = fonte("./_core/llm.ts");
    expect(s).toContain("gatilhoParaRegistro()");
    expect(s).toContain("gatilho,");
  });

  it("toda procedure autenticada declara ator", () => {
    const s = fonte("./_core/trpc.ts");
    // Oito famílias autenticadas (a oitava é `laboratorioProcedure`); a
    // pública fica de fora de propósito. Cada procedure nova carregar o ator é
    // justamente o que se quer dela — o número sobe junto, e o teste é o
    // lembrete disso.
    expect(s.match(/\.use\(comAtorDaSessao\)/g)?.length).toBe(8);
    expect(s).toContain("origem: path");
  });

  it("o cron declara gatilho automático", () => {
    const s = autoSync();
    expect(s).toContain("ROTINAS.cronDiario");
    expect(s).toContain("comGatilho");
  });

  it("sem declaração, o registro é unknown — e não um palpite", () => {
    const s = fonte("./_core/contextoDeGatilho.ts");
    const fn = s.slice(s.indexOf("export function gatilhoParaRegistro"));
    expect(fn).toContain('tipo: "unknown"');
    expect(fn).not.toContain('tipo: "scheduled"');
    expect(fn).not.toContain('tipo: "system"');
  });

  it("nenhum conteúdo entra no registro", () => {
    // O log é de causalidade. Prompt, resposta e dado de cliente não passam
    // por aqui — nem por engano.
    const s = fonte("./_core/contextoDeGatilho.ts");
    for (const proibido of ["prompt", "messages", "content", "resposta"]) {
      expect(s.toLowerCase(), proibido).not.toContain(`${proibido}:`);
    }
    const db = fonte("./db.ts");
    const insert = db.slice(db.indexOf("export async function registrarGeracaoIA"), db.indexOf("export async function registrarGeracaoIA") + 2200);
    for (const proibido of ["prompt", "messages", "resposta", "summary"]) {
      expect(insert.toLowerCase(), proibido).not.toContain(proibido);
    }
  });
});

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Nenhum cron pode chegar ao modelo sem se nomear
 * ─────────────────────────────────────────────────────────────────────────────
 *  Um cron sem gatilho grava `unknown` e vira caminho oculto no painel de
 *  consumo — a coisa exata que esta frente existe para eliminar. Embrulhar
 *  também os que hoje NÃO chamam IA é de propósito: no dia em que um deles
 *  passar a chamar, ele já nasce rastreado.
 * ─────────────────────────────────────────────────────────────────────────────
 */
describe("os crons se nomeiam", () => {
  const AI_CAPAZES = [
    "runGeracaoRecomendacoes",   // → gerarRecomendacoesDaConta → LLM
    "runScheduledReports",       // → generateAgencyReport → LLM
    "runActionOutcomeClosures",  // → invokeLLM direto
    "runNotificacoesSeForHora",  // → runNotificacoesDiarias → jornalzinho
  ];

  it("todo cron que alcança o modelo passa por `agendado`", () => {
    const s = autoSync();
    // Casa o embrulho DIRETO, e não o bloco de cron: um `cron.schedule` interno
    // que mencione o nome noutro contexto faria o teste apontar o lugar errado
    // — foi o que aconteceu, e o lugar errado escondia um cron de verdade.
    for (const nome of AI_CAPAZES) {
      expect(s, `${nome} não declara gatilho`).toContain(`agendado("${nome}"`);
    }
  });

  it("`agendado` marca scheduled e sistema, nunca manual", () => {
    const s = autoSync();
    const fn = s.slice(s.indexOf("const agendado ="), s.indexOf("export async function startAutoSync"));
    expect(fn).toContain('tipo: "scheduled"');
    expect(fn).toContain('ator: { tipo: "system" }');
    expect(fn).not.toContain('"manual"');
  });

  /**
   * O cron criado em tempo de execução, um por relatório cadastrado.
   *
   * Ele não aparece na lista do `startAutoSync` e quase escapou da auditoria:
   * `generateAgencyReport` lá dentro é uma chamada de IA.
   */
  it("o cron de cada relatório agendado também se nomeia", () => {
    const s = autoSync();
    const job = s.slice(s.indexOf("const job = cron.schedule(cronExpr"), s.indexOf("scheduledReportJobs.set(jobKey, job)"));
    expect(job).toContain("comGatilho");
    expect(job).toContain('origem: "scheduledReport"');
    // Dentro do callback: o que carrega o gatilho é a EXECUÇÃO, e não o
    // instante em que o job é registrado.
    expect(job.indexOf("cron.schedule")).toBeLessThan(job.indexOf("comGatilho"));
  });

  it("a rodada diária continua com rótulo próprio", () => {
    // Ela não usa `agendado` porque carrega o motivo do ciclo junto.
    const s = autoSync();
    expect(s).toContain("ROTINAS.cronDiario");
  });
});
