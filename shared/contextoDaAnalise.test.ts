/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Provar que o contexto ENTRA no raciocínio, e não só no prompt
 * ─────────────────────────────────────────────────────────────────────────────
 *  O que um teste pode e não pode fazer aqui, dito de frente: ele NÃO verifica a
 *  saída do modelo — isso exigiria chamar a IA, e o resultado variaria a cada
 *  execução. O que ele verifica é a única coisa determinística e a única que
 *  estava errada: a INSTRUÇÃO que acompanha o contexto.
 *
 *  Era exatamente esse o bug. O contexto sempre chegou ao prompt; ele chegava
 *  embalado como "pode explicar variações", que descreve comentário de cor. O
 *  modelo obedecia: mencionava o teste e continuava contando a conversão.
 *
 *  Então os testes cobrem três coisas:
 *
 *   AUTORIDADE   com contexto, a instrução manda a CONCLUSÃO refletir a
 *                qualificação — e diz que mencionar não basta
 *   SIMETRIA     Panorama e plano técnico recebem o MESMO texto, porque a
 *                divergência nascia de cada um embalar do seu jeito
 *   SILÊNCIO     sem contexto, nenhuma diretriz aparece. Diretriz sobre
 *                contexto inexistente faz o modelo qualificar dados sozinho
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, expect, it } from "vitest";
import {
  analiseDesatualizada, blocoDeContextoParaIA, DIRETRIZES_DE_CONTEXTO,
} from "./contextoDaAnalise";

/** O caso do pedido, literal. */
const CTX_TESTE = "Compra realizada como teste pela equipe. Desconsiderar como conversão.";

describe("com contexto, a instrução tem autoridade sobre o número", () => {
  const r = blocoDeContextoParaIA(CTX_TESTE);

  it("o contexto vai íntegro para o prompt", () => {
    expect(r.temContexto).toBe(true);
    expect(r.bloco).toContain(CTX_TESTE);
  });

  /**
   * A frase que faltava. "Considere o contexto" o modelo cumpre citando; "a sua
   * conclusão precisa refletir" ele só cumpre mudando a conclusão.
   */
  it("manda a CONCLUSÃO refletir a qualificação, não só mencioná-la", () => {
    expect(r.bloco).toContain("autoridade sobre a INTERPRETAÇÃO");
    expect(r.bloco).toMatch(/conclusão precisa refletir essa qualificação/);
    expect(r.bloco).toContain("Não basta mencionar o contexto");
  });

  /** A cadeia DADO → CONTEXTO → INTERPRETAÇÃO exige que o dado sobreviva. */
  it("preserva o dado bruto e proíbe apresentá-lo como resultado válido", () => {
    expect(r.bloco).toContain("dado bruto continua existindo");
    expect(r.bloco).toMatch(/desqualificado pelo contexto/);
  });

  /** Contexto é afirmação da equipe, não medição do sistema. */
  it("exige atribuição e proíbe inventar evidência", () => {
    expect(r.bloco).toContain("segundo o contexto informado pela equipe");
    expect(r.bloco).toContain("Nunca invente evidência");
  });

  it("todas as diretrizes entram no bloco, numeradas", () => {
    expect(r.diretrizes).toEqual(DIRETRIZES_DE_CONTEXTO);
    for (const d of DIRETRIZES_DE_CONTEXTO) {
      // A diretriz é longa e quebrada em concatenação; confere o começo dela.
      expect(r.bloco).toContain(d.slice(0, 40));
    }
    expect(r.bloco).toContain("1. ");
    expect(r.bloco).toContain(`${DIRETRIZES_DE_CONTEXTO.length}. `);
  });
});

describe("sem contexto, nada muda", () => {
  /**
   * O teste inverso que o pedido exige. Sem qualificação nenhuma, a compra tem
   * que continuar sendo tratada como conversão — e para isso o prompt não pode
   * ganhar instrução alguma sobre desqualificar dados.
   */
  it("bloco vazio e nenhuma diretriz", () => {
    for (const vazio of [null, undefined, "", "   "]) {
      const r = blocoDeContextoParaIA(vazio);
      expect(r.temContexto).toBe(false);
      expect(r.bloco).toBe("");
      expect(r.diretrizes).toEqual([]);
    }
  });

  /**
   * O ponto fino: diretriz sem contexto seria pior que nada. Ela instruiria o
   * modelo a procurar qualificação que ninguém escreveu — e ele obedece,
   * passando a desqualificar dados por conta própria.
   */
  it("não solta as diretrizes órfãs quando não há o que governar", () => {
    const r = blocoDeContextoParaIA("");
    expect(r.bloco).not.toContain("autoridade");
    expect(r.bloco).not.toContain("qualificação");
  });
});

describe("Panorama e plano técnico recebem o MESMO contexto", () => {
  /**
   * A divergência nascia daqui: cada análise escrevia o próprio cabeçalho para o
   * mesmo texto. Uma função, um resultado — e se alguém voltar a embalar por
   * conta própria, este teste não pega, mas o de leitura de fonte pega.
   */
  it("a mesma entrada produz o mesmo bloco, byte a byte", () => {
    const panorama = blocoDeContextoParaIA(CTX_TESTE);
    const planoTecnico = blocoDeContextoParaIA(CTX_TESTE);
    expect(panorama.bloco).toBe(planoTecnico.bloco);
  });
});

describe("o contexto do momento e o guardado convivem", () => {
  it("os dois entram, e o do momento vem depois", () => {
    const r = blocoDeContextoParaIA("Cliente é B2B.", "Campanha pausada dias 12 e 13.");
    expect(r.bloco).toContain("Cliente é B2B.");
    expect(r.bloco).toContain("Campanha pausada dias 12 e 13.");
    // Numa contradição, o mais recente é o que a equipe acabou de afirmar.
    //
    // O trecho comparado é "dias 12 e 13", e não "pausada": a palavra
    // "pausada" também aparece nas DIRETRIZES, que vêm antes do corpo — medir
    // por ela compararia a instrução com o contexto, e não os dois contextos.
    expect(r.bloco.indexOf("B2B")).toBeLessThan(r.bloco.indexOf("dias 12 e 13"));
  });

  it("só o do momento também produz bloco com autoridade", () => {
    const r = blocoDeContextoParaIA(null, CTX_TESTE);
    expect(r.temContexto).toBe(true);
    expect(r.bloco).toContain("autoridade sobre a INTERPRETAÇÃO");
  });
});

describe("a análise guardada envelhece quando o contexto muda", () => {
  const analise = new Date("2026-08-14T10:00:00Z");

  it("contexto salvo depois da análise a deixa desatualizada", () => {
    expect(analiseDesatualizada(analise, new Date("2026-08-14T10:05:00Z"))).toBe(true);
  });

  it("contexto anterior à análise não acusa nada", () => {
    expect(analiseDesatualizada(analise, new Date("2026-08-14T09:00:00Z"))).toBe(false);
  });

  /** Aviso falso de "desatualizada" ensina a ignorar o aviso. */
  it("sem uma das duas datas, não acusa", () => {
    expect(analiseDesatualizada(null, new Date())).toBe(false);
    expect(analiseDesatualizada(new Date(), null)).toBe(false);
    expect(analiseDesatualizada("nada disso", new Date())).toBe(false);
  });

  it("aceita string, que é como chega do servidor", () => {
    expect(analiseDesatualizada("2026-08-14T10:00:00Z", "2026-08-14T11:00:00Z")).toBe(true);
  });
});
