/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Prévia do Jornalzinho — ver o conteúdo sem enviar nada
 * ─────────────────────────────────────────────────────────────────────────────
 *  Existe porque o único jeito de ver o Jornalzinho era recebê-lo. Avaliar
 *  conteúdo e layout dependia de esperar o disparo da manhã — e disparar para
 *  conferir é a ordem errada.
 *
 *  ── O que esta tela NÃO faz ────────────────────────────────────────────────
 *  Abrir a prévia é leitura pura: monta e renderiza o mesmo HTML que sairia, e
 *  só. Não consome a trava de duplicata (daily_digest_recipients), não escreve
 *  no email_send_log e não envia e-mail. Abrir dez vezes não muda em nada o
 *  envio automático do dia seguinte.
 *
 *  ── Quem vê o quê ──────────────────────────────────────────────────────────
 *  Admin e developer entram; o developer precisa conferir o e-mail que ele
 *  recebe e o do colaborador, senão não tem como validar o que constrói.
 *
 *  A visão ADMIN fica de fora para ele: ela carrega o bloco FINANCEIRO, e
 *  liberá-la aqui entregaria o e-mail do admin por outra porta — a informação
 *  é a mesma, só o caminho seria outro.
 *
 *  Esconder a opção NÃO é a trava: a procedure devolve FORBIDDEN para quem
 *  chamar a API direto. A tela só evita oferecer o que voltaria erro.
 *
 *  ── Por que iframe ─────────────────────────────────────────────────────────
 *  O HTML é de e-mail: usa tabelas e estilo inline, e conta com um documento
 *  próprio. Injetado direto na página, herdaria o CSS do Spaces e a avaliação
 *  de layout seria sobre algo que ninguém vai receber. O iframe isola.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useState } from "react";
import { Newspaper, Loader2, Send, AlertTriangle, Mail } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { HubShell } from "./HubShell";
import { useAuth } from "@/_core/hooks/useAuth";
import { canAccessAdmin } from "@shared/permissions";
import { Input } from "@/components/ui/input";

type Papel = "admin" | "developer" | "user";
const PAPEIS: { v: Papel; label: string; soAdmin?: boolean }[] = [
  { v: "admin", label: "Admin", soAdmin: true },
  { v: "developer", label: "Developer" },
  { v: "user", label: "Colaborador" },
];

/** Hoje no fuso da agência — o mesmo critério de dia que o servidor usa. */
const hojeAgencia = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

export default function JornalzinhoPreview() {
  const { user } = useAuth();
  const ehAdmin = canAccessAdmin((user as { role?: string } | null)?.role);
  const papeisVisiveis = PAPEIS.filter((p) => ehAdmin || !p.soAdmin);
  // O estado inicial acompanha o que a pessoa PODE ver. Começar em "admin" para
  // um developer dispararia a query e ele abriria a tela num erro.
  const [papel, setPapel] = useState<Papel>(ehAdmin ? "admin" : "developer");
  const [dia, setDia] = useState(hojeAgencia());
  const [destinatario, setDestinatario] = useState("");
  const [confirmando, setConfirmando] = useState(false);
  /**
   * Segmentação: "todos" (sem filtro), um GRUPO (conjunto de clientes) ou uma
   * PESSOA (as preferências reais dela). A prévia por pessoa é a verdade; a por
   * grupo serve para conferir o recorte antes de existir alguém configurado.
   */
  const [segmento, setSegmento] = useState<"todos" | "g1" | "g2" | "pessoa">("todos");
  const [pessoaId, setPessoaId] = useState<number | null>(null);

  const pessoasQ = trpc.notifications.pessoasComPreferencia.useQuery(undefined, { enabled: segmento === "pessoa" });
  const prefsQ = trpc.notifications.minhasPreferenciasEmail.useQuery(undefined, { enabled: segmento === "g1" || segmento === "g2" });

  // Os grupos são resolvidos pelo NOME do cliente na tela, não por id fixo: id
  // de conta muda entre ambientes e um número cravado aqui viraria prévia de
  // cliente errado sem ninguém perceber.
  const norm = (v: string) => v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const TOKENS: Record<"g1" | "g2", string[]> = {
    g1: ["ultramalhas", "elwing", "caroline", "carol"],
    g2: ["musa", "arka", "scaffold", "play"],
  };
  const contasDoGrupo = (g: "g1" | "g2") => {
    const todos = prefsQ.data?.clientes ?? [];
    const ids = new Set<number>();
    for (const t of TOKENS[g]) for (const c of todos) if (norm(c.nome).includes(norm(t))) ids.add(c.id);
    return Array.from(ids);
  };

  const previaQ = trpc.notifications.previewDigestHtml.useQuery({
    papel, dia,
    ...(segmento === "pessoa" && pessoaId != null ? { comoUsuario: pessoaId } : {}),
    ...(segmento === "g1" || segmento === "g2" ? { contas: contasDoGrupo(segmento) } : {}),
  });

  const preSelecionar = trpc.notifications.preSelecionarGruposJornalzinho.useMutation({
    onSuccess: (r: any) => {
      const faltou = r.relatorio.flatMap((g: any) => [
        ...g.tokensSemCliente.map((t: string) => `sem cliente: ${t}`),
        ...g.ambiguos.map((a: any) => `ambíguo: ${a.token}`),
        ...g.pessoas.filter((p: any) => !p.aplicado).map((p: any) => `sem usuário: ${p.email}`),
      ]);
      toast[faltou.length ? "warning" : "success"](
        faltou.length ? `Aplicado com pendências: ${faltou.join(" · ")}` : "Pré-seleção aplicada nos dois grupos.",
      );
    },
    onError: (e) => toast.error(e.message),
  });

  const enviar = trpc.notifications.enviarPreviaJornalzinho.useMutation({
    onSuccess: (r: any) => {
      setConfirmando(false);
      if (r.vazio) return toast.error("Sem conteúdo para este dia/papel — nada foi enviado.");
      if (r.pausado) return toast.error("Envio pausado (EMAIL_AUTOMATION_ENABLED). A prévia não saiu.");
      if (r.bloqueado) return toast.error(r.erro ?? "Bloqueado pela trava de destinatários.");
      if (!r.ok) return toast.error(r.erro ?? "Falha no envio.");
      toast.success(`Prévia enviada para ${destinatario.trim()}.`);
    },
    onError: (e) => { setConfirmando(false); toast.error(e.message); },
  });

  const d = previaQ.data;

  return (
    <HubShell>
      <main className="flex-1 overflow-auto p-6 md:p-8">
        <div className="max-w-4xl mx-auto flex flex-col gap-5">
          <header className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-xl bg-primary/20 text-accent flex items-center justify-center flex-shrink-0">
              <Newspaper className="w-5 h-5" />
            </span>
            <div>
              <h1 className="text-2xl font-bold">Prévia do Jornalzinho</h1>
              <p className="text-sm text-muted-foreground">
                O conteúdo exato que sairia — sem enviar nada e sem afetar o envio automático.
              </p>
            </div>
          </header>

          {/* Controles */}
          <div className="rounded-xl border border-border bg-card p-4 flex flex-wrap items-end gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-[11px] text-muted-foreground">Visão (papel de quem recebe)</label>
              <div className="inline-flex rounded-lg border border-border p-0.5">
                {papeisVisiveis.map((p) => (
                  <button key={p.v} onClick={() => setPapel(p.v)}
                    className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${papel === p.v ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] text-muted-foreground">Dia</label>
              <input type="date" value={dia} onChange={(e) => setDia(e.target.value)}
                className="text-sm border border-border rounded-md px-2 py-1.5 bg-background" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] text-muted-foreground">Clientes</label>
              <div className="inline-flex rounded-lg border border-border p-0.5">
                {([["todos", "Todos"], ["g1", "Grupo 1"], ["g2", "Grupo 2"], ["pessoa", "Por pessoa"]] as const).map(([v, l]) => (
                  <button key={v} onClick={() => setSegmento(v)}
                    className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${segmento === v ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
            {segmento === "pessoa" && (
              <div className="flex flex-col gap-1">
                <label className="text-[11px] text-muted-foreground">Pessoa</label>
                <select value={pessoaId ?? ""} onChange={(e) => setPessoaId(e.target.value ? Number(e.target.value) : null)}
                  className="text-sm border border-border rounded-md px-2 py-1.5 bg-background max-w-[220px]">
                  <option value="">— selecione —</option>
                  {(pessoasQ.data ?? []).map((p: any) => (
                    <option key={p.id} value={p.id}>
                      {p.nome ?? p.email}{p.configurado ? ` · ${p.clientes} cliente(s)` : " · sem filtro"}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <p className="text-[11px] text-muted-foreground flex-1 min-w-[200px]">
              Cada papel recebe blocos diferentes — o financeiro só existe na visão admin.
              {segmento !== "todos" && " Com filtro de clientes, o resumo geral do portfólio sai do e-mail: ele fala de todos os clientes."}
            </p>
          </div>

          {/* Cabeçalho do e-mail */}
          {previaQ.isLoading ? (
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Montando a prévia…
            </p>
          ) : previaQ.error ? (
            <p className="text-sm text-destructive flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" /> {previaQ.error.message}
            </p>
          ) : (
            <>
              <div className="rounded-xl border border-border bg-card p-4 flex flex-col gap-1.5">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="text-[11px] text-muted-foreground">Assunto</span>
                  <span className="text-sm font-semibold">{d?.assunto}</span>
                </div>
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="text-[11px] text-muted-foreground">Blocos</span>
                  <span className="text-xs">{d?.blocos?.length ? d.blocos.join(" · ") : "—"}</span>
                </div>
                {d?.vazio && (
                  <p className="text-xs text-amber-600 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" /> Sem conteúdo hoje para este papel — neste caso o
                    Jornalzinho não é enviado (fica “pulado_vazio”).
                  </p>
                )}
              </div>

              {!d?.vazio && (
                <div className="flex items-center gap-3 flex-wrap">
                  <button
                    onClick={() => {
                      // Abre o HTML cru numa aba: dá para ver em tela cheia e
                      // mostrar para outra pessoa sem passar pelo app.
                      const w = window.open("", "_blank");
                      if (w) { w.document.write(d?.html ?? ""); w.document.close(); }
                    }}
                    className="text-xs px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground"
                  >
                    Abrir em aba nova
                  </button>
                  {segmento !== "todos" && segmento !== "pessoa" && (
                    <span className="text-[11px] text-muted-foreground">
                      Recorte: {contasDoGrupo(segmento).length} cliente(s) —{" "}
                      {(prefsQ.data?.clientes ?? []).filter((c) => contasDoGrupo(segmento).includes(c.id)).map((c) => c.nome).join(", ") || "nenhum resolvido"}
                    </span>
                  )}
                </div>
              )}

              {/* O e-mail, isolado do CSS do Spaces */}
              {!d?.vazio && (
                <iframe
                  title="Prévia do Jornalzinho"
                  srcDoc={d?.html ?? ""}
                  className="w-full rounded-xl border border-border bg-white"
                  style={{ height: "70vh" }}
                  sandbox=""
                />
              )}
            </>
          )}

          {/* Pré-seleção dos grupos — só admin, idempotente, com relatório. */}
      {ehAdmin && (
        <div className="rounded-xl border border-border bg-card p-4 flex flex-col gap-3">
          <div>
            <p className="text-xs font-semibold text-foreground">Pré-seleção dos grupos de GTM</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Aplica Grupo 1 (Beth, Bruna, Namie) e Grupo 2 (Nat, Bad) nas preferências delas.
              Idempotente — rodar de novo não duplica. Cada pessoa pode ajustar depois em Configurações.
            </p>
          </div>
          <div>
            <button onClick={() => preSelecionar.mutate()} disabled={preSelecionar.isPending}
              className="h-9 px-4 rounded-lg border border-border text-sm font-medium flex items-center gap-1.5 disabled:opacity-60">
              {preSelecionar.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {preSelecionar.isPending ? "Aplicando…" : "Aplicar pré-seleção"}
            </button>
          </div>
          {preSelecionar.data && (
            <div className="flex flex-col gap-3 border-t border-border pt-3">
              {(preSelecionar.data as any).relatorio.map((g: any) => (
                <div key={g.grupo} className="flex flex-col gap-2">
                  <p className="text-xs font-bold">{g.grupo}</p>
                  {g.pessoas.map((p: any) => (
                    <div key={p.email} className="text-[11px] pl-3 border-l-2 border-border">
                      <p className="font-semibold">{p.nome ?? p.email}</p>
                      <p className={p.encontrado ? "text-muted-foreground" : "text-destructive"}>
                        usuário: {p.email} — {p.encontrado ? `encontrado (id ${p.userId})` : "NÃO encontrado"}
                        {p.encontrado ? ` · role: ${p.role}` : ""}
                      </p>
                      {p.encontrado && (
                        <>
                          <p className="text-muted-foreground mt-0.5">clientes aplicados:</p>
                          {p.aplicados.length === 0
                            ? <p className="pl-3 text-amber-600">nenhum</p>
                            : p.aplicados.map((a: any) => (
                                <p key={a.accountId} className="pl-3 text-emerald-700 dark:text-emerald-500">
                                  • {a.rotulo} → {a.nome} — accountId {a.accountId}
                                </p>
                              ))}
                        </>
                      )}
                      {p.pendencias.length === 0
                        ? <p className="text-muted-foreground mt-0.5">pendências: nenhuma</p>
                        : (
                          <>
                            <p className="text-amber-600 mt-0.5">pendências:</p>
                            {p.pendencias.map((x: any, i: number) => (
                              <p key={i} className="pl-3 text-amber-600">• {x.rotulo}: {x.detalhe}</p>
                            ))}
                          </>
                        )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Enviar prévia para UM endereço */}
          <div className="rounded-xl border border-border bg-card p-4 flex flex-col gap-3">
            <div>
              <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5" /> Enviar prévia por e-mail
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Um único endereço, para ver como fica numa caixa de entrada real. Assunto marcado com
                <strong> [PREVIEW]</strong>, registrado como <code>preview</code> — <strong>não</strong> conta como
                Jornalzinho enviado e <strong>não</strong> interfere no envio automático.
              </p>
            </div>

            <div className="flex gap-2 flex-wrap">
              <Input value={destinatario} onChange={(e) => { setDestinatario(e.target.value); setConfirmando(false); }}
                placeholder="admin@selva.agency" className="flex-1 min-w-[220px]" />
              {!confirmando ? (
                <button onClick={() => setConfirmando(true)} disabled={!destinatario.trim() || !!d?.vazio}
                  className="h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium flex items-center gap-1.5 disabled:opacity-50">
                  <Send className="w-4 h-4" /> Preparar envio
                </button>
              ) : (
                <button onClick={() => setConfirmando(false)}
                  className="h-9 px-3 rounded-lg border border-border text-xs text-muted-foreground">Cancelar</button>
              )}
            </div>

            {confirmando && (
              <div className="rounded-lg border border-amber-500/40 bg-amber-500/[0.06] p-3 flex flex-col gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
                  Confirme antes de enviar
                </p>
                <p className="text-xs">
                  Para <strong>{destinatario.trim()}</strong> · visão <strong>{papel}</strong> · dia <strong>{dia}</strong>
                </p>
                <p className="text-[11px] text-muted-foreground">
                  O destinatário precisa ser um usuário admin/dev ativo — a trava central recusa qualquer outro.
                </p>
                <button
                  onClick={() => enviar.mutate({ destinatario: destinatario.trim(), papel, dia })}
                  disabled={enviar.isPending}
                  className="h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium flex items-center justify-center gap-1.5 disabled:opacity-60"
                >
                  {enviar.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  {enviar.isPending ? "Enviando…" : "Confirmar e enviar prévia"}
                </button>
              </div>
            )}
          </div>
        </div>
      </main>
    </HubShell>
  );
}
