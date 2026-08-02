/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Contexto Geral — a ÚNICA tela de contexto por conta (Fase 3)
 * ─────────────────────────────────────────────────────────────────────────────
 *  Edita TODOS os campos de account_context (a tabela unificada): perfil, negócio,
 *  público, objetivo/oferta, foco, regras/restrições, tracking/conversões,
 *  hipóteses, eventos e input livre. Substitui o antigo ContextPanel (que só
 *  editava um subconjunto) e a AbaContexto espalhada. A memória automática
 *  (learnings) aparece só leitura. Tudo isto é o que as IAs leem pela fonte única.
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
      {hint && <p className="text-[11px] text-muted-foreground/70 mt-0.5 mb-2.5">{hint}</p>}
      <div className={hint ? "" : "mt-2.5"}>{children}</div>
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
  // Estruturados (account_context)
  const [clientProfile, setClientProfile] = useState("");
  const [businessType, setBusinessType] = useState("");
  const [ticketRange, setTicketRange] = useState("");
  const [audienceAge, setAudienceAge] = useState("");
  const [audienceGender, setAudienceGender] = useState("");
  const [audienceGeo, setAudienceGeo] = useState("");
  const [focusMoment, setFocusMoment] = useState("");
  const [operationalRules, setOperationalRules] = useState("");
  const [restrictions, setRestrictions] = useState("");   // uma por linha
  const [freeInput, setFreeInput] = useState("");
  const [events, setEvents] = useState<Evento[]>([]);
  const [newEvent, setNewEvent] = useState<Evento>({ date: "", type: "Lançamento", description: "" });
  // Site (migrados p/ account_context)
  const [objective, setObjective] = useState("");
  const [offer, setOffer] = useState("");
  const [audience, setAudience] = useState("");
  const [importantPages, setImportantPages] = useState(""); // uma por linha
  const [conversionEvents, setConversionEvents] = useState(""); // um por linha
  const [trackingNotes, setTrackingNotes] = useState("");
  const [currentHypotheses, setCurrentHypotheses] = useState("");
  const [constraints, setConstraints] = useState("");
  const [previousTests, setPreviousTests] = useState("");
  const [nextSteps, setNextSteps] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: ctx, refetch } = trpc.context.getAccount.useQuery({ accountId }, { enabled: !!accountId, staleTime: 30_000 });

  useEffect(() => {
    if (!ctx) return;
    const c = ctx as Record<string, any>;
    setClientProfile(c.clientProfile ?? "");
    setBusinessType(c.businessType ?? "");
    setTicketRange(c.ticketRange ?? "");
    setAudienceAge(c.audienceAge ?? "");
    setAudienceGender(c.audienceGender ?? "");
    setAudienceGeo(c.audienceGeo ?? "");
    setFocusMoment(c.focusMoment ?? "");
    setOperationalRules(c.operationalRules ?? "");
    setRestrictions(((c.restrictions as string[]) ?? []).join("\n"));
    setFreeInput(c.freeInput ?? "");
    setEvents((c.events as Evento[]) ?? []);
    setObjective(c.objective ?? "");
    setOffer(c.offer ?? "");
    setAudience(c.audience ?? "");
    setImportantPages(((c.importantPagesJson as string[]) ?? []).join("\n"));
    setConversionEvents(((c.conversionEventsJson as string[]) ?? []).join("\n"));
    setTrackingNotes(c.trackingNotes ?? "");
    setCurrentHypotheses(c.currentHypotheses ?? "");
    setConstraints(c.constraints ?? "");
    setPreviousTests(c.previousTests ?? "");
    setNextSteps(c.nextSteps ?? "");
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
      clientProfile, businessType, ticketRange, audienceAge, audienceGender, audienceGeo,
      focusMoment, operationalRules, restrictions: linhas(restrictions), freeInput, events,
      objective, offer, audience,
      importantPagesJson: linhas(importantPages), conversionEventsJson: linhas(conversionEvents),
      trackingNotes, currentHypotheses, constraints, previousTests, nextSteps,
    });
  }

  function addEvent() {
    if (!newEvent.date || !newEvent.description) return;
    setEvents((p) => [...p, { ...newEvent }]);
    setNewEvent({ date: "", type: "Lançamento", description: "" });
  }

  const memoria = (ctx as any)?.learningsConsolidated || (ctx as any)?.learnings;

  return (
    <div className="border-t border-border bg-muted/20 px-5 py-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Brain className="w-4 h-4 text-primary" />
          <span className="text-sm font-bold text-foreground">Contexto Geral da conta</span>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/[0.08] text-primary border border-primary/25">tudo num lugar só · lido pela IA</span>
        </div>
        {onClose && (
          <button onClick={onClose} className="p-1 text-muted-foreground/60 hover:text-foreground"><X className="w-4 h-4" /></button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* ── Coluna esquerda ── */}
        <div className="flex flex-col gap-4">
          <Secao titulo="Perfil & negócio">
            <div className="flex flex-col gap-3">
              <Campo label="Perfil do cliente" value={clientProfile} onChange={setClientProfile} rows={2} placeholder="Quem é o cliente, o que vende, diferencial..." />
              <div>
                <p className="text-[11px] text-muted-foreground mb-1.5">Tipo de negócio</p>
                <Chips options={BUSINESS_TYPES} value={businessType} onChange={setBusinessType} />
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground mb-1.5">Ticket médio</p>
                <Chips options={TICKET_RANGES} value={ticketRange} onChange={setTicketRange} />
              </div>
            </div>
          </Secao>

          <Secao titulo="Público-alvo">
            <div className="flex flex-col gap-3">
              <div><p className="text-[11px] text-muted-foreground mb-1.5">Faixa etária</p><Chips options={AUDIENCE_AGES} value={audienceAge} onChange={setAudienceAge} /></div>
              <div><p className="text-[11px] text-muted-foreground mb-1.5">Gênero</p><Chips options={AUDIENCE_GENDERS} value={audienceGender} onChange={setAudienceGender} /></div>
              <div><p className="text-[11px] text-muted-foreground mb-1.5">Geografia</p><Chips options={AUDIENCE_GEOS} value={audienceGeo} onChange={setAudienceGeo} /></div>
              <Campo label="Descrição do público (detalhe)" value={audience} onChange={setAudience} placeholder="Perfil, dores, comportamento..." />
            </div>
          </Secao>

          <Secao titulo="Objetivo & oferta">
            <div className="flex flex-col gap-3">
              <Campo label="Objetivo" value={objective} onChange={setObjective} placeholder="O que a conta precisa alcançar." />
              <Campo label="Oferta" value={offer} onChange={setOffer} placeholder="O que está sendo anunciado / promoção." />
            </div>
          </Secao>

          <Secao titulo="Foco do momento" hint="Prioridade máxima — toda análise da IA considera isto primeiro.">
            <Campo value={focusMoment} onChange={setFocusMoment} rows={2} placeholder="Ex.: campanha de lançamento, verba reduzida, sazonalidade..." />
          </Secao>
        </div>

        {/* ── Coluna direita ── */}
        <div className="flex flex-col gap-4">
          <Secao titulo="Regras & restrições" hint="A IA respeita sempre.">
            <div className="flex flex-col gap-3">
              <Campo label="Regras operacionais" value={operationalRules} onChange={setOperationalRules} placeholder="Ex.: não pausar campanha X, orçamento fixo..." />
              <Campo label="Restrições (uma por linha)" value={restrictions} onChange={setRestrictions} rows={2} placeholder={"Não usar imagem de pessoas\nEvitar termo Y"} />
              <Campo label="Constraints do site" value={constraints} onChange={setConstraints} placeholder="Limitações técnicas / do site." />
            </div>
          </Secao>

          <Secao titulo="Tracking & conversões">
            <div className="flex flex-col gap-3">
              <Campo label="Eventos de conversão esperados (um por linha)" value={conversionEvents} onChange={setConversionEvents} rows={2} placeholder={"Lead\nAdicionar ao carrinho"} />
              <Campo label="Páginas importantes (uma por linha)" value={importantPages} onChange={setImportantPages} rows={2} placeholder={"https://site.com/\nhttps://site.com/orcamento"} />
              <Campo label="Notas de tracking" value={trackingNotes} onChange={setTrackingNotes} placeholder="Como a conversão é medida, pixels, GA4..." />
            </div>
          </Secao>

          <Secao titulo="Hipóteses & próximos passos">
            <div className="flex flex-col gap-3">
              <Campo label="Hipóteses atuais" value={currentHypotheses} onChange={setCurrentHypotheses} />
              <Campo label="Já testado" value={previousTests} onChange={setPreviousTests} />
              <Campo label="Próximos passos" value={nextSteps} onChange={setNextSteps} />
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
                <input type="date" value={newEvent.date} onChange={(e) => setNewEvent((p) => ({ ...p, date: e.target.value }))}
                  className="text-xs border border-border rounded-md px-2 py-1 bg-background" />
                <input value={newEvent.description} onChange={(e) => setNewEvent((p) => ({ ...p, description: e.target.value }))} placeholder="Descrição do evento..."
                  className="text-xs border border-border rounded-md px-2 py-1 bg-background" />
                <button onClick={addEvent} className="p-1.5 rounded-md border border-border text-muted-foreground hover:text-foreground"><Plus className="w-3.5 h-3.5" /></button>
              </div>
              <select value={newEvent.type} onChange={(e) => setNewEvent((p) => ({ ...p, type: e.target.value }))}
                className="text-xs border border-border rounded-md px-2 py-1 bg-background w-40">
                {EVENT_TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
          </Secao>

          <Secao titulo="Input livre para a IA" hint="Não aparece no dashboard do cliente.">
            <Campo value={freeInput} onChange={setFreeInput} rows={2} placeholder="Qualquer contexto adicional, instruções específicas..." />
          </Secao>
        </div>
      </div>

      {/* Memória automática (read-only) */}
      {memoria && (
        <div className="mt-4 rounded-xl border border-border bg-card p-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground flex items-center gap-1.5">
            <Sparkles className="w-3 h-3 text-primary" /> Memória automática (o que a IA aprendeu)
          </p>
          <p className="text-[11px] text-muted-foreground/70 mt-0.5 mb-2">Construída sozinha a partir dos resultados e eventos. Só leitura.</p>
          {(ctx as any)?.learningsConsolidated && (
            <p className="text-xs text-foreground/80 whitespace-pre-line leading-relaxed mb-2">{(ctx as any).learningsConsolidated}</p>
          )}
          {(ctx as any)?.learnings && (
            <p className="text-[11px] text-muted-foreground whitespace-pre-line leading-relaxed">{(ctx as any).learnings}</p>
          )}
        </div>
      )}

      {/* Salvar */}
      <div className="flex justify-end mt-4 pt-3 border-t border-border/60">
        <button onClick={save} disabled={saving}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-60">
          <Save className="w-4 h-4" /> {saving ? "Salvando..." : "Salvar contexto"}
        </button>
      </div>
    </div>
  );
}
