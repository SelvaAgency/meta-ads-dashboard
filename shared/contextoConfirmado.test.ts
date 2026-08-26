/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Rascunho salvo ≠ contexto confirmado para a IA
 * ─────────────────────────────────────────────────────────────────────────────
 *  O autosave criou um disparo INDIRETO de modelo:
 *
 *    digitação → autosave → updatedAt muda → análise "desatualizada"
 *              → cron das 06:00 → invokeLLM
 *
 *  O gasto voltava a ser proporcional ao número de correções de texto — o
 *  oposto do que a separação entre rascunho e confirmação existe para garantir.
 *
 *  A correção é um campo próprio: `contextoConfirmadoEm`, escrito só no clique
 *  de confirmar. `updatedAt` continua existindo e respondendo "quando o
 *  contexto mudou pela última vez", que é outra pergunta.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { decidirGeracaoDaAnalise } from "./frescorDaAnalise";
import { analiseDesatualizada } from "./contextoDaAnalise";

const semComentarios = (t: string) =>
  t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\/[^\n]*/g, "");
const fonte = (p: string) => semComentarios(readFileSync(new URL(p, import.meta.url), "utf-8"));

const agora = new Date("2026-08-26T09:00:00Z");
const atras = (min: number) => new Date(agora.getTime() - min * 60_000);

describe("o ciclo completo: autosave e depois o cron", () => {
  /**
   * O cenário do relatório, ponta a ponta.
   *
   * Alguém abre a conta, digita, o autosave grava várias vezes, sai. A análise
   * é de ontem — bem além da janela de frescor de 180 minutos. O que decide se
   * o cron gera é `contextoEm`, e ele agora só recebe CONFIRMAÇÃO.
   */
  it("autosave sem confirmação NÃO faz o cron gerar por causa do contexto", () => {
    const d = decidirGeracaoDaAnalise({
      analiseEm: atras(60),        // dentro da janela de 180min
      contextoEm: null,            // nunca confirmado — vários autosaves depois
      agora,
    });
    expect(d.gerar).toBe(false);
    expect(d.motivo).toBe("fresca");
  });

  it("dez autosaves seguidos continuam dando zero geração", () => {
    // O `contextoEm` não se move porque autosave não carimba confirmação —
    // então a decisão é a mesma da primeira vez, dez vezes.
    for (let i = 0; i < 10; i++) {
      const d = decidirGeracaoDaAnalise({ analiseEm: atras(30), contextoEm: null, agora });
      expect(d.gerar, `autosave ${i + 1}`).toBe(false);
    }
  });

  it("a confirmação explícita SIM torna a análise elegível", () => {
    const d = decidirGeracaoDaAnalise({
      analiseEm: atras(60),
      contextoEm: atras(5),        // alguém clicou em confirmar há 5 minutos
      agora,
    });
    expect(d.gerar).toBe(true);
    expect(d.motivo).toBe("contexto_mudou");
  });

  it("confirmação gera UMA vez — depois de analisada, volta a ficar fresca", () => {
    // Confirmou às 08:55, a análise rodou às 08:56. O cron seguinte não repete.
    const d = decidirGeracaoDaAnalise({
      analiseEm: atras(4), contextoEm: atras(5), agora,
    });
    expect(d.gerar).toBe(false);
  });
});

describe("as outras regras de invalidação continuam de pé", () => {
  it("análise expirada continua gerando, com ou sem contexto", () => {
    const d = decidirGeracaoDaAnalise({ analiseEm: atras(24 * 60), contextoEm: null, agora });
    expect(d.gerar).toBe(true);
    expect(d.motivo).toBe("expirada");
  });

  it("conta nunca analisada continua gerando", () => {
    expect(decidirGeracaoDaAnalise({ analiseEm: null, contextoEm: null, agora }).motivo)
      .toBe("sem_analise");
  });

  it("o botão Atualizar continua forçando, mesmo sem confirmação de contexto", () => {
    const d = decidirGeracaoDaAnalise({
      analiseEm: atras(1), contextoEm: null, forcar: true, agora,
    });
    expect(d.motivo).toBe("forcado");
  });

  it("a janela de frescor não foi alterada", () => {
    const s = fonte("./frescorDaAnalise.ts");
    expect(s).toContain("AI_STATUS_FRESHNESS_MINUTES = 180");
  });

  it("o aviso da tela também segue a confirmação, e não o rascunho", () => {
    // `analiseDesatualizada` continua igual — o que mudou foi QUAL data ela
    // recebe. Com rascunho não confirmado, `contextoEm` é null e não há aviso.
    expect(analiseDesatualizada(atras(60), null)).toBe(false);
    expect(analiseDesatualizada(atras(60), atras(5))).toBe(true);
  });
});

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  A fiação: quem escreve `contextoConfirmadoEm`, e quem lê
 * ─────────────────────────────────────────────────────────────────────────────
 *  Nenhum compilador impede alguém de voltar a ler `updatedAt` numa das duas
 *  pontas, e o sintoma seria a conta da Anthropic subindo sem nada quebrar.
 * ─────────────────────────────────────────────────────────────────────────────
 */
describe("a fiação da separação", () => {
  it("a regra de frescor lê a CONFIRMAÇÃO, e não a última gravação", () => {
    const s = fonte("../server/services/aiStatusService.ts");
    expect(s).toContain("ctx?.contextoConfirmadoEm ?? null");
    expect(s).not.toContain("ctx?.updatedAt");
  });

  it("o aviso da tela lê a mesma coisa", () => {
    const s = fonte("../server/routers.ts");
    const bloco = s.slice(s.indexOf("const analiseEm = conta?.aiStatusAt"),
      s.indexOf("desatualizada: analiseDesatualizada"));
    expect(bloco).toContain("ctx?.contextoConfirmadoEm ?? null");
    expect(bloco).not.toContain("ctx?.updatedAt");
  });

  it("o contexto de PONTO continua entrando nas duas", () => {
    // Ele nasce de ação explícita (contextualizar um achado) e não tem
    // autosave — tirá-lo daqui deixaria a análise velha no ar justamente no
    // caso que motivou o contexto de ponto.
    for (const p of ["../server/services/aiStatusService.ts", "../server/routers.ts"]) {
      expect(fonte(p), p).toContain("pontoEm");
    }
  });

  it("só o carimbo de confirmação escreve a coluna", () => {
    const s = fonte("../server/db.ts");
    const bloco = s.slice(s.indexOf("export async function upsertAccountContext"),
      s.indexOf("export async function appendAccountLearning"));
    expect(bloco).toContain("opcoes.confirmarParaIA");
    expect(bloco).toContain("contextoConfirmadoEm: new Date()");
  });

  it("o autosave NÃO manda confirmarParaIA", () => {
    const s = fonte("../client/src/components/AccountHeader.tsx");
    const autosave = s.slice(s.indexOf("const rascunho = useRascunhoAutosalvo("),
      s.indexOf("const upsertContextSilencioso"));
    expect(autosave).toContain("quickContext: texto");
    expect(autosave).not.toContain("confirmarParaIA");
  });

  it("o botão de confirmar manda", () => {
    const s = fonte("../client/src/components/AccountHeader.tsx");
    const botao = s.slice(s.indexOf("async function salvarContextoDoResumo"),
      s.indexOf("function saveContext"));
    expect(botao).toContain("confirmarParaIA: true");
  });

  it("`updatedAt` continua existindo — a pergunta dele é outra", () => {
    // Não foi removido: ele responde "quando o contexto mudou pela última vez",
    // inclusive por autosave.
    const s = fonte("../drizzle/schema.ts");
    const tabela = s.slice(s.indexOf("export const accountContext = mysqlTable"),
      s.indexOf("export type AccountContext"));
    expect(tabela).toContain("updatedAt");
    expect(tabela).toContain("contextoConfirmadoEm");
  });

  it("linhas antigas ficam NULL — nada gera retroativamente", () => {
    const s = readFileSync(new URL("../scripts/ensure-schema.mjs", import.meta.url), "utf-8");
    expect(s).toContain('{ name: "contextoConfirmadoEm",  ddl: "ADD COLUMN `contextoConfirmadoEm` TIMESTAMP NULL" }');
  });
});
