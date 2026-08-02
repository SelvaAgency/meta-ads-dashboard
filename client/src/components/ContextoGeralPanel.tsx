/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Contexto Geral — a ÚNICA tela de contexto por conta (Fase 3, simplificada)
 * ─────────────────────────────────────────────────────────────────────────────
 *  Set ENXUTO (sem campos redundantes): Sobre o cliente & oferta · Negócio ·
 *  Público · Foco do momento · Regras & restrições · Tracking & conversões ·
 *  Eventos · (memória automática, só leitura).
 *
 *  Campos antes separados foram FUNDIDOS: perfil+objetivo+oferta → "Sobre o
 *  cliente & oferta" (clientProfile); regras+restrições+constraints → "Regras &
 *  restrições" (operationalRules). O form pré-preenche a fusão (não perde nada) e
 *  LIMPA os campos redundantes ao salvar (não duplica). Log de trabalho
 *  (hipóteses/testes/próximos) e input livre saíram — a IA não os lê mais.
 */
import { trpc } from "@/lib/trpc";
import { useState, useEffect, type ReactNode } from "react";
import { toast } from "sonner";
import { Brain, X, Save, Plus, Sparkles } from "lucide-react";

const BUSINESS_TYPES = ["E-commerce", "Serviço", "B2B", "Varejo físico", "Marketplace", "SaaS", "Outro"];
const TICKET_RANGES = ["Até R$100", "R$100–500", "R$500–2k", "Acima de R$2k"];
const AUDIENCE_AGES = ["18–24", "25–34", "35–44", "45–54", "55+", "Amplo"];
const AUDIENCE_GENDERS = ["Feminino", "Masculino", "Neutro"];
const AUDIENCE_GEOS = ["Nacional", "Sul/Sudeste", "Nordeste", "Regional", "Internacional"];
const EVENT_TYPES = ["Lançamento", "Promoção", "Sazonalidade", "Pausa", "Crise", "Outro"];

type Evento = { date: string; type: string; description: string };

function Chips({ options, value, onChange }: { options: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((opt) => {
        const on = value === opt;
        return (
          <button key={opt} type="button" onClick={() => onChange(on ? "" : opt)}
            className={`px-3 py-1 rounded-full text-xs border transition-colors ${on ? "border-primary/50 bg-primary/[0.08] text-primary font-medium" : "border-border text-muted-foreground hover:bg-accent/30"}`}>
            {opt}
          </button>
        );
      })}
    </div>
  );
}

function Secao({ titulo, hint, children }: { titulo: string; hint?: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">{titulo}</p>
      {hint && <p className="text-[11px] text-muted-foreground/70 mt-0.5">{hint}</p>}
      <div className="mt-2.5">{children}</div>
    </div>
  );
}

function Campo({ label, value, onChange, rows = 2, placeholder }: { label?: string; value: string; onChange: (v: string) => void; rows?: number; placeholder?: string }) {
  return (
    <div className="flex flex-col gap-1">
      {label && <label className="text-[11px] text-muted-foreground">{label}</label>}
      <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={rows} placeholder={placeholder}
        className="text-sm border border-border rounded-lg px-2.5 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary resize-y leading-snug" />
    </div>
  );
}

export function ContextoGeralPanel({ accountId, onClose }: { accountId: number; onClose?: () => void }) {
  const [sobreCliente, setSobreCliente] = useState("");   // perfil + objetivo + oferta (fundidos)
  const [businessType, setBusinessType] = useState("");
  const [ticketRange, setTicketRange] = useState("");
  const [audienceAge, setAudienceAge] = useState("");
  const [audienceGender, setAudienceGender] = useState("");
  const [audienceGeo, setAudienceGeo] = useState("");
  const [audience, setAudience] = useState("");
  const [focusMoment, setFocusMoment] = useState("");
  const [regras, setRegras] = useState("");                // operationalRules + restrictions + constraints (fundidos)
  const [conversionEvents, setConversionEvents] = useState("");
  const [importantPages, setImportantPages] = useState("");
  const [trackingNotes, setTrackingNotes] = useState("");
  const [events, setEvents] = useState<Evento[]>([]);
  const [newEvent, setNewEvent] = useState<Evento>({ date: "", type: "Lançamento", description: "" });
  const [saving, setSaving] = useState(false);

  const { data: ctx, refetch } = trpc.context.getAccount.useQuery({ accountId }, { enabled: !!accountId, staleTime: 30_000 });

  useEffect(() => {
    if (!ctx) return;
    const c = ctx as Record<string, any>;
    // Fusão de "Sobre o cliente & oferta" (não perde o que existia).
    setSobreCliente([c.clientProfile, c.objective, c.offer].filter(Boolean).join("\n\n"));
    setBusinessType(c.businessType ?? "");
    setTicketRange(c.ticketRange ?? "");
    setAudienceAge(c.audienceAge ?? "");
    setAudienceGender(c.audienceGender ?? "");
    setAudienceGeo(c.audienceGeo ?? "");
    setAudience(c.audience ?? "");
    setFocusMoment(c.focusMoment ?? "");
    // Fusão de "Regras & restrições".
    setRegras([c.operationalRules, ...((c.restrictions as string[]) ?? []), c.constraints].filter(Boolean).join("\n"));
    setConversionEvents(((c.conversionEventsJson as string[]) ?? []).join("\n"));
    setImportantPages(((c.importantPagesJson as string[]) ?? []).join("\n"));
    setTrackingNotes(c.trackingNotes ?? "");
    setEvents((c.events as Evento[]) ?? []);
  }, [ctx]);

  const upsert = trpc.context.upsertAccount.useMutation({
    onSuccess: () => { toast.success("Contexto salvo"); setSaving(false); refetch(); },
    onError: (e) => { toast.error(e.message || "Erro ao salvar"); setSaving(false); },
  });

  const linhas = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);

  function save() {
    setSaving(true);
    upsert.mutate({
      accountId,
      // Canônicos (fusões) + limpeza dos redundantes para não duplicar.
      clientProfile: sobreCliente, objective: "", offer: "",
      operationalRules: regras, restrictions: [], constraints: "",
      // Estruturados
      businessType, ticketRange, audienceAge, audienceGender, audienceGeo, audience,
      focusMoment, events,
      conversionEventsJson: linhas(conversionEvents), importantPagesJson: linhas(importantPages), trackingNotes,
    });
  }

  function addEvent() {
    if (!newEvent.date || !newEvent.description) return;
    setEvents((p) => [...p, { ...newEvent }]);
    setNewEvent({ date: "", type: "Lançamento", description: "" });
  }

  return (
    <div className="border-t border-border bg-muted/20 px-5 py-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Brain className="w-4 h-4 text-primary" />
          <span className="text-sm font-bold text-foreground">Contexto Geral da conta</span>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/[0.08] text-primary border border-primary/25">tudo num lugar só · lido pela IA</span>
        </div>
        {onClose && <button onClick={onClose} className="p-1 text-muted-foreground/60 hover:text-foreground"><X className="w-4 h-4" /></button>}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* ── Esquerda ── */}
        <div className="flex flex-col gap-4">
          <Secao titulo="Sobre o cliente & oferta">
            <Campo value={sobreCliente} onChange={setSobreCliente} rows={4} placeholder="Quem é o cliente, o que vende, diferencial, objetivo da conta e a oferta principal." />
          </Secao>

          <Secao titulo="Negócio">
            <div className="flex flex-col gap-3">
              <div><p className="text-[11px] text-muted-foreground mb-1.5">Tipo de negócio</p><Chips options={BUSINESS_TYPES} value={businessType} onChange={setBusinessType} /></div>
              <div><p className="text-[11px] text-muted-foreground mb-1.5">Ticket médio</p><Chips options={TICKET_RANGES} value={ticketRange} onChange={setTicketRange} /></div>
            </div>
          </Secao>

          <Secao titulo="Público-alvo">
            <div className="flex flex-col gap-3">
              <div><p className="text-[11px] text-muted-foreground mb-1.5">Faixa etária</p><Chips options={AUDIENCE_AGES} value={audienceAge} onChange={setAudienceAge} /></div>
              <div><p className="text-[11px] text-muted-foreground mb-1.5">Gênero</p><Chips options={AUDIENCE_GENDERS} value={audienceGender} onChange={setAudienceGender} /></div>
              <div><p className="text-[11px] text-muted-foreground mb-1.5">Geografia</p><Chips options={AUDIENCE_GEOS} value={audienceGeo} onChange={setAudienceGeo} /></div>
              <Campo label="Detalhe (opcional)" value={audience} onChange={setAudience} placeholder="Perfil, dores, comportamento..." />
            </div>
          </Secao>

          <Secao titulo="Foco do momento" hint="Prioridade máxima — toda análise da IA considera isto primeiro.">
            <Campo value={focusMoment} onChange={setFocusMoment} rows={2} placeholder="Ex.: campanha de lançamento, verba reduzida, sazonalidade..." />
          </Secao>
        </div>

        {/* ── Direita ── */}
        <div className="flex flex-col gap-4">
          <Secao titulo="Regras & restrições" hint="A IA respeita sempre. Uma por linha.">
            <Campo value={regras} onChange={setRegras} rows={4} placeholder={"Não pausar campanha X\nOrçamento fixo\nNão usar imagem de pessoas\nLimitação técnica do site..."} />
          </Secao>

          <Secao titulo="Tracking & conversões">
            <div className="flex flex-col gap-3">
              <Campo label="Eventos de conversão esperados (um por linha)" value={conversionEvents} onChange={setConversionEvents} rows={2} placeholder={"Lead\nAdicionar ao carrinho"} />
              <Campo label="Páginas importantes (uma por linha)" value={importantPages} onChange={setImportantPages} rows={2} placeholder={"https://site.com/\nhttps://site.com/orcamento"} />
              <Campo label="Notas de tracking" value={trackingNotes} onChange={setTrackingNotes} placeholder="Como a conversão é medida, pixels, GA4..." />
            </div>
          </Secao>

          <Secao titulo="Eventos & sazonalidades">
            <div className="flex flex-col gap-2">
              {events.map((ev, i) => (
                <div key={i} className="flex items-center gap-2 text-xs border-b border-border/50 pb-1.5">
                  <span className="text-muted-foreground/60 w-[74px] flex-shrink-0">{ev.date}</span>
                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{ev.type}</span>
                  <span className="flex-1 text-foreground truncate">{ev.description}</span>
                  <button onClick={() => setEvents((p) => p.filter((_, j) => j !== i))} className="text-muted-foreground/50 hover:text-destructive"><X className="w-3 h-3" /></button>
                </div>
              ))}
              <div className="grid grid-cols-[110px_1fr_auto] gap-2 items-center">
                <input type="date" value={newEvent.date} onChange={(e) => setNewEvent((p) => ({ ...p, date: e.target.value }))} className="text-xs border border-border rounded-md px-2 py-1 bg-background" />
                <input value={newEvent.description} onChange={(e) => setNewEvent((p) => ({ ...p, description: e.target.value }))} placeholder="Descrição do evento..." className="text-xs border border-border rounded-md px-2 py-1 bg-background" />
                <button onClick={addEvent} className="p-1.5 rounded-md border border-border text-muted-foreground hover:text-foreground"><Plus className="w-3.5 h-3.5" /></button>
              </div>
              <select value={newEvent.type} onChange={(e) => setNewEvent((p) => ({ ...p, type: e.target.value }))} className="text-xs border border-border rounded-md px-2 py-1 bg-background w-40">
                {EVENT_TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
          </Secao>
        </div>
      </div>

      {/* Memória automática (read-only) */}
      {((ctx as any)?.learningsConsolidated || (ctx as any)?.learnings) && (
        <div className="mt-4 rounded-xl border border-border bg-card p-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground flex items-center gap-1.5">
            <Sparkles className="w-3 h-3 text-primary" /> Memória automática (o que a IA aprendeu)
          </p>
          <p className="text-[11px] text-muted-foreground/70 mt-0.5 mb-2">Construída sozinha a partir dos resultados e eventos. Só leitura.</p>
          {(ctx as any)?.learningsConsolidated && <p className="text-xs text-foreground/80 whitespace-pre-line leading-relaxed mb-2">{(ctx as any).learningsConsolidated}</p>}
          {(ctx as any)?.learnings && <p className="text-[11px] text-muted-foreground whitespace-pre-line leading-relaxed">{(ctx as any).learnings}</p>}
        </div>
      )}

      <div className="flex justify-end mt-4 pt-3 border-t border-border/60">
        <button onClick={save} disabled={saving} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-60">
          <Save className="w-4 h-4" /> {saving ? "Salvando..." : "Salvar contexto"}
        </button>
      </div>
    </div>
  );
}
