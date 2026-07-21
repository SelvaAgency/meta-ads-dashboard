/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Preferências de notificação — pessoais
 * ─────────────────────────────────────────────────────────────────────────────
 *  O que cada pessoa recebe e por onde. Moradia é o SELVA Spaces (Configurações),
 *  não o Tracker: notificação é da vida da pessoa na empresa, não da conta de
 *  mídia. Antes vivia no Settings do Tracker — foi movido, não duplicado.
 *
 *  Três camadas, como a regra do D1.4 pede:
 *   · pessoal      — o usuário liga/desliga e escolhe o canal (a maioria).
 *   · institucional— aniversário e comunicado: o usuário comum NÃO desliga.
 *                    Aparece "sempre ativo", sem toggle. Backend recusa também.
 *   · admin/global — financeiro só chega para admin (adminOnly no catálogo).
 *
 *  O backend resolve os defaults do catálogo (shared/notifications) — aqui só
 *  mostramos o que veio pronto, com `editavel` mandando no que trava.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { EMAIL_MODOS, dominioLabel } from "@shared/notifications";

const Toggle = ({ on, onClick, disabled }: { on: boolean; onClick: () => void; disabled?: boolean }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={`relative rounded-full transition-colors flex-shrink-0 ${on ? "bg-primary" : "bg-muted-foreground/30"} ${disabled ? "opacity-40 cursor-default" : ""}`}
    style={{ height: "18px", width: "32px" }}
  >
    <span className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white transition-all ${on ? "left-[14px]" : "left-0.5"}`} />
  </button>
);

/** Resumo diário: envio automático, horário, exceção de hoje. */
export function ResumoDiarioSection() {
  const utils = trpc.useUtils();
  const q = trpc.notifications.digestSettings.useQuery(undefined, { retry: false });
  const set = trpc.notifications.setDigestSettings.useMutation({
    onSuccess: () => { utils.notifications.digestSettings.invalidate(); toast.success("Resumo diário atualizado."); },
    onError: (e) => toast.error(e.message),
  });
  const setHoje = trpc.notifications.setDigestHoje.useMutation({
    onSuccess: () => { utils.notifications.digestSettings.invalidate(); toast.success("Envio de hoje atualizado."); },
    onError: (e) => toast.error(e.message),
  });
  const [hora, setHora] = useState<string | null>(null);

  if (q.isLoading || !q.data) return null;
  const d = q.data;
  const horaVal = hora ?? d.defaultTime;

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden mb-4">
      <div className="flex items-center justify-between gap-4 p-4 border-b border-border/50">
        <div>
          <p className="text-sm text-foreground">Envio automático</p>
          <p className="text-xs text-muted-foreground">O resumo sai sozinho todo dia no horário abaixo.</p>
        </div>
        <button onClick={() => set.mutate({ autoEnabled: !d.autoEnabled })}
          className={`relative rounded-full transition-colors flex-shrink-0 ${d.autoEnabled ? "bg-primary" : "bg-muted-foreground/30"}`} style={{ height: "18px", width: "32px" }}>
          <span className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white transition-all ${d.autoEnabled ? "left-[14px]" : "left-0.5"}`} />
        </button>
      </div>

      <div className="flex items-center justify-between gap-4 p-4 border-b border-border/50">
        <div>
          <p className="text-sm text-foreground">Horário</p>
          <p className="text-xs text-muted-foreground">Horário de Brasília.</p>
        </div>
        <div className="flex items-center gap-2">
          <input type="time" value={horaVal} onChange={(e) => setHora(e.target.value)}
            className="text-sm border border-border rounded-md px-2 py-1.5 bg-background text-foreground" />
          {hora && hora !== d.defaultTime && (
            <button onClick={() => { set.mutate({ defaultTime: hora }); setHora(null); }}
              className="text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground font-medium">Salvar</button>
          )}
        </div>
      </div>

      {/* Exceção de hoje: feriado, folga geral. Não desliga a rotina. */}
      <div className="flex items-center justify-between gap-4 p-4">
        <div>
          <p className="text-sm text-foreground">Enviar hoje ({d.hoje.dia.split("-").reverse().slice(0, 2).join("/")})</p>
          <p className="text-xs text-muted-foreground">
            {d.hoje.enabled ? "Vai sair normalmente." : "Desligado só para hoje — a rotina continua ativa."}
          </p>
        </div>
        <button onClick={() => setHoje.mutate({ dia: d.hoje.dia, enabled: !d.hoje.enabled })}
          className={`relative rounded-full transition-colors flex-shrink-0 ${d.hoje.enabled ? "bg-primary" : "bg-muted-foreground/30"}`} style={{ height: "18px", width: "32px" }}>
          <span className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white transition-all ${d.hoje.enabled ? "left-[14px]" : "left-0.5"}`} />
        </button>
      </div>

      {/* Só sai email de verdade em produção com SMTP: dizer isso evita o susto. */}
      {(d.email.dryRun || !d.email.configured || d.email.testRecipients.length > 0) && (
        <div className="px-4 py-2.5 bg-amber-500/10 border-t border-amber-500/20">
          <p className="text-[11px] text-amber-700">
            {!d.email.configured ? "SMTP não configurado — nenhum email sai; só notificação no app."
              : d.email.testRecipients.length > 0 ? `Modo de teste: todo email é desviado para ${d.email.testRecipients.join(" e ")}.`
              : "Modo de teste (dry-run): nenhum email real é enviado; o app registra quem receberia."}
          </p>
        </div>
      )}
    </div>
  );
}

/** Preferências por (tipo × canal). Institucional trava para não-admin. */
export function NotifPrefsSection() {
  const utils = trpc.useUtils();
  const { data: prefs, isLoading } = trpc.notifications.prefs.useQuery();
  const setPref = trpc.notifications.setPref.useMutation({
    onSuccess: () => utils.notifications.prefs.invalidate(),
    onError: (e) => toast.error(e.message),
  });
  if (isLoading) return <div className="text-sm text-muted-foreground">Carregando...</div>;
  if (!(prefs ?? []).length) return null;

  const dominios = ["COMUNICADO", "TAREFAS", "PERFORMANCE", "SITE", "FINANCEIRO"] as const;
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden mb-4">
      <div className="flex items-center gap-4 px-4 py-2 border-b border-border/50 bg-muted/30">
        <p className="text-[11px] text-muted-foreground font-medium flex-1">O que você recebe</p>
        <span className="text-[11px] text-muted-foreground w-12 text-center">No app</span>
        <span className="text-[11px] text-muted-foreground w-44 text-center">Email</span>
      </div>
      {dominios.map((dom) => {
        const linhas = (prefs ?? []).filter((p) => p.dominio === dom);
        if (linhas.length === 0) return null;
        return (
          <div key={dom}>
            <p className="px-4 pt-3 pb-1 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{dominioLabel(dom)}</p>
            {linhas.map((p) => {
              // Institucional para não-admin: sem toggle, sem escolha de email.
              // O aviso é da empresa, não preferência de quem recebe.
              const travado = p.editavel === false;
              return (
                <div key={p.tipo} className="flex items-center gap-4 p-4 border-b border-border/50 last:border-b-0">
                  <div className="flex-1">
                    <p className="text-sm text-foreground flex items-center gap-1.5">
                      {p.label}
                      {travado && <span className="text-[9px] uppercase tracking-wide text-muted-foreground/70 border border-border rounded px-1 py-0.5">institucional</span>}
                    </p>
                    <p className="text-xs text-muted-foreground">{p.desc}</p>
                  </div>
                  <div className="w-12 flex justify-center">
                    {travado || p.inAppObrigatorio
                      ? <span className="text-[10px] text-muted-foreground" title={travado ? "Aviso institucional — sempre ativo" : "Mensagens dirigidas a você sempre aparecem no app"}>sempre</span>
                      : <Toggle on={p.inApp} onClick={() => setPref.mutate({ tipo: p.tipo, inApp: !p.inApp })} />}
                  </div>
                  <div className="w-44 flex justify-center gap-1">
                    {EMAIL_MODOS.map((m) => (
                      <button
                        key={m.v}
                        disabled={travado}
                        onClick={() => setPref.mutate({ tipo: p.tipo, emailModo: m.v })}
                        title={travado ? "Aviso institucional — não configurável" : m.desc}
                        className={`px-2 py-1 rounded-md text-[10px] border transition ${p.emailModo === m.v ? "border-primary bg-primary/10 text-accent font-medium" : "border-border text-muted-foreground hover:text-foreground"} ${travado ? "opacity-40 cursor-default" : ""}`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
