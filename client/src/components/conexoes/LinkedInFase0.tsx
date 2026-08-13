/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  LinkedIn · Fase 0 — só o instrumento de medição
 * ─────────────────────────────────────────────────────────────────────────────
 *  Não existe aba, coletor, gráfico nem tabela de dados aqui. Esta tela faz uma
 *  coisa: guardar um token e rodar a sondagem que mede o que a API entrega.
 *
 *  ── Por que ela parece pobre de propósito ──────────────────────────────────
 *  A tela do Instagram nasceu depois da Fase 0 dele, e é rica porque as medições
 *  já existiam. Construir aqui um seletor de Página por cliente antes de saber
 *  se a API devolve Página por cliente seria desenhar em cima de suposição — que
 *  é exatamente o que a Fase 0 existe para impedir.
 *
 *  ── Os dois campos que somem depois de usados ──────────────────────────────
 *  `client_id` e `client_secret` do app são pedidos porque o LinkedIn só diz
 *  QUAIS escopos um token tem através da introspecção, e ela exige os dois. Sem
 *  isso, "quais permissões temos?" só se responderia olhando o que falha — e uma
 *  chamada falha por escopo, por produto não aprovado, por falta de cargo na
 *  Página ou por versão morta. Os quatro apareceriam iguais.
 *
 *  Eles vão para o servidor, são usados uma vez e não são gravados em lugar
 *  nenhum. Só o token é cifrado e guardado.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { canManageContent } from "@shared/permissions";
import { toast } from "sonner";
import { Linkedin, Loader2, Key, Microscope } from "lucide-react";

export function LinkedInFase0() {
  const { user } = useAuth();
  if (!canManageContent((user as { role?: string } | null)?.role)) return null;
  return <Painel />;
}

function Painel() {
  const utils = trpc.useUtils();
  const [token, setToken] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [orgId, setOrgId] = useState("");
  const [relatorio, setRelatorio] = useState<string | null>(null);

  const credQ = trpc.social.linkedin.credencial.useQuery();
  const cred = credQ.data;

  const salvar = trpc.social.linkedin.salvarCredencial.useMutation({
    onSuccess: (r) => {
      setToken("");
      utils.social.linkedin.credencial.invalidate();
      setRelatorio(r.diagnostico);
      toast.success("Token do LinkedIn guardado.");
    },
    onError: (e) => { setRelatorio(e.message); toast.error("O token não passou no teste."); },
  });

  const sondar = trpc.social.linkedin.sondar.useMutation({
    onSuccess: (r) => {
      setRelatorio(r.texto);
      // Os segredos do app não ficam na tela depois de usados — eles nunca
      // foram gravados, e deixá-los no campo daria a impressão contrária.
      setClientSecret("");
      utils.social.linkedin.credencial.invalidate();
      toast.success(`Sondagem concluída · ${r.disponiveis}/${r.disponiveis + r.indisponiveis} itens`);
    },
    onError: (e) => { setRelatorio(e.message); toast.error("A sondagem falhou."); },
  });

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h3 className="text-sm font-bold flex items-center gap-2"><Linkedin className="w-4 h-4" /> LinkedIn · Fase 0 (sondagem)</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Só <strong>medição</strong>. Nenhum dado é coletado ou gravado — a sondagem descobre o que a API entrega
          antes de existir tabela, coletor ou tela.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card p-4 flex flex-col gap-3">
        {cred?.existe ? (
          <p className="text-xs text-muted-foreground">
            Token guardado · impressão <span className="font-mono">{cred.impressao}</span>
            {cred.lastTestAt && ` · última sondagem ${new Date(cred.lastTestAt).toLocaleString("pt-BR")}`}
            {cred.lastTestStatus && ` (${cred.lastTestStatus})`}
          </p>
        ) : (
          <p className="text-xs text-amber-600">
            Nenhum token do LinkedIn. Gere um em <strong>LinkedIn Developers → seu app → Auth → Token Generator</strong> e
            cole abaixo. O membro que autorizar precisa ter cargo na Company Page — no LinkedIn não existe
            System User de agência como na Meta.
          </p>
        )}

        <div className="flex gap-2 flex-wrap">
          <input type="password" autoComplete="off"
            placeholder={cred?.existe ? "cole um token novo para substituir" : "access token do LinkedIn"}
            value={token} onChange={(e) => setToken(e.target.value)}
            className="flex-1 min-w-[220px] text-xs font-mono border border-border rounded-lg px-3 py-2 bg-background" />
          <button onClick={() => salvar.mutate({ token })} disabled={!token || salvar.isPending}
            className="text-xs px-3 py-2 rounded-lg bg-primary text-primary-foreground font-medium flex items-center gap-1.5 disabled:opacity-60">
            {salvar.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Key className="w-3.5 h-3.5" />}
            Guardar token
          </button>
        </div>
        <p className="text-[10px] text-muted-foreground">
          Só o token <strong>morto</strong> é recusado. Token sem permissão é aceito de propósito: é justamente o
          caso em que a sondagem é útil — ela vai dizer, item por item, qual escopo falta.
        </p>

        {/* ── Introspecção: opcional, e não gravada ───────────────────────── */}
        <div className="border-t border-border pt-3 flex flex-col gap-2">
          <p className="text-[11px] font-semibold text-muted-foreground">
            Opcional — para MEDIR os escopos em vez de deduzi-los
          </p>
          <div className="flex gap-2 flex-wrap">
            <input autoComplete="off" placeholder="client_id do app"
              value={clientId} onChange={(e) => setClientId(e.target.value)}
              className="flex-1 min-w-[140px] text-xs font-mono border border-border rounded-lg px-3 py-2 bg-background" />
            <input type="password" autoComplete="off" placeholder="client_secret do app"
              value={clientSecret} onChange={(e) => setClientSecret(e.target.value)}
              className="flex-1 min-w-[140px] text-xs font-mono border border-border rounded-lg px-3 py-2 bg-background" />
            <input autoComplete="off" placeholder="organization id (opcional)"
              value={orgId} onChange={(e) => setOrgId(e.target.value)}
              className="w-[180px] text-xs font-mono border border-border rounded-lg px-3 py-2 bg-background" />
          </div>
          <p className="text-[10px] text-muted-foreground">
            Usados uma vez e <strong>não gravados</strong>. Sem eles a sondagem roda igual, mas os escopos passam a
            ser deduzidos do que falha — e falha por escopo, por produto não aprovado e por falta de cargo na
            Página têm consertos diferentes e a mesma cara.
          </p>
        </div>

        <button onClick={() => sondar.mutate({ clientId, clientSecret, organizationId: orgId })}
          disabled={!cred?.existe || sondar.isPending}
          className="self-start text-xs px-3 py-2 rounded-lg border border-border flex items-center gap-1.5 disabled:opacity-60">
          {sondar.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Microscope className="w-3.5 h-3.5" />}
          Rodar sondagem
        </button>
      </div>

      {relatorio && (
        <div className="rounded-xl border border-border bg-muted/30 p-3">
          <div className="flex items-center justify-between gap-2 mb-1">
            <p className="text-[11px] font-semibold text-muted-foreground">Relatório da sondagem</p>
            <button onClick={() => setRelatorio(null)} className="text-[11px] text-muted-foreground hover:text-foreground">fechar</button>
          </div>
          <pre className="text-[11px] font-mono whitespace-pre-wrap break-all select-all max-h-96 overflow-y-auto">{relatorio}</pre>
          <p className="text-[10px] text-muted-foreground mt-1">
            Sanitizado — nenhum token e nenhum texto de publicação aparece aqui.
          </p>
        </div>
      )}
    </div>
  );
}
