/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Pago e orgânico não podem se encontrar
 * ─────────────────────────────────────────────────────────────────────────────
 *  A página antiga de Redes Sociais saiu do ar por duas razões, e esta é a que
 *  não deixa rastro no compilador: ela mostrava número de CAMPANHA e número de
 *  PERFIL na mesma superfície, sob rótulos que não diziam qual era qual. Quem
 *  lia via "alcance" e supunha orgânico.
 *
 *  A defesa não é o rótulo — é a separação estrutural. O servidor devolve
 *  `organico` e `pago` como objetos distintos, e cada bloco da tela lê de um só.
 *  Um card orgânico que quisesse mostrar investimento teria que atravessar a
 *  fronteira, e é isso que estes testes procuram.
 *
 *  A outra razão da morte era `accounts[0].accessToken` — o token de mídia de
 *  uma conta arbitrária como credencial de todo o Instagram. O último teste
 *  garante que ele não voltou junto com os blocos visuais.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const semComentarios = (t: string) =>
  t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\/[^\n]*/g, "");

const pagina = () => readFileSync(new URL("./RedesSociais.tsx", import.meta.url), "utf-8");

/** As duas metades da tela, recortadas pelos marcadores de seção. */
function blocos() {
  const cru = pagina();
  const iOrg = cru.indexOf("── ORGÂNICO");
  const iPago = cru.indexOf("── PAGO");
  expect(iOrg, "marcador de seção ORGÂNICO sumiu").toBeGreaterThan(-1);
  expect(iPago, "marcador de seção PAGO sumiu").toBeGreaterThan(iOrg);
  // Os marcadores vivem DENTRO de comentários JSX. Cortar neles deixa o recorte
  // começando no meio de um comentário, cujo fecho sobrevive à limpeza — e o
  // texto do comentário passaria por código. Avança até depois do fecho.
  const depoisDoComentario = (t: string) => {
    const i = t.indexOf("*/}");
    return i === -1 ? t : t.slice(i + 3);
  };
  return {
    organico: semComentarios(depoisDoComentario(cru.slice(iOrg, iPago))),
    pago: semComentarios(depoisDoComentario(cru.slice(iPago))),
  };
}

describe("a fronteira entre as origens", () => {
  it("o bloco orgânico não lê nada de `pago`", () => {
    const linhas = blocos().organico.split("\n").filter((l) => /\bpago\b/.test(l));
    expect(linhas.map((l) => l.trim())).toEqual([]);
  });

  it("o bloco pago não lê nada de `organico`", () => {
    const linhas = blocos().pago.split("\n").filter((l) => /\borganico\b/.test(l));
    expect(linhas.map((l) => l.trim())).toEqual([]);
  });

  /**
   * Rótulo não substitui a separação, mas some junto com ela: se um dia os
   * blocos se fundirem, é a palavra "pago"/"campanha" que desaparece primeiro.
   */
  it("todo rótulo do bloco pago se identifica como pago ou de campanha", () => {
    const b = blocos().pago;
    const rotulos = Array.from(b.matchAll(/label="([^"]+)"/g), (m) => m[1]);
    expect(rotulos.length).toBeGreaterThanOrEqual(6);
    const ambiguos = rotulos.filter((r) => !/pag[oa]|campanha|mídia|investimento/i.test(r));
    expect(ambiguos).toEqual([]);
  });

  it("nenhum rótulo do bloco pago se diz orgânico", () => {
    expect(blocos().pago.toLowerCase()).not.toContain("orgânico");
  });

  it("os dois cabeçalhos declaram a origem", () => {
    const cru = pagina();
    expect(cru).toContain("Orgânico · Instagram");
    expect(cru).toContain("Mídia paga · Meta Ads");
  });
});

describe("o que matou a página antiga não voltou", () => {
  it("nada de accounts[0].accessToken", () => {
    expect(semComentarios(pagina())).not.toContain("accessToken");
  });

  /** As quatro procedures do router `socialNetworks` foram removidas. */
  it("nenhuma procedure do router morto é chamada", () => {
    const s = semComentarios(pagina());
    expect(s).not.toContain("socialNetworks.");
    expect(s).not.toContain("PaidMetricsSection");
  });

  it("a página lê pela procedure nova, que resolve a fonte", () => {
    expect(semComentarios(pagina())).toContain("trpc.social.painel.useQuery");
  });
});

describe("permissão e escrita", () => {
  it("a página é restrita a admin/dev", () => {
    const s = semComentarios(pagina());
    expect(s).toContain("canManageContent");
    expect(s).toContain("SemAcessoTracker");
  });

  /**
   * Olhar e configurar são coisas diferentes; juntá-las foi o que tornou a
   * página antiga confusa. Token, vínculo e diagnóstico moram em Conexões.
   */
  it("a página não escreve nada — nenhuma mutation", () => {
    expect(semComentarios(pagina())).not.toContain("useMutation");
  });

  it("e manda para Conexões quando falta configuração", () => {
    expect(semComentarios(pagina())).toContain("/settings?painel=conexoes");
  });
});

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  A tela não pode reimplementar as regras que já são puras
 * ─────────────────────────────────────────────────────────────────────────────
 *  Escrevi, ao montar o módulo de destaques, um ternário local para classificar
 *  publicação: `mediaType === "VIDEO" ? "REELS" : "FEED"`. É exatamente o bug
 *  que `shared/tipoDeMidia` existe para impedir — vídeo antigo de feed vira reel
 *  e infla a métrica mais olhada. Foi pego na revisão, não pelo compilador, e
 *  não seria pego pelos testes de `tipoDeMidia`, porque a tela não os usava.
 *
 *  A defesa: a página tem que CHAMAR as funções puras, não recriá-las.
 * ─────────────────────────────────────────────────────────────────────────────
 */
describe("as decisões vêm das funções puras, não de ternários locais", () => {
  const semC = (t: string) =>
    t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\/[^\n]*/g, "");

  it("classificação de mídia chama tipoDeConteudo", () => {
    const s = semC(pagina());
    expect(s).toContain("tipoDeConteudo(");
    // Nenhuma comparação solta com os valores crus da Meta.
    expect(s).not.toMatch(/mediaType\s*===\s*"(VIDEO|CAROUSEL_ALBUM|IMAGE)"/);
  });

  it("taxa de engajamento chama as funções puras, com o rótulo do divisor", () => {
    const s = semC(pagina());
    expect(s).toContain("taxaPorAlcance(");
    expect(s).toContain("taxaPorSeguidores(");
    expect(s).toContain("ROTULO_TAXA.alcance");
  });

  it("saldo de seguidores sai de saldoDeSeguidores, e não de subtração local", () => {
    expect(semC(pagina())).toContain("saldoDeSeguidores(");
  });

  /** A trava do pedido: nada de "novos" e "saídas" sem prova aritmética. */
  it("entradas e saídas passam por podeMostrarEntradasESaidas", () => {
    const s = semC(pagina());
    expect(s).toContain("podeMostrarEntradasESaidas(");
    expect(s).not.toContain("novos seguidores");
    expect(s).not.toContain("deixaram de seguir");
  });

  it("o período honesto vem de textoDeCobertura", () => {
    expect(semC(pagina())).toContain("textoDeCobertura(");
  });
});
