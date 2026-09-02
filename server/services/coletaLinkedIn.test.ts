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
    // Toda LEITURA é query; mutation é só ação explícita do usuário. Contar
    // mutations envelheceria a cada procedure nova — o que importa é que
    // nenhuma leitura vire uma.
    for (const leitura of ["vinculos", "todosOsVinculos", "pagina", "orcamento"]) {
      const i = corpo.indexOf(`${leitura}: laboratorioProcedure`);
      expect(i, leitura).toBeGreaterThan(0);
      const trecho = corpo.slice(i, i + 400);
      expect(trecho.indexOf(".query("), leitura).toBeGreaterThan(0);
      expect(trecho.slice(0, trecho.indexOf(".query(")), leitura).not.toContain(".mutation(");
    }
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

  it("a rota renderiza DENTRO do Tracker, como o Rascunho", () => {
    // Guarda de portal aqui desenharia o shell do Spaces em volta do chrome do
    // BIT — duas molduras, uma dentro da outra. A permissão mora na página.
    const app = semComentarios(ler("client/src/App.tsx"));
    expect(app).toMatch(/path="\/linkedin-lab"[\s\S]{0,120}<Interna>/);
    expect(app).not.toContain("LaboratorioOnly");
  });

  it("a rota ESTÁ na allowlist interna do Tracker", () => {
    // Sem isto, quem clicasse no item da sidebar cairia no Tracker genérico —
    // sem erro nenhum na tela. É o oposto de `/consumo-ia`, que saiu da lista
    // justamente por ser página do portal.
    expect(ler("client/src/pages/hub/trackerRoutes.ts")).toContain('"/linkedin-lab"');
  });

  it("o lugar dele é o Tracker, e não o Administrador do Spaces", () => {
    const sidebarDoPortal = semComentarios(ler("client/src/pages/hub/HubSidebar.tsx"));
    expect(sidebarDoPortal).not.toContain("linkedin-lab");
    // E `/consumo-ia` continua sendo do portal — a distinção é o ponto.
    expect(sidebarDoPortal).toContain("/consumo-ia");

    const tracker = semComentarios(ler("client/src/components/MetaDashboardLayout.tsx"));
    expect(tracker).toContain('href="/linkedin-lab"');
    expect(tracker).toContain('href="/rascunho"');
  });

  it("a permissão é função própria, e o coordenador fica de fora", () => {
    const perms = semComentarios(ler("shared/permissions.ts"));
    expect(perms).toContain("export function canAccessLaboratorio");
    const corpo = perms.slice(perms.indexOf("export function canAccessLaboratorio"));
    expect(corpo.slice(0, 200)).not.toContain("coordinator");

    // A porta é a MESMA na sidebar e dentro da página. Dois critérios escritos
    // separados divergem, e a divergência vira um item que existe e não abre.
    const tracker = semComentarios(ler("client/src/components/MetaDashboardLayout.tsx"));
    expect(tracker).toContain("canAccessLaboratorio");
    const pagina = semComentarios(ler("client/src/pages/LinkedinLab.tsx"));
    expect(pagina).toContain("canAccessLaboratorio");
    expect(pagina).not.toContain("canManageContent");
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

describe("o nome da Página vem da API, nunca do cliente", () => {
  it("a descoberta tem TRÊS fontes de nome, e a terceira é a que a Fase 0 provou", () => {
    // A ACL versionada não devolve nome nenhum; a legada só devolve quando a
    // decoração `organizationalTarget~` é aceita. `/rest/organizations` é o
    // endpoint que entrega `localizedName` — sem ele, Página recusada pela
    // decoração ficava como número para sempre.
    const fonte = semComentarios(ler("server/services/linkedinApi.ts"));
    expect(fonte).toContain("organizationalTarget~(id,localizedName,vanityName)");
    expect(fonte).toMatch(/const anonimas = paginas\.filter\(\(p\) => !p\.nome\)/);
    expect(fonte).toContain("await organizacao(ctx, p.id)");
    expect(fonte).toContain("semNome:");
  });

  it("o coletor GRAVA o nome que busca", () => {
    // Ele já pagava a chamada de `/rest/organizations` e jogava o
    // `localizedName` dentro de `organizacaoJson`. Buscar e não gravar é pior
    // que não buscar: o vínculo mostrava o número da organização para sempre,
    // mesmo depois de uma sincronização bem-sucedida.
    const fonte = semComentarios(ler("server/services/coletaLinkedIn.ts"));
    expect(fonte).toContain("nomeDaOrg = String(r.dados.localizedName)");
    const update = fonte.slice(fonte.indexOf("db.update(linkedinPages).set({"));
    expect(update.slice(0, 400)).toContain("nome: nomeDaOrg");
  });

  it("NUNCA cai para o nome do cliente", () => {
    // O vínculo é `cliente → organizationUrn`. Usar um para nomear o outro
    // inventaria uma identidade que a API não deu.
    const pagina = semComentarios(ler("client/src/pages/LinkedinLab.tsx"));
    expect(pagina).toContain("Nome não disponível");
    expect(pagina).not.toMatch(/nome\s*\?\?\s*[a-z]*[Cc]liente/);
    expect(pagina).not.toMatch(/nome\s*\?\?\s*\w*\.accountName/);
  });

  it("a identidade continua sendo o URN", () => {
    const rotulo = semComentarios(ler("client/src/pages/LinkedinLab.tsx"));
    // O nome é rótulo; quem grava e quem casa é o URN.
    expect(rotulo).toContain("organizationUrn: p.urn");
    const router = semComentarios(ler("server/routers.ts"));
    expect(blocoDoLab(router)).toContain("organizationUrn: input.organizationUrn");
  });
});

describe("dá para trocar de Página depois de vincular a primeira", () => {
  it("o gerenciador é aba PERMANENTE, e não só a tela de conta vazia", () => {
    // A tela de vincular só aparecia com `!ativo` — depois do primeiro vínculo
    // ela sumia para sempre, e não havia como trocar, adicionar nem remover.
    const pagina = semComentarios(ler("client/src/pages/LinkedinLab.tsx"));
    expect(pagina).toContain('{ id: "paginas", nome: "Páginas vinculadas" }');
    expect(pagina).toContain("function GerenciarVinculos");
    expect(pagina).not.toContain("function SemVinculo");
  });

  it("desvincular e trocar de cliente têm botão", () => {
    const pagina = semComentarios(ler("client/src/pages/LinkedinLab.tsx"));
    expect(pagina).toContain("linkedinLab.desvincular.useMutation");
    expect(pagina).toContain("linkedinLab.trocarCliente.useMutation");
  });

  it("o seletor só mostra vínculo ATIVO", () => {
    // Sem o filtro, desvincular não desvinculava nada: a Página seguia no
    // seletor, porque desvincular marca `ativo=false` em vez de apagar.
    const dados = semComentarios(ler("server/services/linkedinLabDados.ts"));
    const fn = dados.slice(dados.indexOf("export async function listarVinculos"));
    expect(fn.slice(0, 320)).toContain("eq(linkedinPages.ativo, true)");
  });

  it("desvincular NÃO apaga o que foi coletado", () => {
    const router = semComentarios(ler("server/routers.ts"));
    const bloco = blocoDoLab(router);
    const dv = bloco.slice(bloco.indexOf("desvincular:"));
    expect(dv.slice(0, 500)).toContain("ativo: false");
    expect(dv.slice(0, 500)).not.toContain("db.delete");
  });

  it("trocar de cliente não mexe na identidade", () => {
    // A identidade é o URN. Trocar o dono não pode reescrevê-la, senão a série
    // e as publicações já coletadas ficariam órfãs.
    const router = semComentarios(ler("server/routers.ts"));
    const bloco = blocoDoLab(router);
    const tc = bloco.slice(bloco.indexOf("trocarCliente:"), bloco.indexOf("vincular: laboratorioProcedure"));
    expect(tc).toContain("accountId: input.accountId");
    expect(tc).not.toContain("organizationUrn:");
    expect(tc).not.toContain("organizationId:");
  });
});
