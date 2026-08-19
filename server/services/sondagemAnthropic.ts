/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  O que a Admin API da Anthropic REALMENTE devolve
 * ─────────────────────────────────────────────────────────────────────────────
 *  Só medição. Não escreve nada, não altera página nenhuma, e roda na mão.
 *
 *  ── Por que sondar se a documentação existe ────────────────────────────────
 *  Porque a doc descreve o contrato e a conta descreve a realidade. Um campo
 *  documentado pode vir ausente nesta organização, um `group_by` pode ser
 *  recusado, e o teto de bucket pode diferir. Implementar contra a doc e
 *  descobrir a diferença em produção é o caminho para uma tela que mostra
 *  `undefined` com cara de zero.
 *
 *  ── Os nomes vêm do JSON, não da nossa expectativa ─────────────────────────
 *  A sondagem COLHE as chaves que chegaram, em vez de conferir uma lista que
 *  nós escrevemos. É a mesma disciplina da sondagem de Reels, e foi ela que
 *  revelou `reels_skip_rate` — uma métrica que existia e que a nossa lista não
 *  tinha. Conferir contra a própria imaginação só confirma o que já se supunha.
 *
 *  ── Nada de conteúdo, nada de credencial ───────────────────────────────────
 *  O relatório mostra NOMES de campo e valores agregados. A chave nunca
 *  aparece: toda mensagem de erro passa por `sanitizar`.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import {
  TETO_DE_BUCKETS, chamarCru, custoDaOrganizacao, temChaveAdmin, usoDaOrganizacao,
  type Granularidade,
} from "./anthropicAdmin";

export interface SondagemAnthropic {
  ok: boolean;
  temChave: boolean;
  texto: string;
}

/** As chaves de um objeto, em profundidade, para revelar o formato real. */
function chavesDe(o: unknown, prefixo = ""): string[] {
  if (!o || typeof o !== "object" || Array.isArray(o)) return [];
  return Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => {
    const nome = prefixo ? `${prefixo}.${k}` : k;
    const dentro = v && typeof v === "object" && !Array.isArray(v) ? chavesDe(v, nome) : [];
    return [nome, ...dentro];
  });
}

const tipoDe = (v: unknown): string => {
  if (v === null) return "null";
  if (Array.isArray(v)) return `lista(${v.length})`;
  return typeof v;
};

/** Um valor, descrito sem despejar conteúdo. */
function amostraDe(o: unknown, chave: string): string {
  const partes = chave.split(".");
  let v: unknown = o;
  for (const p of partes) {
    if (!v || typeof v !== "object") return "–";
    v = (v as Record<string, unknown>)[p];
  }
  if (v === null || v === undefined) return "null";
  if (typeof v === "object") return tipoDe(v);
  const s = String(v);
  return s.length <= 44 ? s : `${s.slice(0, 44)}…`;
}

const diaMenos = (dias: number) =>
  new Date(Date.now() - dias * 86_400_000).toISOString().slice(0, 10);

export async function sondarAnthropic(): Promise<SondagemAnthropic> {
  const out: string[] = [];
  const push = (...l: string[]) => out.push(...l);

  push("ANTHROPIC ADMIN API · sondagem de uso e custo", "");

  // ── 1. A chave ───────────────────────────────────────────────────────────
  const tem = temChaveAdmin();
  push("── 1. CREDENCIAL ──");
  push(tem
    ? "  [SIM] ANTHROPIC_ADMIN_KEY está no ambiente do servidor."
    : "  [NÃO] ANTHROPIC_ADMIN_KEY ausente — a integração não tem como funcionar.");
  push("  (o valor da chave nunca é exibido, logado ou gravado)");
  push("");
  if (!tem) return { ok: false, temChave: false, texto: out.join("\n") };

  const fim = diaMenos(0);
  const inicio = diaMenos(6);
  push(`Período sondado: ${inicio} a ${fim}`, "");

  // ── 2. USAGE ─────────────────────────────────────────────────────────────
  push("── 2. USAGE API · /v1/organizations/usage_report/messages ──");
  const uso = await usoDaOrganizacao(inicio, fim, "1d");
  push(`  HTTP ${uso.status} · ${uso.paginas} página(s) · ${uso.buckets.length} bucket(s)`);
  if (uso.erro) {
    push(`  [NÃO] ${uso.erro}`);
    // 404/403 aqui costuma ser conta individual em vez de organização — é a
    // limitação que a doc anuncia, e ela precisa aparecer nomeada.
    if (/not_found|404|permission|403/i.test(uso.erro)) {
      push("  Sugere conta INDIVIDUAL (a Admin API exige organização) ou chave sem acesso.");
    }
  } else {
    const comDado = uso.buckets.filter((b) => (b.results ?? []).length > 0);
    push(`  [SIM] respondeu · ${comDado.length} bucket(s) COM resultado`);
    const amostra = comDado[0]?.results?.[0];
    if (!amostra) {
      push("  Nenhum resultado no período — a organização não consumiu, ou o dado ainda não subiu (~5 min).");
    } else {
      push("", "  CAMPOS QUE REALMENTE VIERAM (colhidos do JSON):");
      for (const c of chavesDe(amostra)) {
        push(`    ${c.padEnd(46)} ${tipoDe(amostraDe(amostra, c) === "null" ? null : 1).padEnd(8)} ${amostraDe(amostra, c)}`);
      }
      push("", "  TOTAIS DO PERÍODO (somando todos os buckets):");
      const soma = (ler: (r: NonNullable<typeof amostra>) => number) =>
        uso.buckets.flatMap((b) => b.results ?? []).reduce((n, r) => n + (ler(r) || 0), 0);
      push(`    uncached_input_tokens                ${soma((r) => r.uncached_input_tokens ?? 0)}`);
      push(`    cache_read_input_tokens              ${soma((r) => r.cache_read_input_tokens ?? 0)}`);
      push(`    cache_creation.ephemeral_5m          ${soma((r) => r.cache_creation?.ephemeral_5m_input_tokens ?? 0)}`);
      push(`    cache_creation.ephemeral_1h          ${soma((r) => r.cache_creation?.ephemeral_1h_input_tokens ?? 0)}`);
      push(`    output_tokens                        ${soma((r) => r.output_tokens ?? 0)}`);
      const modelos = Array.from(new Set(
        uso.buckets.flatMap((b) => b.results ?? []).map((r) => r.model).filter(Boolean)));
      push(`    modelos distintos                    ${modelos.join(", ") || "(nenhum)"}`);
      push("");
      push("  CONTAGEM DE CHAMADAS: não existe neste retorno — confirmado pela ausência");
      push("  do campo acima. Quantas chamadas o Spaces fez continua vindo só de ai_geracoes.");
    }
  }
  push("");

  // ── 3. COST ──────────────────────────────────────────────────────────────
  push("── 3. COST API · /v1/organizations/cost_report ──");
  const custo = await custoDaOrganizacao(inicio, fim);
  push(`  HTTP ${custo.status} · ${custo.paginas} página(s) · ${custo.buckets.length} bucket(s)`);
  if (custo.erro) {
    push(`  [NÃO] ${custo.erro}`);
  } else {
    const comDado = custo.buckets.filter((b) => (b.results ?? []).length > 0);
    push(`  [SIM] respondeu · ${comDado.length} bucket(s) COM resultado`);
    const amostra = comDado[0]?.results?.[0];
    if (!amostra) {
      push("  Nenhum custo no período.");
    } else {
      push("", "  CAMPOS QUE REALMENTE VIERAM:");
      for (const c of chavesDe(amostra)) {
        push(`    ${c.padEnd(46)} ${amostraDe(amostra, c)}`);
      }
      const linhas = custo.buckets.flatMap((b) => b.results ?? []);
      const total = linhas.reduce((n, r) => n + Number(r.amount ?? 0), 0);
      const moeda = linhas.find((r) => r.currency)?.currency ?? "?";
      push("", `  TOTAL DO PERÍODO: ${total} (unidade crua) · currency=${moeda}`);
      push("  A doc diz que `amount` vem em CENTAVOS como string decimal.");
      push(`  Se isso valer aqui, o total é ${(total / 100).toFixed(2)} ${moeda}.`);
      const tipos = Array.from(new Set(linhas.map((r) => r.cost_type).filter(Boolean)));
      push(`  cost_type distintos: ${tipos.join(", ") || "(nenhum)"}`);
    }
  }
  push("");

  // ── 4. GRANULARIDADE ─────────────────────────────────────────────────────
  //
  // Testada de verdade, e não lida da doc: o teto que importa é o que ESTA
  // organização aceita.
  push("── 4. GRANULARIDADE ACEITA ──");
  for (const g of ["1d", "1h", "1m"] as Granularidade[]) {
    const p = new URLSearchParams({
      starting_at: `${diaMenos(1)}T00:00:00Z`,
      ending_at: `${fim}T23:59:59Z`,
      bucket_width: g,
      limit: "1",
    });
    const r = await chamarCru<{ data?: unknown[] }>("usage_report/messages", p);
    push(`  ${g.padEnd(4)} HTTP ${r.status} ${r.erro ? `[NÃO] ${r.erro}` : `[SIM] teto documentado: ${TETO_DE_BUCKETS[g]} buckets`}`);
  }
  push("");

  // ── 5. PAGINAÇÃO ─────────────────────────────────────────────────────────
  push("── 5. PAGINAÇÃO ──");
  const p1 = new URLSearchParams({
    starting_at: `${diaMenos(20)}T00:00:00Z`,
    ending_at: `${fim}T23:59:59Z`,
    bucket_width: "1d",
    limit: "3",
  });
  const r1 = await chamarCru<{ has_more?: boolean; next_page?: string | null; data?: unknown[] }>(
    "usage_report/messages", p1);
  if (r1.erro) {
    push(`  [NÃO] ${r1.erro}`);
  } else {
    const c = r1.corpo;
    push(`  limit=3 devolveu ${c?.data?.length ?? 0} bucket(s) · has_more=${c?.has_more}`);
    push(`  next_page ${c?.next_page ? "presente" : "ausente"} — o cursor ${c?.has_more ? "É" : "não é"} necessário aqui.`);
  }
  push("");

  push("── O QUE ISSO AUTORIZA ──");
  push("  Só o que apareceu acima. Campo que não veio não entra na página —");
  push("  `undefined` desenhado como zero é pior que coluna ausente.");

  return { ok: !uso.erro && !custo.erro, temChave: true, texto: out.join("\n") };
}
