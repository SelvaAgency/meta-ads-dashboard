import { describe, it, expect } from "vitest";
import { acoesDoResumo, positivosDoResumo, type DadosResumo } from "./resumoSite";
import type { Fonte } from "@shared/fontes";

const fonte = (chave: string, status: Fonte["status"], porque?: string): Fonte =>
  ({ chave: chave as Fonte["chave"], rotulo: chave, status, ...(porque ? { porque } : {}) });

const vazio: DadosResumo = { fontes: [] };

describe("ações do Resumo", () => {
  it("cliente sem dado nenhum não gera ação — ausência não é problema", () => {
    expect(acoesDoResumo(vazio)).toEqual([]);
  });

  it("site fora do ar entra como grave", () => {
    const a = acoesDoResumo({ ...vazio, up: { status: "fora_do_ar" } });
    expect(a[0].grave).toBe(true);
    expect(a[0].texto).toMatch(/não está respondendo/);
  });

  it("graves vêm antes dos não graves", () => {
    const a = acoesDoResumo({
      ...vazio,
      pm: { performanceScore: 30 },              // não grave
      seg: { https: false },                      // grave
    });
    expect(a[0].grave).toBe(true);
    expect(a.at(-1)!.grave).toBe(false);
  });

  it("lista é curta — priorização, não inventário", () => {
    const a = acoesDoResumo({
      fontes: [fonte("clarity", "erro", "x"), fonte("pagespeed", "erro", "y"), fonte("meta", "atencao", "z")],
      up: { status: "fora_do_ar" },
      seg: { https: false, sslValido: false, daysToSslExpiry: 3, score: 20 },
      pm: { performanceScore: 10, lcp: 9000 },
      m: { sessions: 100, javascriptErrors: 5, rageClicks: 3 },
    });
    expect(a.length).toBeLessThanOrEqual(6);
  });

  describe("SSL", () => {
    it("expirando em 3 dias é grave", () => {
      expect(acoesDoResumo({ ...vazio, seg: { daysToSslExpiry: 3 } })[0].grave).toBe(true);
    });
    it("expirando em 25 dias avisa sem ser grave", () => {
      const a = acoesDoResumo({ ...vazio, seg: { daysToSslExpiry: 25 } });
      expect(a[0].grave).toBe(false);
    });
    it("expirando em 90 dias não vira ação", () => {
      expect(acoesDoResumo({ ...vazio, seg: { daysToSslExpiry: 90 } })).toEqual([]);
    });
  });

  describe("fontes com problema (dados reais de produção)", () => {
    /** Scaffold Play e UMA tinham o Clarity falhando quando isto foi escrito. */
    it("Clarity em erro vira ação apontando para Performance", () => {
      const a = acoesDoResumo({ ...vazio, fontes: [fonte("clarity", "erro", "A última sincronização falhou.")] });
      expect(a[0].grave).toBe(true);
      expect(a[0].ir).toBe("performance");
    });

    /** SELVA, ELWING e BAESH tinham o PageSpeed falhando. */
    it("PageSpeed em erro aponta para Técnico", () => {
      const a = acoesDoResumo({ ...vazio, fontes: [fonte("pagespeed", "erro", "O último teste falhou.")] });
      expect(a[0].ir).toBe("tecnico");
    });

    /** ARKA: sete semanas sem sincronizar. */
    it("Meta em atenção vira ação, sem destino de aba", () => {
      const a = acoesDoResumo({ ...vazio, fontes: [fonte("meta", "atencao", "Último sync 03/06.")] });
      expect(a).toHaveLength(1);
      expect(a[0].grave).toBe(false);
      expect(a[0].ir).toBeUndefined();
    });

    it("fonte AUSENTE não vira ação — desconectado não é defeito", () => {
      expect(acoesDoResumo({ ...vazio, fontes: [fonte("ga4", "ausente", "não conectado")] })).toEqual([]);
    });

    it("fonte ok não vira ação", () => {
      expect(acoesDoResumo({ ...vazio, fontes: [fonte("clarity", "ok")] })).toEqual([]);
    });
  });

  describe("comportamento só conta quando houve tráfego", () => {
    it("sem sessões, erro de JS não vira ação", () => {
      expect(acoesDoResumo({ ...vazio, m: { sessions: 0, javascriptErrors: 10 } })).toEqual([]);
    });
    it("com sessões, erro de JS vira ação", () => {
      const a = acoesDoResumo({ ...vazio, m: { sessions: 100, javascriptErrors: 10 } });
      expect(a[0].texto).toMatch(/JavaScript/);
    });
  });

  it("toda ação carrega uma frase de próximo passo", () => {
    const a = acoesDoResumo({
      ...vazio, seg: { https: false, daysToSslExpiry: 2 }, pm: { lcp: 9000 },
      m: { sessions: 50, rageClicks: 4 },
    });
    expect(a.length).toBeGreaterThan(0);
    for (const x of a) expect(x.proximoPasso.length).toBeGreaterThan(10);
  });

  it("valores não numéricos não geram ação nem quebram", () => {
    const a = acoesDoResumo({
      ...vazio,
      pm: { performanceScore: null, lcp: undefined },
      seg: { score: null, daysToSslExpiry: null },
      m: { sessions: null, javascriptErrors: undefined },
    });
    expect(a).toEqual([]);
  });
});

describe("destaques positivos", () => {
  it("cliente sem dado não recebe elogio inventado", () => {
    expect(positivosDoResumo(vazio)).toEqual([]);
  });

  it("site no ar entra com o tempo de resposta", () => {
    expect(positivosDoResumo({ ...vazio, up: { status: "no_ar", responseTimeMs: 320 } })[0]).toMatch(/320ms/);
  });

  it("performance alta é destaque", () => {
    expect(positivosDoResumo({ ...vazio, pm: { performanceScore: 95 } })).toContainEqual(expect.stringMatching(/95/));
  });

  it("zero erro de JS só conta se houve sessão medida", () => {
    expect(positivosDoResumo({ ...vazio, m: { sessions: 0, javascriptErrors: 0 } })).toEqual([]);
    expect(positivosDoResumo({ ...vazio, m: { sessions: 500, javascriptErrors: 0 } }))
      .toContainEqual(expect.stringMatching(/Nenhum erro de JavaScript/));
  });

  it("nota de segurança baixa não vira destaque positivo", () => {
    expect(positivosDoResumo({ ...vazio, seg: { score: 40 } })).toEqual([]);
  });

  it("quatro ou mais fontes conectadas é destaque", () => {
    const fontes = ["meta", "google_ads", "clarity", "pagespeed"].map((c) => fonte(c, "ok"));
    expect(positivosDoResumo({ ...vazio, fontes })).toContainEqual(expect.stringMatching(/4 fontes/));
  });
});
