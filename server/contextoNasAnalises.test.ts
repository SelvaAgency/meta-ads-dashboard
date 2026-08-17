/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Toda IA precisa embalar o contexto do MESMO jeito
 * ─────────────────────────────────────────────────────────────────────────────
 *  O bug que este arquivo guarda não estava no encanamento: o contexto sempre
 *  chegou ao prompt, e `montarContextoDaConta` já era fonte única. O que
 *  divergia era a INSTRUÇÃO — cada análise escrevia o próprio cabeçalho, e a
 *  mais usada dizia "pode explicar variações que os números não mostram".
 *
 *  Isso descreve comentário de cor. Diante de "essa compra foi teste,
 *  desconsidere", o modelo mencionava o teste e continuava contando a conversão,
 *  porque foi exatamente isso que o prompt pediu.
 *
 *  Quatro embalagens eram quatro análises: Panorama e plano técnico podiam
 *  concluir coisas opostas sobre o mesmo dado, e nada no código dizia que
 *  deviam concordar. Estes testes leem a FONTE e garantem que a embalagem
 *  própria não volte — o compilador não pega isso, porque uma string a mais num
 *  template é código perfeitamente válido.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const semComentarios = (t: string) =>
  t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

const fonte = (p: string) => semComentarios(readFileSync(new URL(p, import.meta.url), "utf-8"));

/** As análises que recebem contexto da conta e produzem texto para o cliente. */
const ANALISES = [
  ["Panorama / leitura de 7 dias", "./services/aiStatusService.ts"],
  ["Relatório", "./services/reportBuilder.ts"],
  ["Plano técnico do site", "./services/siteReportService.ts"],
] as const;

describe("todas as análises usam o MESMO bloco de contexto", () => {
  for (const [nome, caminho] of ANALISES) {
    it(`${nome} monta o contexto pela função compartilhada`, () => {
      const s = fonte(caminho);
      expect(s, `${nome} deixou de usar blocoDeContextoParaIA`).toContain("blocoDeContextoParaIA(");
    });

    /**
     * O engano exato que existia: montar o cabeçalho do contexto na mão. Uma
     * análise que volte a escrever "CONTEXTO ..." num template próprio está
     * instruindo o modelo do seu jeito de novo — e é assim que Panorama e plano
     * técnico voltam a discordar.
     */
    it(`${nome} não escreve um cabeçalho de contexto próprio`, () => {
      const s = fonte(caminho);
      expect(s).not.toMatch(/CONTEXTO \(considere/);
      expect(s).not.toMatch(/════ CONTEXTO DA CONTA E DA AG/);
    });

    /** E continua lendo o contexto da fonte única, não de tabela avulsa. */
    it(`${nome} lê o contexto por montarContextoDaConta`, () => {
      expect(fonte(caminho)).toContain("montarContextoDaConta");
    });
  }
});

describe("o enquadramento fraco não volta", () => {
  /**
   * A frase que causava o problema, procurada em toda a base. "Pode explicar"
   * autoriza o modelo a citar e ignorar; é o oposto do que o contexto precisa
   * fazer.
   */
  it('nenhum prompt diz que o contexto "pode explicar variações"', () => {
    for (const [nome, caminho] of ANALISES) {
      expect(fonte(caminho), nome).not.toContain("pode explicar variações");
    }
  });
});

describe("o contexto é por CONTA, e não pode vazar", () => {
  /**
   * `montarContextoDaConta` recebe `accountId` e lê só as linhas daquela conta.
   * O risco seria uma análise montar contexto sem o id — pegando o de outra
   * conta, ou o de todas. Item 5 do pedido: o contexto do MNBR não pode alterar
   * a leitura da Elwing.
   */
  it("toda montagem de contexto passa um accountId", () => {
    for (const [nome, caminho] of ANALISES) {
      const s = fonte(caminho);
      const chamadas = s.match(/montarContextoDaConta\(\{[^}]*\}/g) ?? [];
      expect(chamadas.length, `${nome} não chama montarContextoDaConta`).toBeGreaterThan(0);
      for (const c of chamadas) expect(c, `${nome}: ${c}`).toContain("accountId");
    }
  });
});
