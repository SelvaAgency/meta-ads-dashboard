/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  O risco deste módulo é ele virar o Trello de novo
 * ─────────────────────────────────────────────────────────────────────────────
 *  Painel de direcionamento e lista de tarefas parecem a mesma coisa na tela e
 *  são opostos no uso: a lista quer ser completa, o direcionamento quer ser
 *  curto. Quando ele fica completo, ninguém lê.
 *
 *  Duas regras seguram isso, e as duas são testadas aqui:
 *
 *   SEM VAZIO   tipo sem item não aparece. "ENTREGAS — nenhuma" é um campo a
 *               preencher disfarçado de informação, e o convite a preencher é
 *               exatamente como uma lista de tarefas nasce
 *
 *   CORTE       o limite é sobre o TOTAL do grupo. Seis por tipo seriam dezoito
 *               itens na Home — o número que o corte existe para impedir
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, expect, it } from "vitest";
import {
  agruparPorTipo, cortar, vizinhoNaOrdem, type ItemPrioridade, type TipoPrioridade,
} from "./prioridades";

let seq = 0;
const item = (tipo: TipoPrioridade, over: Partial<ItemPrioridade> = {}): ItemPrioridade => ({
  id: ++seq, grupo: "cc", semana: "2026-08-10", tipo,
  titulo: `item ${seq}`, descricao: null, responsavel: null, prazo: null,
  status: "PLANEJADO", ordem: 0, ...over,
});

describe("tipo sem item não aparece", () => {
  /** O pedido é explícito: uma semana com duas prioridades mostra duas. */
  it("uma semana só com prioridades tem uma seção só", () => {
    const s = agruparPorTipo([item("PRIORIDADE"), item("PRIORIDADE")]);
    expect(s).toHaveLength(1);
    expect(s[0].tipo).toBe("PRIORIDADE");
    expect(s[0].itens).toHaveLength(2);
  });

  it("lista vazia não produz seção nenhuma", () => {
    expect(agruparPorTipo([])).toEqual([]);
  });
});

describe("a ordem dos tipos é a hierarquia da leitura", () => {
  /**
   * ATENÇÃO por último não é desimportância: é ressalva, e ressalva antes do
   * fato não tem em que se apoiar.
   */
  it("prioridade, entrega e só então atenção — qualquer que seja a ordem de entrada", () => {
    const s = agruparPorTipo([item("ATENCAO"), item("ENTREGA"), item("PRIORIDADE")]);
    expect(s.map((x) => x.tipo)).toEqual(["PRIORIDADE", "ENTREGA", "ATENCAO"]);
  });

  it("dentro do tipo, manda o campo ordem", () => {
    const s = agruparPorTipo([
      item("PRIORIDADE", { ordem: 2, titulo: "segundo" }),
      item("PRIORIDADE", { ordem: 1, titulo: "primeiro" }),
    ]);
    expect(s[0].itens.map((i) => i.titulo)).toEqual(["primeiro", "segundo"]);
  });
});

describe("o corte é sobre o total, e não por tipo", () => {
  it("abaixo do limite, nada é cortado", () => {
    const s = agruparPorTipo([item("PRIORIDADE"), item("ENTREGA")]);
    expect(cortar(s, 6).ocultos).toBe(0);
    expect(cortar(s, 6).visiveis).toHaveLength(2);
  });

  /** Seis por tipo seriam dezoito na Home — o número que o corte impede. */
  it("seis prioridades e seis entregas cortam em seis no total", () => {
    const s = agruparPorTipo([
      ...Array.from({ length: 6 }, () => item("PRIORIDADE")),
      ...Array.from({ length: 6 }, () => item("ENTREGA")),
    ]);
    const { visiveis, ocultos } = cortar(s, 6);
    expect(visiveis.reduce((n, x) => n + x.itens.length, 0)).toBe(6);
    expect(ocultos).toBe(6);
  });

  /** Título de seção sem item embaixo é ruído puro. */
  it("seção que ficaria vazia depois do corte some inteira", () => {
    const s = agruparPorTipo([
      ...Array.from({ length: 6 }, () => item("PRIORIDADE")),
      item("ENTREGA"),
    ]);
    const { visiveis } = cortar(s, 6);
    expect(visiveis.map((x) => x.tipo)).toEqual(["PRIORIDADE"]);
  });

  it("o corte atravessa a fronteira das seções quando precisa", () => {
    const s = agruparPorTipo([
      item("PRIORIDADE", { titulo: "p1" }),
      item("PRIORIDADE", { titulo: "p2" }),
      item("ENTREGA", { titulo: "e1" }),
      item("ENTREGA", { titulo: "e2" }),
    ]);
    const { visiveis, ocultos } = cortar(s, 3);
    expect(visiveis[0].itens).toHaveLength(2);
    expect(visiveis[1].itens.map((i) => i.titulo)).toEqual(["e1"]);
    expect(ocultos).toBe(1);
  });
});

describe("mover na ordem", () => {
  it("acha o vizinho de cima e o de baixo", () => {
    const a = item("PRIORIDADE", { ordem: 1 });
    const b = item("PRIORIDADE", { ordem: 2 });
    const c = item("PRIORIDADE", { ordem: 3 });
    expect(vizinhoNaOrdem([a, b, c], b.id, -1)?.id).toBe(a.id);
    expect(vizinhoNaOrdem([a, b, c], b.id, 1)?.id).toBe(c.id);
  });

  /**
   * `null` na ponta evita gravar uma troca consigo mesmo — que produz escrita,
   * carimba "atualizado por" e não muda nada na tela.
   */
  it("nas pontas não existe vizinho, e isso não é um erro", () => {
    const a = item("PRIORIDADE", { ordem: 1 });
    const b = item("PRIORIDADE", { ordem: 2 });
    expect(vizinhoNaOrdem([a, b], a.id, -1)).toBeNull();
    expect(vizinhoNaOrdem([a, b], b.id, 1)).toBeNull();
  });
});
