/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  As duas regras de publicação, e a que abrir a página não custe cota
 * ─────────────────────────────────────────────────────────────────────────────
 *  As duas primeiras foram compradas com 400 na cara na Fase 0; a terceira é a
 *  única proteção contra gastar a cota diária numa tarde de exploração.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { casarPorUrn, lotesPorTipo } from "./coletaLinkedIn";

const raiz = join(__dirname, "..", "..");
const ler = (p: string) => readFileSync(join(raiz, p), "utf8");
/** Guardas que leem fonte precisam ignorar o que está em comentário. */
const semComentarios = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/**
 * O bloco do router do laboratório, e SÓ ele.
 *
 * Fatiar até o próximo comentário falharia depois de `semComentarios` — que os
 * removeu. O fecho é a linha de fechamento na indentação do próprio bloco.
 */
function blocoDoLab(fonte: string): string {
  const i = fonte.indexOf("linkedinLab: router({");
  expect(i).toBeGreaterThan(0);
  const fim = fonte.indexOf("\n    }),", i);
  expect(fim).toBeGreaterThan(i);
  return fonte.slice(i, fim);
}

describe("o lote nunca mistura tipos de URN", () => {
  it("`ugcPost` e `share` saem em lotes separados", () => {
    // `Deserializing output 'urn:li:ugcPost:…' failed` foi o 400 que apagou a
    // medição de retroatividade em duas Páginas.
    const lotes = lotesPorTipo([
      "urn:li:ugcPost:1", "urn:li:share:2", "urn:li:ugcPost:3", "urn:li:share:4",
    ], 5);
    expect(lotes).toHaveLength(2);
    for (const l of lotes) {
      const tipos = new Set(l.map((u) => (u.includes(":ugcPost:") ? "ugc" : "share")));
      expect(tipos.size).toBe(1);
    }
  });

  it("cada tipo arredonda para cima sozinho", () => {
    const lotes = lotesPorTipo(
      [...Array(6)].map((_, i) => `urn:li:ugcPost:${i}`)
        .concat([...Array(6)].map((_, i) => `urn:li:share:${i}`)), 5);
    expect(lotes.map((l) => l.length)).toEqual([5, 1, 5, 1]);
  });
});

describe("a resposta é casada pelo URN devolvido", () => {
  it("o lote OMITE post sem estatística — e a posição mentiria", () => {
    // Pedimos 2 e voltou 1, medido na Fase 0. Por posição, a métrica do
    // primeiro cairia no segundo sem erro nenhum.
    const m = casarPorUrn([
      { ugcPost: "urn:li:ugcPost:B", totalShareStatistics: { impressionCount: 99 } },
    ]);
    expect(m.get("urn:li:ugcPost:B")).toEqual({ impressionCount: 99 });
    expect(m.get("urn:li:ugcPost:A")).toBeUndefined();
  });

  it("aceita `share` como chave de retorno também", () => {
    const m = casarPorUrn([{ share: "urn:li:share:7", totalShareStatistics: { clickCount: 3 } }]);
    expect(m.get("urn:li:share:7")).toEqual({ clickCount: 3 });
  });

  it("elemento sem URN é descartado, e não vira métrica órfã", () => {
    expect(casarPorUrn([{ totalShareStatistics: { impressionCount: 5 } }]).size).toBe(0);
  });
});

describe("abrir o laboratório NÃO gasta cota", () => {
  it("a camada de leitura não importa a camada de API", () => {
    // A cota do LinkedIn é diária e invisível. Um import de `linkedinApi` aqui
    // seria o caminho por onde uma query passaria a chamar a rede — e ninguém
    // descobriria pelo erro, e sim pelo silêncio da API no dia seguinte.
    const fonte = semComentarios(ler("server/services/linkedinLabDados.ts"));
    expect(fonte).not.toContain("linkedinApi");
    expect(fonte).not.toContain("medirLinkedIn");
    expect(fonte).not.toContain("fetch(");
  });

  it("a página não faz polling nem refetch no foco", () => {
    const fonte = semComentarios(ler("client/src/pages/LinkedinLab.tsx"));
    expect(fonte).toContain("refetchOnWindowFocus: false");
    expect(fonte).toContain("refetchInterval: false");
    // Um intervalo em milissegundos aqui seria uma chamada a cada N segundos.
    expect(fonte).not.toMatch(/refetchInterval:\s*\d/);
  });

  it("só sincronizar e carga são mutation — o resto é query", () => {
    const fonte = semComentarios(ler("server/routers.ts"));
    const corpo = blocoDoLab(fonte);
    // As leituras de dado são queries; as três mutations são ações explícitas.
    expect(corpo).toContain("pagina: laboratorioProcedure\n");
    expect(corpo.match(/\.mutation\(/g)?.length).toBe(4);
  });
});

describe("a porta do laboratório", () => {
  it("toda procedure do lab é `laboratorioProcedure`", () => {
    const fonte = semComentarios(ler("server/routers.ts"));
    const bloco = blocoDoLab(fonte);
    expect(bloco).not.toContain("authedProcedure");
    expect(bloco).not.toContain("publicProcedure");
    expect(bloco).not.toContain("protectedProcedure");
    expect(bloco.match(/laboratorioProcedure/g)?.length).toBeGreaterThanOrEqual(6);
  });

  it("a rota tem guarda de UI própria, e não a de conteúdo", () => {
    const app = semComentarios(ler("client/src/App.tsx"));
    expect(app).toMatch(/path="\/linkedin-lab"[\s\S]{0,120}LaboratorioOnly/);
  });

  it("a rota NÃO está na allowlist interna do Tracker", () => {
    // Entrar ali faria a rota redirecionar para o shell e abrir como
    // `/tracker?rota=%2Flinkedin-lab` — o mesmo defeito que `/consumo-ia` teve.
    expect(ler("client/src/pages/hub/trackerRoutes.ts")).not.toContain('"/linkedin-lab"');
  });

  it("a permissão é função própria, não `canManageContent` emprestada", () => {
    const p = semComentarios(ler("shared/permissions.ts"));
    expect(p).toContain("export function canAccessLaboratorio");
    const sidebar = semComentarios(ler("client/src/pages/hub/HubSidebar.tsx"));
    expect(sidebar).toMatch(/linkedin-lab[\s\S]{0,80}canAccessLaboratorio|canAccessLaboratorio[\s\S]{0,80}linkedin-lab/);
  });
});

describe("o coletor não inventa zero", () => {
  it("nenhuma coluna numérica recebe `?? 0`", () => {
    // 0 é medida; ausência é NULL. Um `?? 0` de consolo apagaria a diferença
    // entre "a Página não teve visitas" e "a API não deixou ver".
    const fonte = semComentarios(ler("server/services/coletaLinkedIn.ts"));
    expect(fonte).not.toMatch(/(impressions|clicks|likes|comments|shares|seguidoresTotal|ganhoOrganico):\s*[^,\n]*\?\?\s*0/);
  });

  it("o cron do LinkedIn nasce desligado", () => {
    const fonte = semComentarios(ler("server/services/rodarColetaLinkedIn.ts"));
    expect(fonte).toContain("LINKEDIN_COLETA_ENABLED");
    const auto = semComentarios(ler("server/autoSync.ts"));
    // E envolto em `agendado()`, senão o consumo sai como "Não rastreado".
    expect(auto).toMatch(/agendado\(\s*\n?\s*"rodarColetaLinkedIn"/);
  });
});
