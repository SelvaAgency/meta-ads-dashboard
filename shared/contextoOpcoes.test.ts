/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  As opções do contexto — vocabulário único, e o dado antigo preservado
 * ─────────────────────────────────────────────────────────────────────────────
 *  A auditoria mostrou que os valores antigos NÃO eram usados em enum,
 *  validação, filtro ou relatório — só nas duas telas (duplicados) e no prompt,
 *  por interpolação. O risco não era contrato quebrado; era o valor JÁ SALVO
 *  deixar de casar com a lista nova e o campo aparecer vazio.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  FAIXAS_DE_TICKET, TIPOS_DE_NEGOCIO, alternarTipoDeNegocio, escreverTiposDeNegocio,
  lerFaixaDeTicket, lerTiposDeNegocio, tiposDeNegocioParaIA,
} from "./contextoOpcoes";

describe("as seis faixas de ticket", () => {
  it("são exatamente as pedidas, nesta ordem", () => {
    expect([...FAIXAS_DE_TICKET]).toEqual([
      "Até R$ 199",
      "R$ 200 a R$ 500",
      "R$ 501 a R$ 2 mil",
      "R$ 2.001 a R$ 10 mil",
      "R$ 10.001 a R$ 100 mil",
      "Acima de R$ 100 mil",
    ]);
  });

  it("cada uma é aceita e volta como está", () => {
    for (const f of FAIXAS_DE_TICKET) {
      expect(lerFaixaDeTicket(f), f).toEqual({ faixa: f, legado: null });
    }
  });

  it("vazio não vira faixa nem legado", () => {
    for (const v of [null, undefined, "", "   "]) {
      expect(lerFaixaDeTicket(v)).toEqual({ faixa: null, legado: null });
    }
  });
});

describe("as faixas antigas", () => {
  it("as três com correspondente direto são migradas", () => {
    expect(lerFaixaDeTicket("Até R$100").faixa).toBe("Até R$ 199");
    expect(lerFaixaDeTicket("R$100–500").faixa).toBe("R$ 200 a R$ 500");
    expect(lerFaixaDeTicket("R$500–2k").faixa).toBe("R$ 501 a R$ 2 mil");
  });

  it("'Acima de R$2k' NÃO é migrada — ela cobre três faixas novas", () => {
    // Escolher uma inventaria precisão que o dado nunca teve: uma conta de
    // R$ 300 mil viraria "R$ 2.001 a R$ 10 mil" e ninguém desconfiaria.
    const r = lerFaixaDeTicket("Acima de R$2k");
    expect(r.faixa).toBeNull();
    expect(r.legado).toBe("Acima de R$2k");
  });

  it("o valor não migrado é PRESERVADO, e não apagado", () => {
    // O campo não pode aparecer vazio como se nunca tivesse sido preenchido.
    expect(lerFaixaDeTicket("qualquer coisa antiga").legado).toBe("qualquer coisa antiga");
  });
});

describe("tipo de negócio aceita várias categorias", () => {
  it("as sete opções continuam as mesmas", () => {
    expect([...TIPOS_DE_NEGOCIO]).toEqual([
      "E-commerce", "Serviço", "B2B", "Varejo físico", "Marketplace", "SaaS", "Outro",
    ]);
  });

  it("selecionar uma", () => {
    expect(escreverTiposDeNegocio(["B2B"])).toBe("B2B");
    expect(lerTiposDeNegocio("B2B")).toEqual(["B2B"]);
  });

  it("selecionar várias — as combinações do pedido", () => {
    for (const combo of [
      ["B2B", "Serviço"], ["B2B", "SaaS"],
      ["E-commerce", "Marketplace"], ["B2B", "Serviço", "SaaS"],
    ]) {
      const salvo = escreverTiposDeNegocio(combo);
      expect(new Set(lerTiposDeNegocio(salvo)), combo.join("+")).toEqual(new Set(combo));
    }
  });

  it("remover uma NÃO remove as demais", () => {
    const atuais = ["B2B", "Serviço", "SaaS"];
    expect(alternarTipoDeNegocio(atuais, "Serviço")).toEqual(["B2B", "SaaS"]);
  });

  it("alternar marca e desmarca a mesma", () => {
    let v: string[] = [];
    v = alternarTipoDeNegocio(v, "SaaS");
    expect(v).toEqual(["SaaS"]);
    v = alternarTipoDeNegocio(v, "SaaS");
    expect(v).toEqual([]);
  });

  it("salvar e recuperar preserva o conjunto inteiro", () => {
    const escolha = ["E-commerce", "Marketplace", "Varejo físico"];
    expect(new Set(lerTiposDeNegocio(escreverTiposDeNegocio(escolha)))).toEqual(new Set(escolha));
  });

  it("a ordem é a CANÔNICA, e não a de clique", () => {
    // Sem isso, "B2B, SaaS" e "SaaS, B2B" seriam textos diferentes para a mesma
    // escolha — e o autosave gravaria de novo só porque alguém desmarcou e
    // remarcou.
    expect(escreverTiposDeNegocio(["SaaS", "B2B"]))
      .toBe(escreverTiposDeNegocio(["B2B", "SaaS"]));
  });

  it("duplicata não vira dois chips", () => {
    expect(escreverTiposDeNegocio(["B2B", "B2B"])).toBe("B2B");
  });

  it("valor de fora da lista é preservado, e não descartado", () => {
    // Apagar o que alguém escreveu não é trabalho desta função.
    expect(lerTiposDeNegocio(escreverTiposDeNegocio(["B2B", "Agência"])))
      .toContain("Agência");
  });

  it("nada selecionado é string vazia, e lê como lista vazia", () => {
    expect(escreverTiposDeNegocio([])).toBe("");
    expect(lerTiposDeNegocio("")).toEqual([]);
  });

  it("um valor antigo de campo único lê como lista de um — sem migração", () => {
    // Retrocompatível por construção: "B2B" salvo antes da mudança continua
    // funcionando sem tocar no dado.
    expect(lerTiposDeNegocio("Serviço")).toEqual(["Serviço"]);
  });
});

describe("o que a IA recebe", () => {
  it("TODAS as categorias, e não a primeira", () => {
    expect(tiposDeNegocioParaIA("B2B, SaaS, Serviço")).toBe("B2B, SaaS, Serviço");
  });

  it("uma só continua funcionando", () => {
    expect(tiposDeNegocioParaIA("B2B")).toBe("B2B");
  });

  it("vazio é null — a linha não entra no prompt", () => {
    for (const v of [null, undefined, "", "  "]) {
      expect(tiposDeNegocioParaIA(v)).toBeNull();
    }
  });

  it("o prompt passa pela função, e não interpola a coluna crua", () => {
    const s = readFileSync(new URL("../server/services/contextoConta.ts", import.meta.url), "utf-8")
      .replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    expect(s).toContain("tiposDeNegocioParaIA(acc?.businessType)");
  });
});

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  A fiação — vocabulário num lugar só, e a coluna com largura
 * ─────────────────────────────────────────────────────────────────────────────
 */
describe("a fiação", () => {
  const fonte = (p: string) =>
    readFileSync(new URL(p, import.meta.url), "utf-8")
      .replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\/[^\n]*/g, "");

  it("nenhuma tela redeclara as listas", () => {
    // Duas cópias divergem no primeiro ajuste feito só numa, e o sintoma é
    // mudo: o chip marcado numa tela e vazio na outra.
    for (const p of ["../client/src/components/ContextPanel.tsx",
      "../client/src/components/ContextoGeralPanel.tsx"]) {
      const s = fonte(p);
      expect(s, p).not.toMatch(/const (BUSINESS_TYPES|TICKET_RANGES) =/);
      expect(s, p).toContain('from "@shared/contextoOpcoes"');
    }
  });

  it("as duas telas usam o grupo de seleção MÚLTIPLA no tipo de negócio", () => {
    for (const [p, comp] of [
      ["../client/src/components/ContextPanel.tsx", "ChipGroupMultiplo"],
      ["../client/src/components/ContextoGeralPanel.tsx", "ChipsMultiplos"],
    ]) {
      const s = fonte(p);
      expect(s, p).toContain(`<${comp} options={TIPOS_DE_NEGOCIO}`);
    }
  });

  it("a coluna comporta as sete categorias", () => {
    // As sete somam ~66 caracteres; varchar(50) truncaria em silêncio,
    // perdendo a última selecionada sem erro nenhum.
    const todas = escreverTiposDeNegocio([...TIPOS_DE_NEGOCIO]);
    expect(todas.length).toBeGreaterThan(50);
    expect(todas.length).toBeLessThan(200);
    expect(fonte("../drizzle/schema.ts")).toContain('businessType: varchar("businessType", { length: 200 })');
  });

  it("a migração da largura é idempotente", () => {
    const s = readFileSync(new URL("../scripts/ensure-schema.mjs", import.meta.url), "utf-8");
    expect(s).toContain("character_maximum_length");
    expect(s).toContain("MODIFY `businessType` VARCHAR(200)");
  });

  it("nenhum enum ou validação depende dos valores — o zod segue string livre", () => {
    const s = fonte("../server/routers.ts");
    expect(s).toContain("businessType: z.string().optional()");
    expect(s).toContain("ticketRange: z.string().optional()");
  });
});
