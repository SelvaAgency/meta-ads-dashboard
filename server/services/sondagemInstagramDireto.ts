/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  O Portfólio alcança Instagram sem passar por Página?
 * ─────────────────────────────────────────────────────────────────────────────
 *  A Musa tem Instagram e não tem Página — e o caminho que o Spaces usa hoje é
 *  Página → `instagram_business_account`. Sem Página, não há por onde entrar.
 *
 *  Mas no Business Manager conta do Instagram é um tipo de ativo SEPARADO da
 *  Página, com arestas próprias no Portfólio. Se a Musa estiver atribuída como
 *  ativo, o token que já temos pode alcançá-la por um caminho que hoje não
 *  lemos. Esta sondagem responde isso — e nada mais: não muda vínculo, não muda
 *  tela, não grava nada.
 *
 *  ── Encontrar não é o suficiente ───────────────────────────────────────────
 *  As arestas de negócio podem devolver o id de "conta do Instagram" do Business
 *  Manager, que NÃO é o IG User (17841…) que os insights exigem. Os dois são
 *  números e nenhum erro os distingue — achar a conta e não conseguir medir nada
 *  dela é pior que não achar, porque parece que funcionou.
 *
 *  Por isso cada ativo encontrado passa por uma segunda pergunta: este id
 *  responde como IG User? Só quem responde vale como resposta.
 *
 *  ── O que a sondagem procura de verdade ────────────────────────────────────
 *  Não é a lista de Instagrams — é a lista dos que SÓ existem por aqui. Uma
 *  conta que já vem pela Página não muda nada; a que só aparece nesta aresta é
 *  exatamente o caso Musa, e é ela que decide se o vínculo direto vale a pena.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { sanitizar } from "./instagram";
import type { Consultar } from "./instagramSondagem";

/** As arestas possíveis. Nomeadas mais de uma porque a Meta as renomeou. */
const ARESTAS = ["owned_instagram_accounts", "client_instagram_accounts", "instagram_accounts"];

export interface AtivoInstagram {
  id: string;
  aresta: string;
  /** O que a aresta de negócio devolveu, quando devolveu. */
  usernameDoPortfolio: string | null;
  /** O id responde como IG User? É a pergunta que decide tudo. */
  mensuravel: boolean;
  username: string | null;
  followersCount: number | null;
  mediaCount: number | null;
  insightsRespondem: boolean;
  /** Já alcançável por alguma Página do portfólio? */
  jaVinhaPelaPagina: boolean;
  detalhe: string;
}

export interface SondagemDireta {
  ativos: AtivoInstagram[];
  /** Os que SÓ existem por esta aresta — o caso Musa. */
  somenteDiretos: AtivoInstagram[];
  avisos: string[];
  texto: string;
}

/**
 * Lista os ativos de uma aresta.
 *
 * Pede `id,username` e, se a Meta recusar, repete só com `id`: o nó de conta do
 * Business Manager tem campos diferentes do nó de IG User, e um campo inválido
 * derruba a chamada inteira — a aresta pareceria não existir por causa do nome
 * de um campo.
 */
async function lerAresta(consultar: Consultar, businessId: string, aresta: string): Promise<{
  itens: Array<Record<string, unknown>>; erro: string | null;
}> {
  for (const fields of ["id,username", "id"]) {
    try {
      const r = await consultar<{ data?: Array<Record<string, unknown>> }>(
        `${businessId}/${aresta}`, { fields, limit: "100" });
      return { itens: r.data ?? [], erro: null };
    } catch (e) {
      if (fields === "id") return { itens: [], erro: sanitizar((e as Error).message) };
    }
  }
  return { itens: [], erro: "não respondeu" };
}

export async function sondarInstagramDireto(
  consultar: Consultar,
  businessId: string,
  idsQueVemPelaPagina: string[] = [],
): Promise<SondagemDireta> {
  const avisos: string[] = [];
  const ativos: AtivoInstagram[] = [];
  const jaVistos = new Set<string>();
  const porPagina = new Set(idsQueVemPelaPagina);

  for (const aresta of ARESTAS) {
    const { itens, erro } = await lerAresta(consultar, businessId, aresta);
    if (erro) { avisos.push(`${aresta}: ${erro}`); continue; }
    if (itens.length === 0) { avisos.push(`${aresta}: respondeu, nenhum ativo`); continue; }

    for (const item of itens) {
      const id = String(item.id ?? "");
      if (!id || jaVistos.has(id)) continue;
      jaVistos.add(id);

      const ativo: AtivoInstagram = {
        id, aresta,
        usernameDoPortfolio: item.username ? String(item.username) : null,
        mensuravel: false, username: null, followersCount: null, mediaCount: null,
        insightsRespondem: false,
        jaVinhaPelaPagina: porPagina.has(id),
        detalhe: "",
      };

      // ── A segunda pergunta: este id serve como IG User? ─────────────────
      try {
        const p = await consultar<Record<string, unknown>>(id, {
          fields: "username,followers_count,media_count",
        });
        ativo.username = p.username ? String(p.username) : null;
        ativo.followersCount = typeof p.followers_count === "number" ? p.followers_count : null;
        ativo.mediaCount = typeof p.media_count === "number" ? p.media_count : null;
        ativo.mensuravel = ativo.followersCount !== null || ativo.username !== null;
        ativo.detalhe = ativo.mensuravel
          ? `perfil respondeu${ativo.followersCount !== null ? ` · ${ativo.followersCount} seguidores` : ""}`
          : "perfil respondeu sem os campos de IG User";
      } catch (e) {
        ativo.detalhe = `ativo encontrado, mas NÃO mensurável — ${sanitizar((e as Error).message)}`;
      }

      // ── E os insights, que é o que a página realmente consome ───────────
      if (ativo.mensuravel) {
        try {
          const r = await consultar<{ data?: unknown[] }>(`${id}/insights`, {
            metric: "reach", period: "day", metric_type: "total_value",
          });
          ativo.insightsRespondem = (r.data?.length ?? 0) > 0;
          if (!ativo.insightsRespondem) ativo.detalhe += " · insights responderam sem dados";
        } catch (e) {
          ativo.detalhe += ` · insights recusados: ${sanitizar((e as Error).message)}`;
        }
      }

      ativos.push(ativo);
    }
  }

  const somenteDiretos = ativos.filter((a) => !a.jaVinhaPelaPagina);
  return { ativos, somenteDiretos, avisos, texto: montar(ativos, somenteDiretos, avisos) };
}

function montar(ativos: AtivoInstagram[], somenteDiretos: AtivoInstagram[], avisos: string[]): string {
  const out: string[] = [
    `sondagem de Instagram direto · ${ativos.length} ativo(s) no portfólio`,
    `${somenteDiretos.length} só alcançável(is) por esta via — é aqui que a Musa apareceria`,
    "",
  ];

  if (ativos.length === 0) {
    out.push("Nenhuma conta de Instagram atribuída ao Portfólio como ativo.");
    out.push("O caminho por Página continua sendo o único, e a Musa precisaria de Instagram Login.");
  }

  for (const a of ativos) {
    const marca = a.jaVinhaPelaPagina ? "  " : "→ ";
    const nome = a.username ?? a.usernameDoPortfolio ?? "(sem username)";
    out.push(`${marca}[${a.mensuravel ? (a.insightsRespondem ? "MEDE" : "PARC") : "NÃO "}] @${nome}`);
    out.push(`     id ${a.id} · via ${a.aresta}${a.jaVinhaPelaPagina ? " · já vinha pela Página" : ""}`);
    out.push(`     ${a.detalhe}`);
    if (a.mediaCount !== null) out.push(`     ${a.mediaCount} publicações`);
    out.push("");
  }

  if (avisos.length) {
    out.push("Arestas que não trouxeram nada:");
    for (const a of avisos) out.push(`  · ${a}`);
    out.push("");
  }
  out.push("MEDE = responde perfil e insights · PARC = responde perfil, insights não");
  out.push("NÃO  = ativo encontrado, mas não mensurável como IG User");
  out.push("→ marca as contas que SÓ existem por esta via.");
  return out.join("\n");
}
