/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Redes Sociais — credencial própria e vínculo por cliente
 * ─────────────────────────────────────────────────────────────────────────────
 *  Duas camadas, e a separação é o produto:
 *
 *   CREDENCIAL  um token da agência, guardado uma vez, cifrado
 *   VÍNCULO     qual Página/Instagram é de qual cliente
 *
 *  O token é separado do de Meta Ads por decisão de produto: campanhas caindo
 *  não podem derrubar o orgânico, e vice-versa. Antes disto o Instagram usava
 *  `accounts[0].accessToken` — o token de mídia de uma conta arbitrária.
 *
 *  ── Conta pessoal não é erro ───────────────────────────────────────────────
 *  Quem decide como cada estado aparece é `shared/instagram`, e a regra que ele
 *  protege é esta: perfil pessoal é estado VÁLIDO com limitação conhecida.
 *  Aparece como "limitado", nunca vermelho — tratá-lo como falha faria alguém
 *  tentar consertar uma conta que está como o cliente quer.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { canManageContent } from "@shared/permissions";
import { toast } from "sonner";
import { Instagram, Loader2, Key, Link2, Stethoscope } from "lucide-react";
import { lerVinculo, ROTULO_TIPO, type StatusInsight, type TipoConta } from "@shared/instagram";

/** O que `paginasDisponiveis` devolve — a forma que a tela consome. */
interface PaginasDoPortfolio {
  paginas: Array<{
    pageId: string;
    pageName: string;
    instagram: { id: string; username: string | null; tipoConta: TipoConta } | null;
  }>;
  avisos: string[];
}

const COR_NIVEL: Record<string, string> = {
  ok: "text-emerald-600 border-emerald-500/30 bg-emerald-500/5",
  limitado: "text-sky-600 border-sky-500/30 bg-sky-500/5",
  pendente: "text-amber-600 border-amber-500/30 bg-amber-500/5",
  erro: "text-destructive border-destructive/30 bg-destructive/5",
};

/**
 * Busca a lista de clientes por conta própria — o hub de Conexões monta várias
 * seções e não deve saber o que cada uma precisa. Só admin/dev veem a área,
 * pela mesma regra do resto do hub.
 */
export function InstagramConexao() {
  const { user } = useAuth();
  const podeGerenciar = canManageContent((user as { role?: string } | null)?.role);
  const clientesQ = trpc.accounts.list.useQuery(undefined, { enabled: podeGerenciar });
  if (!podeGerenciar) return null;
  return <PainelInstagram clientes={clientesQ.data ?? []} />;
}

function PainelInstagram({ clientes }: { clientes: { id: number; accountName: string | null }[] }) {
  const utils = trpc.useUtils();
  const [token, setToken] = useState("");
  const [diagnostico, setDiagnostico] = useState<string | null>(null);
  const [paginas, setPaginas] = useState<null | PaginasDoPortfolio>(null);
  const [escolha, setEscolha] = useState<Record<number, string>>({});

  const credQ = trpc.social.credencial.useQuery();
  const vinculosQ = trpc.social.vinculos.useQuery();

  const salvar = trpc.social.salvarCredencial.useMutation({
    onSuccess: (r) => {
      setToken(""); setDiagnostico(r.diagnostico);
      utils.social.credencial.invalidate();
      toast.success(`Credencial salva (impressão ${r.impressao}).`);
    },
    onError: (e) => { setDiagnostico(e.message); toast.error("O token não passou — veja o diagnóstico."); },
  });

  const diag = trpc.social.diagnosticar.useMutation({
    onSuccess: (d) => {
      setDiagnostico(d.texto);
      utils.social.vinculos.invalidate();
      d.ok ? toast.success("Diagnóstico concluído.") : toast.error("Diagnóstico encontrou problema — veja abaixo.");
    },
    onError: (e) => { setDiagnostico(e.message); toast.error(e.message); },
  });

  const listar = trpc.social.paginasDisponiveis.useMutation({
    onSuccess: (r) => {
      setPaginas(r);
      toast.success(`${r.paginas.length} Página(s) no portfólio.`);
      if (r.avisos.length) toast.info(`Avisos: ${r.avisos.join(" · ")}`);
    },
    onError: (e) => toast.error(e.message),
  });

  const vincular = trpc.social.vincular.useMutation({
    onSuccess: () => { utils.social.vinculos.invalidate(); toast.success("Cliente vinculado."); },
    onError: (e) => toast.error(e.message),
  });

  const cred = credQ.data;
  const vinculos = vinculosQ.data ?? [];
  const vinculoDe = (accountId: number) => vinculos.find((v) => v.accountId === accountId);

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h3 className="text-sm font-bold flex items-center gap-2"><Instagram className="w-4 h-4" /> Redes Sociais · Instagram</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Credencial <strong>própria</strong>, separada de Meta Ads — se campanhas caírem, o orgânico continua.
        </p>
      </div>

      {/* ── Credencial ─────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card p-4 flex flex-col gap-3">
        <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
          <Key className="w-3.5 h-3.5" /> Credencial da agência
        </p>
        {cred?.existe ? (
          <p className="text-xs text-muted-foreground">
            Cadastrada · impressão <span className="font-mono">{cred.impressao}</span>
            {cred.lastTestAt && ` · último teste ${new Date(cred.lastTestAt).toLocaleString("pt-BR")}`}
            {cred.lastTestStatus && ` (${cred.lastTestStatus})`}
          </p>
        ) : (
          <p className="text-xs text-amber-600">
            Nenhuma credencial cadastrada. Cole um System User token do Portfólio com
            <strong> pages_show_list</strong>, <strong>pages_read_engagement</strong>,
            <strong> instagram_basic</strong> e <strong>instagram_manage_insights</strong>.
          </p>
        )}
        <div className="flex gap-2 flex-wrap">
          <input type="password" autoComplete="off" placeholder={cred?.existe ? "cole um token novo para substituir" : "System User token"}
            value={token} onChange={(e) => setToken(e.target.value)}
            className="flex-1 min-w-[200px] text-xs font-mono border border-border rounded-lg px-3 py-2 bg-background" />
          <button onClick={() => salvar.mutate({ token })} disabled={!token || salvar.isPending}
            className="text-xs px-3 py-2 rounded-lg bg-primary text-primary-foreground font-medium flex items-center gap-1.5 disabled:opacity-60">
            {salvar.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Key className="w-3.5 h-3.5" />}
            Salvar credencial
          </button>
          <button onClick={() => diag.mutate({})} disabled={!cred?.existe || diag.isPending}
            className="text-xs px-3 py-2 rounded-lg border border-border flex items-center gap-1.5 disabled:opacity-60">
            {diag.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Stethoscope className="w-3.5 h-3.5" />}
            Diagnóstico
          </button>
        </div>
        <p className="text-[10px] text-muted-foreground">
          O token é testado ANTES de ser gravado — um token que não alcança o portfólio só apareceria como
          problema no primeiro uso, longe daqui. Ele é cifrado e nunca volta para a tela.
        </p>
      </div>

      {/* ── Diagnóstico, copiável ──────────────────────────────────────── */}
      {diagnostico && (
        <div className="rounded-xl border border-border bg-muted/30 p-3">
          <div className="flex items-center justify-between gap-2 mb-1">
            <p className="text-[11px] font-semibold text-muted-foreground">Diagnóstico</p>
            <button onClick={() => setDiagnostico(null)} className="text-[11px] text-muted-foreground hover:text-foreground">fechar</button>
          </div>
          <pre className="text-[11px] font-mono whitespace-pre-wrap break-all select-all max-h-72 overflow-y-auto">{diagnostico}</pre>
          <p className="text-[10px] text-muted-foreground mt-1">Sanitizado — nenhum token aparece aqui.</p>
        </div>
      )}

      {/* ── Vínculo por cliente ────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
            <Link2 className="w-3.5 h-3.5" /> Página e Instagram por cliente
          </p>
          <button onClick={() => listar.mutate()} disabled={!cred?.existe || listar.isPending}
            className="text-[11px] px-2.5 py-1 rounded border border-border disabled:opacity-60 flex items-center gap-1.5">
            {listar.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
            Buscar Páginas do portfólio
          </button>
        </div>

        <div className="flex flex-col gap-2">
          {clientes.map((c) => {
            const v = vinculoDe(c.id);
            const leitura = lerVinculo({
              estado: !v?.pageId ? "SEM_PAGINA" : !v?.instagramUserId ? "PAGINA_SEM_INSTAGRAM" : "VINCULADO",
              tipoConta: (v?.tipoConta as TipoConta) ?? "DESCONHECIDO",
              statusInsight: (v?.statusInsight as StatusInsight) ?? "NAO_TESTADO",
              username: v?.instagramUsername, pageName: v?.pageName,
            });
            return (
              <div key={c.id} className={`rounded-lg border p-2.5 flex flex-col gap-1.5 ${COR_NIVEL[leitura.nivel]}`}>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-medium text-foreground flex-1 min-w-0 truncate">{c.accountName ?? `#${c.id}`}</span>
                  {v?.instagramUsername && (
                    <a href={`https://instagram.com/${v.instagramUsername}`} target="_blank" rel="noopener noreferrer"
                      className="text-[11px] font-mono underline">@{v.instagramUsername}</a>
                  )}
                  {v && <span className="text-[10px]">{ROTULO_TIPO[(v.tipoConta as TipoConta) ?? "DESCONHECIDO"]}</span>}
                </div>
                <p className="text-[11px] font-medium">{leitura.titulo}</p>
                <p className="text-[10px] text-muted-foreground">{leitura.explicacao}</p>

                {paginas && (
                  <div className="flex gap-1.5 flex-wrap items-center mt-1">
                    <select value={escolha[c.id] ?? v?.pageId ?? ""}
                      onChange={(e) => setEscolha({ ...escolha, [c.id]: e.target.value })}
                      className="text-[11px] border border-border rounded px-2 py-1 bg-background max-w-[260px]">
                      <option value="">— escolher Página —</option>
                      {paginas.paginas.map((p) => (
                        <option key={p.pageId} value={p.pageId}>
                          {p.pageName}{p.instagram?.username ? ` · @${p.instagram.username}` : " · sem Instagram"}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => {
                        const pid = escolha[c.id] ?? v?.pageId;
                        const p = paginas.paginas.find((x) => x.pageId === pid);
                        if (!p) return toast.error("Escolha uma Página.");
                        vincular.mutate({
                          accountId: c.id, pageId: p.pageId, pageName: p.pageName,
                          instagramUserId: p.instagram?.id ?? null,
                          instagramUsername: p.instagram?.username ?? null,
                          tipoConta: p.instagram?.tipoConta ?? "DESCONHECIDO",
                        });
                      }}
                      disabled={vincular.isPending}
                      className="text-[11px] px-2 py-1 rounded bg-primary text-primary-foreground disabled:opacity-60">
                      Vincular
                    </button>
                    {v?.pageId && (
                      <button onClick={() => diag.mutate({ accountId: c.id })} disabled={diag.isPending}
                        className="text-[11px] px-2 py-1 rounded border border-border">
                        Testar
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {!paginas && (
          <p className="text-[10px] text-muted-foreground">
            Use <strong>Buscar Páginas do portfólio</strong> para escolher a Página de cada cliente.
            O Instagram vem junto quando a Página tiver um vinculado.
          </p>
        )}
      </div>
    </div>
  );
}
