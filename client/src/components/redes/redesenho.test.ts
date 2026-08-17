/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  O que o redesenho não pode desfazer
 * ─────────────────────────────────────────────────────────────────────────────
 *  Redesenho é a rodada em que mais se perde dado sem querer: um card fica mais
 *  limpo porque uma métrica saiu, um gráfico fica mais bonito porque a ressalva
 *  foi embora. Estes testes guardam três coisas que o compilador não vê.
 *
 *   PALETA ÚNICA     duas listas de cor para as mesmas métricas divergem na
 *                    primeira mudança, e aí o roxo do gráfico deixa de ser o
 *                    roxo do card — a paleta funcional para de funcionar
 *                    exatamente onde ela existe para ajudar
 *
 *   NENHUMA MÉTRICA  a faixa geral tem cinco, e todas continuam lá. Um card que
 *   SUMIU            desaparece num redesenho não deixa rastro nenhum
 *
 *   RETENÇÃO SEM     não há dado de retenção. Uma curva desenhada ali seria lida
 *   CURVA            como medição, e ninguém conferiria
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { COR, COR_TIPO } from "@shared/coresSociais";

const semComentarios = (t: string) =>
  t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\/[^\n]*/g, "");
const fonte = (p: string) => semComentarios(readFileSync(new URL(p, import.meta.url), "utf-8"));

const pagina = () => fonte("../../pages/RedesSociais.tsx");
const grafico = () => fonte("./GraficoDaConta.tsx");
const retencao = () => fonte("./RetencaoReels.tsx");
const conteudo = () => fonte("./PublicacoesEConteudo.tsx");

describe("a paleta é única", () => {
  /** Cada família tem UM matiz, e ele mora num lugar só. */
  it("gráficos e cards leem de shared/coresSociais", () => {
    expect(grafico()).toContain("@shared/coresSociais");
    expect(pagina()).toContain("@shared/coresSociais");
    expect(conteudo()).toContain("@shared/coresSociais");
  });

  /**
   * O erro concreto: um `#8B5CF6` sobrevivendo num componente depois de a paleta
   * ter mudado para `#7C5CE0`. O gráfico ficaria com o roxo antigo e o card com
   * o novo, e a mesma métrica teria duas cores na mesma tela.
   */
  it("nenhum componente redeclara hex de métrica", () => {
    for (const [nome, f] of [["gráfico", grafico], ["página", pagina]] as const) {
      const s = f();
      for (const hex of Object.values(COR)) {
        // O hex pode aparecer, mas não numa constante local de cor.
        expect(s, `${nome} redeclarou ${hex}`).not.toMatch(
          new RegExp(`const\\s+COR_?\\w*\\s*[:=][^;]*${hex}`, "i"));
      }
    }
  });

  it("todo tipo de conteúdo tem cor", () => {
    for (const t of ["FEED", "CARROSSEL", "REELS", "STORY", "ANUNCIO", "DESCONHECIDO"] as const) {
      expect(COR_TIPO[t]).toMatch(/^#[0-9A-F]{6}$/i);
    }
  });
});

describe("nenhuma métrica saiu da faixa geral", () => {
  /** As cinco que existiam antes do redesenho. */
  it("as cinco continuam sendo montadas", () => {
    const s = pagina();
    for (const r of ["Ativações", "Engajamento", "Respostas aos Stories", "Visitas ao perfil", "Cliques no link"]) {
      expect(s, `"${r}" saiu da faixa`).toContain(`rotulo="${r}"`);
    }
  });

  /** As ressalvas são o que separa "medido zero" de "não medido". */
  it("as ressalvas de disponibilidade sobreviveram", () => {
    const s = pagina();
    expect(s).toContain("publicações indisponíveis nesta coleta");
    expect(s).toContain("sem medição de stories");
    expect(s).toContain("não medida nesta coleta");
    expect(s).toContain("rotuloVisitas.resumo");
  });

  /** Views entrou no card de publicação — o snapshot já tinha o campo. */
  it("a publicação mostra views além de alcance, interações e taxa", () => {
    const s = conteudo();
    for (const r of ["alcance", "interações", "taxa", "views"]) {
      expect(s).toContain(`rotulo="${r}"`);
    }
  });
});

describe("a retenção de Reels não ganha curva", () => {
  /**
   * O componente existe para registrar a pergunta sem resposta. Se alguém
   * desenhar uma linha ali, ela será lida como medição.
   */
  it("nenhum path, polyline ou dado de série no componente", () => {
    const s = retencao();
    expect(s).not.toMatch(/<(path|polyline|Line|Area)\b/);
    expect(s).not.toMatch(/\[\s*100\s*,/);
  });

  it("diz na tela que o dado não existe, e qual sondagem falta", () => {
    const s = retencao();
    expect(s).toContain("Dado ainda não disponível");
    expect(s).toContain("ig_reels_avg_watch_time");
    // E que a sondagem daria média, NÃO a curva.
    expect(s).toMatch(/não<\/strong>\s*\{?"?\s*para/);
  });
});

describe("o ranking mostra as duas pontas sem repetir publicação", () => {
  /**
   * Com quatro publicações, três melhores e três piores repetiriam duas — e a
   * mesma publicação apareceria como melhor e como pior na mesma tela.
   */
  it("piores só existe com amostra suficiente", () => {
    const s = pagina();
    expect(s).toContain("comTaxa.length >= 4");
    expect(s).toContain("Math.floor(comTaxa.length / 2)");
  });

  it("a seção recebe as duas listas", () => {
    expect(pagina()).toContain("piores={piores}");
  });
});
