/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Resumo = conclusão. Ponto técnico = problema + contexto + ação.
 * ─────────────────────────────────────────────────────────────────────────────
 *  O cabeçalho da conta chegou a mostrar as duas coisas, e o efeito era pior que
 *  redundância: a frase do resumo já concluía ("sem conversões reais — pedido
 *  identificado como teste") e logo abaixo o mesmo fato voltava em linguagem de
 *  alerta ("⚠ Ponto técnico: 1 pedido pago somando R$ 0…"), como se a conclusão
 *  não tivesse valido.
 *
 *  Junto vinha "Contextualizado", que é vocabulário INTERNO — o sistema usa
 *  `status: "contextualizado"` para contar e priorizar, e quem lê a tela não
 *  precisa desse termo para nada.
 *
 *  Um teste de leitura de fonte porque o compilador não pega isto: reintroduzir
 *  a linha do adendo é JSX perfeitamente válido, e o sintoma só apareceria para
 *  quem abrir a tela e reparar na repetição.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const semComentarios = (t: string) =>
  t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\/[^\n]*/g, "");

const cabecalho = () => semComentarios(readFileSync(new URL("./AccountHeader.tsx", import.meta.url), "utf-8"));
const panorama = () => semComentarios(readFileSync(new URL("../pages/Panorama.tsx", import.meta.url), "utf-8"));

describe("o cabeçalho mostra só a conclusão", () => {
  it('não escreve "Ponto técnico"', () => {
    expect(cabecalho()).not.toContain("Ponto técnico");
  });

  /** O termo é interno: serve para contar e priorizar, não para ler. */
  it('não expõe "Contextualizado" nem "ver ou editar"', () => {
    const s = cabecalho();
    expect(s).not.toContain("Contextualizado");
    expect(s).not.toContain("ver ou editar");
    expect(s).not.toContain("Contextualizar");
  });

  /** Nem o texto do alerta, nem qualquer indicador de que existe contexto. */
  it("não lê o adendo técnico da saúde da conta", () => {
    const s = cabecalho();
    expect(s).not.toContain("adendoSaude");
    expect(s).not.toContain("adendoContexto");
    expect(s).not.toContain("adendoChave");
  });

  /**
   * O aviso de análise desatualizada FICA: ele não é sobre um ponto específico,
   * é sobre a conclusão que está na tela não ter visto o contexto atual.
   */
  it("mas mantém o aviso de análise desatualizada", () => {
    expect(cabecalho()).toContain("Análise desatualizada");
  });
});

describe("a ação de contextualizar vive no Panorama", () => {
  /** Se ela não existir em lugar nenhum, remover do cabeçalho perdeu a função. */
  it("o Panorama tem a ação e a mutation", () => {
    const s = panorama();
    expect(s).toContain("Contextualizar");
    expect(s).toContain("salvarContextoDePonto");
  });

  /**
   * A coluna de problemas não pode contradizer os contadores do topo, que já
   * não contam o achado explicado.
   */
  it("o achado explicado sai da lista de problemas abertos", () => {
    expect(panorama()).toMatch(/status !== "contextualizado"/);
  });

  /** Mas o fato continua consultável — o pedido é de não apagar histórico. */
  it("e continua visível num tom discreto, sem chip de alerta", () => {
    const s = panorama();
    expect(s).toMatch(/status === "contextualizado"/);
    expect(s).toContain("explicado");
  });

  /** Salvar precisa recarregar o Panorama: muda contador e posição, não só a linha. */
  it("salvar invalida o Panorama inteiro", () => {
    expect(panorama()).toContain("utils.panorama.sites.invalidate()");
  });
});
