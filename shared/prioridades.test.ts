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
  agruparPorTipo, cortar, ordenarPorPrazo, type ItemPrioridade, type TipoPrioridade,
} from "./prioridades";

let seq = 0;
const item = (tipo: TipoPrioridade, over: Partial<ItemPrioridade> = {}): ItemPrioridade => ({
  id: ++seq, grupo: "cc", semana: "2026-08-10", tipo,
  titulo: `item ${seq}`, descricao: null, prazo: null, status: "PLANEJADO",
  responsavelUserId: null, responsavelNome: null, responsavelAvatarUrl: null,
  ...over,
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

  it("dentro do tipo, manda o prazo", () => {
    const s = agruparPorTipo([
      item("PRIORIDADE", { prazo: "2026-08-20", titulo: "segundo" }),
      item("PRIORIDADE", { prazo: "2026-08-14", titulo: "primeiro" }),
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

describe("a ordem é do prazo, e ninguém a arrasta", () => {
  it("prazo mais próximo primeiro", () => {
    const r = ordenarPorPrazo([
      item("PRIORIDADE", { prazo: "2026-08-30", titulo: "c" }),
      item("PRIORIDADE", { prazo: "2026-08-14", titulo: "a" }),
      item("PRIORIDADE", { prazo: "2026-08-21", titulo: "b" }),
    ]);
    expect(r.map((i) => i.titulo)).toEqual(["a", "b", "c"]);
  });

  /** Sem prazo não é menos importante — só não compete no eixo que ordena. */
  it("sem prazo vai para o fim, depois de todos os que têm", () => {
    const r = ordenarPorPrazo([
      item("PRIORIDADE", { titulo: "sem" }),
      item("PRIORIDADE", { prazo: "2026-08-30", titulo: "longe" }),
    ]);
    expect(r.map((i) => i.titulo)).toEqual(["longe", "sem"]);
  });

  /**
   * Prazo estourado é a coisa mais urgente da lista. Ordenação crescente já o
   * coloca em primeiro; escondê-lo no fim seria o oposto da função do painel.
   */
  it("prazo vencido vem antes do que ainda vai vencer", () => {
    const r = ordenarPorPrazo([
      item("PRIORIDADE", { prazo: "2026-08-25", titulo: "futuro" }),
      item("PRIORIDADE", { prazo: "2026-08-01", titulo: "vencido" }),
    ]);
    expect(r.map((i) => i.titulo)).toEqual(["vencido", "futuro"]);
  });

  /** Sem critério estável a lista se reembaralharia a cada leitura. */
  it("empate no prazo cai na ordem de criação, e é estável", () => {
    const a = item("PRIORIDADE", { prazo: "2026-08-14", titulo: "a" });
    const b = item("PRIORIDADE", { prazo: "2026-08-14", titulo: "b" });
    expect(ordenarPorPrazo([b, a]).map((i) => i.titulo)).toEqual(["a", "b"]);
    expect(ordenarPorPrazo([a, b]).map((i) => i.titulo)).toEqual(["a", "b"]);
  });

  it("não muda a lista original", () => {
    const lista = [item("PRIORIDADE", { prazo: "2026-08-30" }), item("PRIORIDADE", { prazo: "2026-08-01" })];
    const antes = lista.map((i) => i.id);
    ordenarPorPrazo(lista);
    expect(lista.map((i) => i.id)).toEqual(antes);
  });
});
