/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Gmail — conta remetente da agência (hub de Conexões)
 * ─────────────────────────────────────────────────────────────────────────────
 *  Conecta UMA conta Google Workspace da SELVA para enviar Jornalzinho e
 *  alertas pela Gmail API. Existe porque o Railway bloqueia SMTP de saída.
 *
 *  A tela diz três coisas que costumam ser confundidas, e que levam a ações
 *  diferentes:
 *
 *   1. **Conectado** — existe refresh token guardado. É promessa do dia da
 *      autorização, não fato de hoje.
 *   2. **Verificado** — o token foi exercitado agora e respondeu. Consentimento
 *      revogado e senha trocada não avisam ninguém; só a verificação pega isso.
 *   3. **Enviando** — o provider ativo é o Gmail E a trava mestre está ligada.
 *      Conectado e verificado com a automação pausada = nada sai, de propósito.
 *
 *  Nenhum token chega aqui: o servidor devolve só e-mail, escopos e status.
 *  Todas as chamadas são admin/dev no backend (contentProcedure) — esconder na
 *  UI deixaria os dados a uma chamada de distância.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { canManageContent } from "@shared/permissions";
import { toast } from "sonner";
import {
  Mail, Loader2, CheckCircle2, AlertTriangle, Link2, RefreshCw, Send, ShieldCheck,
} from "lucide-react";

const fmtData = (d: string | Date | null | undefined) =>
  d ? new Date(d).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";

function Linha({ k, v, tom }: { k: string; v: React.ReactNode; tom?: "ok" | "alerta" | "erro" }) {
  const cor = tom === "ok" ? "text-emerald-600" : tom === "erro" ? "text-destructive" : tom === "alerta" ? "text-amber-600" : "text-foreground";
  return (
    <div className="flex items-baseline justify-between gap-3 text-xs py-1 border-b border-border/40 last:border-0">
      <span className="text-muted-foreground flex-shrink-0">{k}</span>
      <span className={`font-medium text-right break-all ${cor}`}>{v}</span>
    </div>
  );
}

export function GmailVinculos() {
  const { user } = useAuth();
  const podeGerenciar = canManageContent((user as { role?: string } | null)?.role);

  const utils = trpc.useUtils();
  const statusQ = trpc.gmail.status.useQuery(undefined, { enabled: podeGerenciar, staleTime: 30_000 });
  const testesQ = trpc.gmail.ultimosTestes.useQuery(undefined, { enabled: podeGerenciar, staleTime: 30_000 });

  const [destinatario, setDestinatario] = useState("");
  const [confirmando, setConfirmando] = useState(false);

  /**
   * A prévia vem do SERVIDOR, e só quando o admin pede para confirmar. Montar a
   * confirmação só com dados da tela deixaria a validação do "um destinatário"
   * vivendo apenas no formulário — e o que a tela mostra precisa ser o que o
   * backend vai de fato fazer.
   */
  const previaQ = trpc.gmail.previaTeste.useQuery(
    { destinatario: destinatario.trim() },
    { enabled: confirmando && destinatario.trim().length >= 3 },
  );

  const verificar = trpc.gmail.verificar.useMutation({
    onSuccess: (r) => {
      utils.gmail.status.invalidate();
      if (r.ok) toast.success("Conexão verificada — o token foi renovado com sucesso.");
      else toast.error(`Falhou: ${r.erro}`);
    },
    onError: (e) => toast.error(e.message),
  });

  const enviarTeste = trpc.gmail.enviarTeste.useMutation({
    onSuccess: (r) => {
      setConfirmando(false);
      utils.gmail.ultimosTestes.invalidate();
      utils.gmail.status.invalidate();
      if (r.ok) toast.success(`Enviado para ${r.destinatario} · ${r.duracaoMs}ms`);
      else toast.error(`Falhou: ${r.erro}`);
    },
    onError: (e) => { setConfirmando(false); toast.error(e.message); },
  });

  const desconectar = trpc.gmail.desconectar.useMutation({
    onSuccess: () => { utils.gmail.status.invalidate(); toast.success("Gmail desconectado. Os tokens foram apagados."); },
    onError: (e) => toast.error(e.message),
  });

  // Guarda de UI. A de verdade está no servidor — esta só evita oferecer
  // controles que voltariam FORBIDDEN.
  if (!podeGerenciar) return null;
  if (statusQ.isLoading) return <p className="text-xs text-muted-foreground px-1">Carregando conexão…</p>;

  const s = statusQ.data;
  const conectado = !!s?.conectado;
  const escopoOk = !!s?.temEscopoEnvio;
  const btn = "h-8 px-3 rounded-lg border border-border text-xs flex items-center gap-1.5 disabled:opacity-60";

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
          <Mail className="w-4 h-4" /> Gmail · conta remetente da agência
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Uma conta do Google Workspace da SELVA envia o Jornalzinho e os alertas pela Gmail API.
          Escopo mínimo: <code className="text-[10px]">gmail.send</code> — permite enviar, nunca ler a caixa.
        </p>
      </div>

      {/* Pré-requisitos de ambiente: sem eles, "Conectar" falharia com um erro
          do Google que não explica o que fazer. */}
      {!s?.credenciaisApp && (
        <p className="text-xs text-amber-600 flex items-start gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          GOOGLE_ADS_CLIENT_ID/SECRET ausentes no ambiente — o OAuth do Google não roda sem elas.
        </p>
      )}
      {!s?.criptografiaOk && (
        <p className="text-xs text-amber-600 flex items-start gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          INTEGRATIONS_ENCRYPTION_KEY ausente — sem ela o refresh token não pode ser guardado com segurança.
        </p>
      )}

      <div className="bg-card border border-border rounded-xl p-4 flex flex-col gap-3">
        {/* ── Estado ──────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2.5">
            {conectado
              ? <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
              : <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: "rgba(120,120,120,0.4)" }} />}
            <div>
              <p className="text-sm font-semibold text-foreground">Google Gmail</p>
              <p className="text-[11px] text-muted-foreground">
                {conectado ? `conectado como ${s?.conectadoComo ?? "—"}` : "não conectado"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {conectado && (
              <button onClick={() => verificar.mutate()} disabled={verificar.isPending} className={btn}>
                {verificar.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                Verificar
              </button>
            )}
            {/* target="_top": o OAuth NÃO pode abrir dentro do iframe do Spaces
                — o Google recusa embutir a tela de consentimento. */}
            <a href="/api/google/auth?state=gmail" target="_top"
              className="inline-flex h-8 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-medium items-center gap-1.5">
              <Link2 className="w-3.5 h-3.5" /> {conectado ? "Reconectar" : "Conectar"}
            </a>
            {conectado && (
              <button onClick={() => desconectar.mutate()} disabled={desconectar.isPending}
                className={`${btn} text-muted-foreground hover:text-destructive`}>
                Desconectar
              </button>
            )}
          </div>
        </div>

        {conectado && (
          <div className="flex flex-col">
            <Linha k="Conectado em" v={fmtData(s?.conectadoEm)} />
            <Linha
              k="Escopo de envio (gmail.send)"
              v={escopoOk ? "concedido" : "AUSENTE — reconecte autorizando o envio"}
              tom={escopoOk ? "ok" : "erro"}
            />
            <Linha k="Escopos concedidos" v={(s?.escopos ?? []).join(", ") || "—"} />
            <Linha
              k="Última verificação"
              v={`${fmtData(s?.ultimaVerificacaoEm)}${s?.ultimaVerificacaoStatus ? ` · ${s.ultimaVerificacaoStatus}` : ""}`}
              tom={s?.ultimaVerificacaoStatus === "ok" ? "ok" : s?.ultimaVerificacaoStatus === "erro" ? "erro" : undefined}
            />
            {s?.ultimaVerificacaoErro && <Linha k="Motivo" v={s.ultimaVerificacaoErro} tom="erro" />}
          </div>
        )}
      </div>

      {/* ── Estado do ENVIO — separado da conexão de propósito ─────────────── */}
      <div className="bg-card border border-border rounded-xl p-4 flex flex-col gap-2">
        <p className="text-xs font-semibold text-foreground">Envio automático</p>
        <Linha k="Provider ativo (EMAIL_PROVIDER)" v={s?.providerAtivo ?? "não definido"} tom={s?.providerAtivo ? undefined : "alerta"} />
        <Linha
          k="Automação (EMAIL_AUTOMATION_ENABLED)"
          v={s?.automacaoHabilitada ? "LIGADA" : "pausada"}
          tom={s?.automacaoHabilitada ? "alerta" : "ok"}
        />
        {s?.porqueNaoEnvia && <p className="text-[11px] text-muted-foreground">{s.porqueNaoEnvia}</p>}
        <p className="text-[11px] text-muted-foreground border-t border-border pt-2">
          Conectar o Gmail <strong>não</strong> religa o envio automático. Enquanto a automação estiver
          pausada, Jornalzinho e alertas continuam gerando conteúdo e auditando, sem enviar nada.
        </p>
      </div>

      {/* ── Teste controlado ───────────────────────────────────────────────── */}
      <div className="bg-card border border-border rounded-xl p-4 flex flex-col gap-3">
        <div>
          <p className="text-xs font-semibold text-foreground">Enviar e-mail de teste</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Um único endereço, escolhido por você. Não usa lista de destinatários real, não passa pelos
            crons e não altera a trava do envio automático.
          </p>
        </div>

        <div className="flex gap-2 flex-wrap">
          <input
            value={destinatario}
            onChange={(e) => { setDestinatario(e.target.value); setConfirmando(false); }}
            placeholder="voce@selva.agency"
            className="flex-1 min-w-[220px] text-sm border border-border rounded-md px-3 py-2 bg-background focus:outline-none focus:ring-1 focus:ring-primary"
          />
          {!confirmando ? (
            <button
              onClick={() => setConfirmando(true)}
              disabled={!conectado || !escopoOk || !destinatario.trim()}
              className="h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium flex items-center gap-1.5 disabled:opacity-50"
            >
              <Send className="w-4 h-4" /> Preparar envio
            </button>
          ) : (
            <button onClick={() => setConfirmando(false)} className={`${btn} h-9`}>Cancelar</button>
          )}
        </div>

        {/* Confirmação explícita: remetente, destinatário e assunto na tela
            ANTES de disparar. Confirmar às cegas é como se manda e-mail para a
            pessoa errada. */}
        {confirmando && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/[0.06] p-3 flex flex-col gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
              Confirme antes de enviar
            </p>
            {previaQ.isLoading ? (
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Conferindo…
              </p>
            ) : (
              <>
                <Linha k="De" v={previaQ.data?.remetente ?? "—"} />
                <Linha k="Para" v={previaQ.data?.destinatario ?? destinatario.trim()} />
                <Linha k="Assunto" v={previaQ.data?.assunto ?? "Teste Gmail API — SELVA Spaces"} />
                {previaQ.data?.impedimento && (
                  <p className="text-xs text-destructive flex items-start gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" /> {previaQ.data.impedimento}
                  </p>
                )}
                <button
                  onClick={() => enviarTeste.mutate({ destinatario: destinatario.trim() })}
                  disabled={enviarTeste.isPending || !!previaQ.data?.impedimento || !previaQ.data}
                  className="h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium flex items-center justify-center gap-1.5 disabled:opacity-60"
                >
                  {enviarTeste.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  {enviarTeste.isPending ? "Enviando…" : "Confirmar e enviar"}
                </button>
              </>
            )}
          </div>
        )}

        {/* Histórico só dos testes — prova que o envio aconteceu (ou não). */}
        {(testesQ.data ?? []).length > 0 && (
          <div className="border-t border-border pt-2">
            <div className="flex items-center justify-between mb-1">
              <p className="text-[11px] font-semibold text-muted-foreground">Últimos testes</p>
              <button onClick={() => testesQ.refetch()} className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1">
                <RefreshCw className="w-3 h-3" /> atualizar
              </button>
            </div>
            {/* O erro é a ÚNICA coisa que a pessoa precisa ler aqui quando o
                teste falha — truncar em uma linha (como estava) escondia
                justamente o texto que diz o que fazer. Agora ele quebra em
                várias linhas e dá para selecionar e copiar. */}
            <div className="flex flex-col gap-1.5">
              {(testesQ.data ?? []).map((t: any) => (
                <div key={t.id} className="text-[11px] py-1 border-b border-border/30 last:border-0">
                  <div className="flex items-center gap-2">
                    <span className={t.status === "sent" ? "text-emerald-600" : "text-destructive"}>
                      {t.status === "sent" ? "✓" : "✗"}
                    </span>
                    <span className="font-medium truncate">{t.destinatarioFinal}</span>
                    <span className="text-muted-foreground flex-shrink-0 ml-auto">
                      {fmtData(t.criadoEm)}{t.duracaoMs != null ? ` · ${t.duracaoMs}ms` : ""}
                    </span>
                  </div>
                  {t.erro ? (
                    <p className="mt-0.5 text-destructive break-words whitespace-pre-wrap select-all font-mono text-[10px] leading-relaxed">
                      {t.erro}
                    </p>
                  ) : t.messageId ? (
                    <p className="mt-0.5 text-muted-foreground break-all">id: {t.messageId}</p>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
