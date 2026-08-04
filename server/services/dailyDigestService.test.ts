import { describe, it, expect } from "vitest";
import { BLOCOS_POR_PAPEL, statusDoRecibo, montarHtml, filtrarPorConta, type Papel, type BlocoDigest, type Conteudo } from "./dailyDigestService";
import { consomeDedupDeDigest, type StatusDigest } from "../db";
import { canAccessAdmin } from "@shared/permissions";

/**
 * A matriz papel → blocos É a regra de privacidade do Jornalzinho. Um `push`
 * distraído em BLOCOS_POR_PAPEL.user manda contas a pagar da agência para o time
 * inteiro — e nada quebraria, o e-mail só sairia com um bloco a mais.
 *
 * Estes testes existem para essa mudança falhar em vermelho antes de sair.
 */
describe("matriz de blocos por papel", () => {
  const papeis: Papel[] = ["admin", "developer", "user"];

  it("financeiro é exclusivo de admin", () => {
    expect(BLOCOS_POR_PAPEL.admin).toContain("financeiro");
    expect(BLOCOS_POR_PAPEL.developer).not.toContain("financeiro");
    expect(BLOCOS_POR_PAPEL.user).not.toContain("financeiro");
  });

  it("nenhum papel além de admin vê financeiro", () => {
    const comFinanceiro = papeis.filter((p) => BLOCOS_POR_PAPEL[p].includes("financeiro"));
    expect(comFinanceiro).toEqual(["admin"]);
  });

  it("aniversários e comunicados são institucionais — vão para todos", () => {
    for (const p of papeis) {
      expect(BLOCOS_POR_PAPEL[p]).toContain("aniversarios");
      expect(BLOCOS_POR_PAPEL[p]).toContain("comunicados");
    }
  });

  it("performance de cliente é de admin e user — developer não cuida disso", () => {
    expect(BLOCOS_POR_PAPEL.admin).toContain("performance");
    expect(BLOCOS_POR_PAPEL.user).toContain("performance");
    expect(BLOCOS_POR_PAPEL.developer).not.toContain("performance");
  });

  it("site técnico é de admin e developer — user não recebe", () => {
    expect(BLOCOS_POR_PAPEL.admin).toContain("site");
    expect(BLOCOS_POR_PAPEL.developer).toContain("site");
    expect(BLOCOS_POR_PAPEL.user).not.toContain("site");
  });

  it("developer e user não se sobrepõem fora do institucional", () => {
    const institucional = new Set(["aniversarios", "comunicados"]);
    const dev = BLOCOS_POR_PAPEL.developer.filter((b) => !institucional.has(b));
    const usr = BLOCOS_POR_PAPEL.user.filter((b) => !institucional.has(b));
    expect(dev.filter((b) => usr.includes(b))).toEqual([]);
  });

  it("admin recebe tudo que existe", () => {
    const todos = new Set<BlocoDigest>(papeis.flatMap((p) => BLOCOS_POR_PAPEL[p]));
    expect(new Set(BLOCOS_POR_PAPEL.admin)).toEqual(todos);
  });

  it("Trello e Calendar ficam de fora — eles já notificam sozinhos", () => {
    for (const p of papeis) {
      const blocos = BLOCOS_POR_PAPEL[p] as string[];
      expect(blocos).not.toContain("tarefas");
      expect(blocos).not.toContain("trello");
      expect(blocos).not.toContain("reunioes");
      expect(blocos).not.toContain("calendar");
    }
  });

  it("nenhum papel tem bloco repetido", () => {
    for (const p of papeis) {
      expect(BLOCOS_POR_PAPEL[p].length).toBe(new Set(BLOCOS_POR_PAPEL[p]).size);
    }
  });
});

/**
 * ─── Recibo do digest × trava de duplicata ──────────────────────────────────
 * A trava existe para impedir DUPLICATA, não para registrar tentativa. Só
 * `sent` pode consumi-la.
 *
 * O caso real que motivou isto: rodar a simulação em dry-run de manhã queimava
 * a vaga do dia. Ao remover EMAIL_DRY_RUN à tarde, ninguém recebia e a tela
 * dizia "já enviado" — parecendo sucesso enquanto o e-mail nunca saiu.
 */
describe("status do recibo do digest", () => {
  it("pausado é 'paused', NÃO 'dry_run'", () => {
    // Pegadinha: a pausa mestre também devolve dryRun=true. Se a ordem das
    // checagens inverter, toda pausa vira ensaio no histórico.
    expect(statusDoRecibo({ ok: true, dryRun: true, pausado: true })).toBe("paused");
  });

  it("bloqueado é 'blocked', não se esconde entre os 'failed'", () => {
    expect(statusDoRecibo({ ok: false, dryRun: false, bloqueado: true })).toBe("blocked");
  });

  it("pulado é 'skipped'", () => {
    expect(statusDoRecibo({ ok: false, dryRun: false, pulado: true })).toBe("skipped");
  });

  it("ensaio é 'dry_run'", () => {
    expect(statusDoRecibo({ ok: true, dryRun: true })).toBe("dry_run");
  });

  it("entrega é 'sent' e falha de transporte é 'failed'", () => {
    expect(statusDoRecibo({ ok: true, dryRun: false })).toBe("sent");
    expect(statusDoRecibo({ ok: false, dryRun: false })).toBe("failed");
  });

  /**
   * O contrato inteiro em uma asserção: de todos os desfechos possíveis, só um
   * representa entrega — e só ele pode impedir um envio real no mesmo dia.
   */
  it("APENAS 'sent' representa entrega confirmada", () => {
    const desfechos = [
      { ok: true,  dryRun: true,  pausado: true },
      { ok: false, dryRun: false, bloqueado: true },
      { ok: false, dryRun: false, pulado: true },
      { ok: true,  dryRun: true },
      { ok: false, dryRun: false },
      { ok: true,  dryRun: false },
    ];
    const entregues = desfechos.map(statusDoRecibo).filter((s) => s === "sent");
    expect(entregues).toHaveLength(1);
  });
});

/**
 * A outra metade da regra: a consulta de duplicata só conta `sent`.
 *
 * `consomeDedupDeDigest` e a cláusula WHERE de `emailDigestJaEnviado` usam a
 * MESMA constante (STATUS_DIGEST_ENTREGUE), então este teste não verifica uma
 * cópia da regra — verifica a regra.
 */
describe("o que consome a trava de duplicata", () => {
  const TODOS: StatusDigest[] = ["sent", "failed", "dry_run", "paused", "blocked", "skipped"];

  it("só 'sent' consome", () => {
    expect(TODOS.filter(consomeDedupDeDigest)).toEqual(["sent"]);
  });

  it.each(["dry_run", "paused", "blocked", "skipped", "failed"])(
    "%s NÃO impede um envio real no mesmo dia",
    (s) => expect(consomeDedupDeDigest(s)).toBe(false),
  );

  /** O caso que motivou a correção, escrito por extenso. */
  it("ensaio de manhã não impede o envio real da tarde", () => {
    expect(consomeDedupDeDigest(statusDoRecibo({ ok: true, dryRun: true }))).toBe(false);
    expect(consomeDedupDeDigest(statusDoRecibo({ ok: true, dryRun: false }))).toBe(true);
  });
});

/**
 * ─── Estrutura do e-mail ────────────────────────────────────────────────────
 * O bug que motivou estes testes: a seção executiva era concatenada como
 * `SECAO(...) + montarHtml(...)`. `SECAO()` devolve um `<tr>`, então ele ficava
 * FORA de qualquer `<table>` — o parser descartava `<tr>`/`<td>` e despejava o
 * conteúdo solto no topo, antes do card. Na caixa de entrada isso aparecia como
 * "leitura executiva em texto corrido" seguida do bloco visual.
 *
 * O invariante que impede a volta disso: nada pode ser emitido antes da tabela.
 */
describe("estrutura do HTML do Jornalzinho", () => {
  const vazio: Conteudo = { dia: "2026-08-04", exec: null, perf: null, fin: null, site: null, niver: null, comun: null };

  const execMin = {
    dia: "2026-08-04",
    destaques: { totalClientes: 11, precisamAtencao: 3, criticos: 1, atencoes: 2, achadosCriticos: 2, achadosAtencao: 4, receitaRealLojas: 15000, lojasComReceita: 2, trafegoGA4: 5400 },
    atencaoPrimeiro: [{ nome: "ARKA", nivel: "critico" as const, motivo: "token expirado" }],
    vendasReais: [{ nome: "BAESH", fonte: "loja", receita: 9000, pedidos: 12, ticket: 750, dia: "2026-08-04" }],
    funil: [], saudeTecnica: [{ nome: "Musa", texto: "LCP 4.2s" }], fontesComErro: [],
    oportunidades: [], pendenciasManuais: [], rodape: [], vazio: false,
  };

  it("nada é emitido antes da tabela — sem `<tr>` órfão", () => {
    const html = montarHtml({ ...vazio, exec: execMin as any });
    expect(html.trimStart().startsWith("<div")).toBe(true);
    // O primeiro `<tr>` tem que vir DEPOIS do primeiro `<table`.
    expect(html.indexOf("<table")).toBeLessThan(html.indexOf("<tr"));
  });

  it("não embute mais o HTML pronto do executivo (a fonte da duplicação)", () => {
    const html = montarHtml({ ...vazio, exec: execMin as any });
    expect(html).not.toContain("Leitura executiva");
  });

  /** Grupo 1 é facultativo: um bloco vermelho diário deixa de ser visto. */
  it("sem crítico real, o grupo Críticos NÃO aparece", () => {
    const html = montarHtml({ ...vazio, exec: execMin as any, perf: { resumo: "tudo bem", positivo: null, atencao: null, critico: null, contasCriticas: [], contasAtencao: [], anomalias: [] } });
    expect(html).not.toContain("Precisa de atenção agora");
    // …mas Performance continua lá: o e-mail começa por ela quando não há crítico.
    expect(html).toContain(">Performance<");
  });

  it("com crítico real, o grupo Críticos aparece ANTES de Performance", () => {
    const html = montarHtml({
      ...vazio, exec: execMin as any,
      perf: { resumo: null, positivo: null, atencao: null, critico: "CPA estourou em 3 contas", contasCriticas: [{ nome: "ARKA", titulo: "token expirado" }], contasAtencao: [], anomalias: [] },
    });
    expect(html).toContain("Precisa de atenção agora");
    expect(html.indexOf("Precisa de atenção agora")).toBeLessThan(html.indexOf(">Performance<"));
  });

  it("os 4 grupos saem na ordem: Críticos → Performance → Saúde técnica → Financeiro", () => {
    const html = montarHtml({
      ...vazio, exec: execMin as any,
      perf: { resumo: null, positivo: null, atencao: null, critico: "algo grave", contasCriticas: [], contasAtencao: [], anomalias: [] },
      site: [{ titulo: "LCP alto", detalhe: "", conta: "Musa", grave: false }],
      fin: { total: 2, aReceber: [], aPagar: [], totalReceberCents: 100000, totalPagarCents: 50000 } as any,
    });
    const ordem = ["Precisa de atenção agora", ">Performance<", ">Saúde técnica<", ">Financeiro<"].map((t) => html.indexOf(t));
    expect(ordem.every((i) => i >= 0)).toBe(true);
    expect([...ordem].sort((a, b) => a - b)).toEqual(ordem);
  });

  it("Performance usa cards de KPI, não só parágrafo", () => {
    const html = montarHtml({ ...vazio, exec: execMin as any });
    expect(html).toContain("clientes");   // rótulo de KPI
    expect(html).toContain("em atenção");
    expect(html).toContain("saudáveis");
  });

  /**
   * Cards removidos a pedido do Gui: dois não precisavam existir nesse formato
   * e dois repetiam informação que já estava logo ao lado ("achados atenção" vs
   * "em atenção"). Listar por nome aqui é o que impede alguém de recolocá-los
   * numa refatoração futura sem que a decisão seja revisada.
   */
  it.each(["receita ·", "sessões · 7d", "achados atenção", "achados críticos", "Vendas do dia"])(
    "NÃO mostra mais o card/bloco %s",
    (rotulo) => {
      const html = montarHtml({
        ...vazio, exec: execMin as any,
        perf: { resumo: null, positivo: null, atencao: null, critico: null, contasCriticas: [], contasAtencao: [], anomalias: [] },
      });
      expect(html).not.toContain(rotulo);
    },
  );

  /** "Olhar primeiro" + "Técnica" viraram uma seção só. */
  it("a seção técnica é única — 'Olhar primeiro' não existe mais", () => {
    const html = montarHtml({ ...vazio, exec: execMin as any, site: [{ titulo: "LCP alto", detalhe: "", conta: "Musa", grave: false }] });
    expect(html).not.toContain("Olhar primeiro");
    expect(html).toContain(">Saúde técnica<");
    // e o que estava nas duas seções continua presente, agora numa só
    expect(html).toContain("ARKA");   // vinha de atencaoPrimeiro
    expect(html).toContain("Musa");   // vinha de saudeTecnica/site
  });

  /**
   * Um cliente crítico no topo não pode reaparecer embaixo. As fontes se
   * sobrepõem por natureza (Panorama + alerta de mídia + achado de site), e sem
   * dedup o leitor vê o mesmo nome três vezes sem saber se é o mesmo problema.
   */
  it("não repete o mesmo cliente entre Críticos e Saúde técnica", () => {
    const html = montarHtml({
      ...vazio,
      exec: { ...execMin, atencaoPrimeiro: [{ nome: "ARKA", nivel: "critico", motivo: "token expirado" }] } as any,
      perf: { resumo: null, positivo: null, atencao: null, critico: null, contasCriticas: [{ nome: "ARKA", titulo: "token expirado" }], contasAtencao: [], anomalias: [] },
    });
    expect(html.split("ARKA").length - 1).toBe(1);
  });

  /**
   * Item 4 do pedido: o colaborador NÃO pode ficar com o template antigo. Como
   * os KPIs do Panorama são admin-only, sem derivação ele veria uma Performance
   * sem card nenhum — só texto.
   */
  it("colaborador (sem executivo) também recebe KPIs, derivados do que ele já tem", () => {
    const html = montarHtml({
      ...vazio, exec: null,
      perf: { resumo: "resumo curto", positivo: null, atencao: null, critico: null,
        contasCriticas: [{ nome: "A", titulo: "" }], contasAtencao: [{ nome: "B", titulo: "" }], anomalias: [] },
    });
    expect(html).toContain("críticos");
    expect(html).toContain("em atenção");
    expect(html).toContain("anomalias");
  });
});

/**
 * A prévia do Jornalzinho é aberta a admin/dev, mas a visão ADMIN não.
 *
 * A correção depende de duas verdades independentes, e este teste amarra as
 * duas juntas: (1) o financeiro só existe na visão admin e (2) `canAccessAdmin`
 * exclui o developer. Se alguém mexer em qualquer uma delas, a guarda da
 * procedure deixa de proteger o que promete — e isso falha aqui, não em
 * produção.
 */
describe("visão admin da prévia", () => {
  it("é a única que carrega financeiro", () => {
    const comFinanceiro = (["admin", "developer", "user"] as Papel[])
      .filter((p) => BLOCOS_POR_PAPEL[p].includes("financeiro"));
    expect(comFinanceiro).toEqual(["admin"]);
  });

  it("developer NÃO é admin — é o que faz a guarda da procedure morder", () => {
    expect(canAccessAdmin("admin")).toBe(true);
    expect(canAccessAdmin("developer")).toBe(false);
    expect(canAccessAdmin("user")).toBe(false);
  });
});

/**
 * ─── Segmentação por cliente ────────────────────────────────────────────────
 * O filtro roda na ORIGEM (nos coletores, por accountId), não no template —
 * filtrar no HTML deixaria `blocos` e `vazio` mentindo sobre o que sobrou.
 *
 * O caso que estes testes protegem: o e-mail da Beth não pode citar Musa nem
 * Arka, e o da Nat não pode citar Ultramalhas nem Elwing.
 */
describe("filtro de clientes", () => {
  const alerta = (accountId: number | null, nome: string) =>
    ({ accountId, accountName: nome, title: `${nome}: algo`, severity: "WARNING", type: "X", message: "" });

  it("mantém só as contas escolhidas", () => {
    const itens = [alerta(1, "Ultra Malhas"), alerta(2, "Musa"), alerta(3, "Elwing")];
    expect(filtrarPorConta(itens as any, [1, 3]).map((i: any) => i.accountName))
      .toEqual(["Ultra Malhas", "Elwing"]);
  });

  it("null não filtra nada — é o fallback de quem nunca configurou", () => {
    const itens = [alerta(1, "A"), alerta(2, "B")];
    expect(filtrarPorConta(itens as any, null)).toHaveLength(2);
  });

  it("lista vazia bloqueia todo cliente — configurou e desmarcou tudo", () => {
    const itens = [alerta(1, "A"), alerta(2, "B")];
    expect(filtrarPorConta(itens as any, [])).toHaveLength(0);
  });

  /**
   * Alerta sem accountId é do SISTEMA (token da agência, falha global), não de
   * um cliente. Quem segmentou clientes não pediu para deixar de saber disso.
   */
  it("alerta sem conta passa sempre, mesmo com filtro fechado", () => {
    const itens = [alerta(null, "Falha de sync global"), alerta(2, "Musa")];
    const r = filtrarPorConta(itens as any, []);
    expect(r).toHaveLength(1);
    expect((r[0] as any).accountName).toBe("Falha de sync global");
  });

  it("um grupo não vê o cliente do outro", () => {
    const itens = [alerta(1, "Ultra Malhas"), alerta(2, "Elwing"), alerta(3, "Musa"), alerta(4, "CA - ARKA")];
    const g1 = filtrarPorConta(itens as any, [1, 2]).map((i: any) => i.accountName);
    const g2 = filtrarPorConta(itens as any, [3, 4]).map((i: any) => i.accountName);
    expect(g1).toEqual(["Ultra Malhas", "Elwing"]);
    expect(g2).toEqual(["Musa", "CA - ARKA"]);
    expect(g1.some((n: string) => g2.includes(n))).toBe(false);
  });
});
