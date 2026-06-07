import { trpc } from "@/lib/trpc";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Brain, Plus, X, Calendar, Save } from "lucide-react";

const BUSINESS_TYPES = ["E-commerce", "Serviço", "B2B", "Varejo físico", "Marketplace", "SaaS", "Outro"];
const TICKET_RANGES = ["Até R$100", "R$100–500", "R$500–2k", "Acima de R$2k"];
const AUDIENCE_AGES = ["18–24", "25–34", "35–44", "45–54", "55+", "Amplo"];
const AUDIENCE_GENDERS = ["Feminino", "Masculino", "Neutro"];
const AUDIENCE_GEOS = ["Nacional", "Sul/Sudeste", "Nordeste", "Regional", "Internacional"];
const EVENT_TYPES = ["Lançamento", "Promoção", "Sazonalidade", "Pausa", "Crise", "Outro"];

function ChipGroup({ options, value, onChange }: {
  options: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {options.map(opt => (
        <button
          key={opt}
          onClick={() => onChange(value === opt ? "" : opt)}
          style={{
            padding: "4px 12px", borderRadius: 20, fontSize: 12, cursor: "pointer",
            border: value === opt ? "1px solid rgba(212,83,126,0.5)" : "0.5px solid rgba(0,0,0,0.15)",
            background: value === opt ? "rgba(212,83,126,0.08)" : "white",
            color: value === opt ? "#993556" : "rgba(0,0,0,0.5)",
            fontWeight: value === opt ? 500 : 400,
          }}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

export function ContextPanel({ accountId, onClose }: { accountId: number; onClose?: () => void }) {
  const [businessType, setBusinessType] = useState("");
  const [ticketRange, setTicketRange] = useState("");
  const [audienceAge, setAudienceAge] = useState("");
  const [audienceGender, setAudienceGender] = useState("");
  const [audienceGeo, setAudienceGeo] = useState("");
  const [restrictions, setRestrictions] = useState<string[]>([]);
  const [restrictionInput, setRestrictionInput] = useState("");
  const [events, setEvents] = useState<Array<{ date: string; type: string; description: string }>>([]);
  const [newEvent, setNewEvent] = useState({ date: "", type: "Lançamento", description: "" });
  const [showEventForm, setShowEventForm] = useState(false);
  const [freeInput, setFreeInput] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: ctx, refetch } = trpc.context.getAccount.useQuery(
    { accountId },
    { enabled: !!accountId, staleTime: 30_000 }
  );

  useEffect(() => {
    if (ctx) {
      setBusinessType(ctx.businessType ?? "");
      setTicketRange(ctx.ticketRange ?? "");
      setAudienceAge(ctx.audienceAge ?? "");
      setAudienceGender(ctx.audienceGender ?? "");
      setAudienceGeo(ctx.audienceGeo ?? "");
      setRestrictions((ctx.restrictions as string[]) ?? []);
      setEvents((ctx.events as any[]) ?? []);
      setFreeInput(ctx.freeInput ?? "");
    }
  }, [ctx]);

  const upsert = trpc.context.upsertAccount.useMutation({
    onSuccess: () => { toast.success("Contexto salvo"); setSaving(false); refetch(); },
    onError: () => { toast.error("Erro ao salvar"); setSaving(false); },
  });

  function save() {
    setSaving(true);
    upsert.mutate({ accountId, businessType, ticketRange, audienceAge, audienceGender, audienceGeo, restrictions, events, freeInput });
  }

  function addRestriction() {
    const val = restrictionInput.trim();
    if (!val || restrictions.includes(val)) return;
    setRestrictions(prev => [...prev, val]);
    setRestrictionInput("");
  }

  function addEvent() {
    if (!newEvent.date || !newEvent.description) return;
    setEvents(prev => [...prev, { ...newEvent }]);
    setNewEvent({ date: "", type: "Lançamento", description: "" });
    setShowEventForm(false);
  }

  const fieldStyle = {
    width: "100%", fontSize: 12, padding: "7px 10px", borderRadius: 8,
    border: "0.5px solid rgba(0,0,0,0.15)", background: "white",
    fontFamily: "inherit", outline: "none", color: "#111",
  };

  const sectionLabel = {
    fontSize: 10, fontWeight: 600 as const, color: "rgba(0,0,0,0.35)",
    textTransform: "uppercase" as const, letterSpacing: "0.07em",
    display: "block", marginBottom: 10,
  };

  const completeness = [businessType, ticketRange, audienceAge, audienceGender, audienceGeo]
    .filter(Boolean).length + Math.min(restrictions.length, 1) + Math.min(events.length, 1) + (freeInput ? 1 : 0);
  const total = 8;
  const pct = Math.round((completeness / total) * 100);

  return (
    <div style={{ borderTop: "1px solid rgba(0,0,0,0.08)", padding: "20px 24px", background: "white" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Brain style={{ width: 14, height: 14, color: "#D4537E" }} />
          <span style={{ fontSize: 13, fontWeight: 500, color: "#111" }}>Contexto da conta</span>
          <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, background: "rgba(212,83,126,0.08)", color: "#993556", border: "0.5px solid rgba(212,83,126,0.25)" }}>
            {pct}% preenchido · lido pela IA
          </span>
        </div>
        {onClose && (
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(0,0,0,0.3)", padding: 2 }}>
            <X style={{ width: 14, height: 14 }} />
          </button>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>

        {/* Left column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          <div>
            <span style={sectionLabel}>Negócio</span>
            <p style={{ fontSize: 11, color: "rgba(0,0,0,0.4)", marginBottom: 8 }}>Tipo de negócio</p>
            <ChipGroup options={BUSINESS_TYPES} value={businessType} onChange={setBusinessType} />
            <p style={{ fontSize: 11, color: "rgba(0,0,0,0.4)", margin: "12px 0 8px" }}>Ticket médio</p>
            <ChipGroup options={TICKET_RANGES} value={ticketRange} onChange={setTicketRange} />
          </div>

          <div style={{ borderTop: "0.5px solid rgba(0,0,0,0.06)", paddingTop: 16 }}>
            <span style={sectionLabel}>Público-alvo</span>
            <p style={{ fontSize: 11, color: "rgba(0,0,0,0.4)", marginBottom: 8 }}>Faixa etária principal</p>
            <ChipGroup options={AUDIENCE_AGES} value={audienceAge} onChange={setAudienceAge} />
            <p style={{ fontSize: 11, color: "rgba(0,0,0,0.4)", margin: "12px 0 8px" }}>Gênero predominante</p>
            <ChipGroup options={AUDIENCE_GENDERS} value={audienceGender} onChange={setAudienceGender} />
            <p style={{ fontSize: 11, color: "rgba(0,0,0,0.4)", margin: "12px 0 8px" }}>Geografia</p>
            <ChipGroup options={AUDIENCE_GEOS} value={audienceGeo} onChange={setAudienceGeo} />
          </div>

          <div style={{ borderTop: "0.5px solid rgba(0,0,0,0.06)", paddingTop: 16 }}>
            <span style={sectionLabel}>Input livre para a IA</span>
            <textarea
              value={freeInput}
              onChange={e => setFreeInput(e.target.value)}
              placeholder="Contexto adicional, mudanças recentes, instruções específicas... Não aparece no dashboard."
              rows={3}
              style={{ ...fieldStyle, resize: "vertical", lineHeight: 1.5 }}
              onFocus={e => e.currentTarget.style.borderColor = "rgba(212,83,126,0.4)"}
              onBlur={e => e.currentTarget.style.borderColor = "rgba(0,0,0,0.15)"}
            />
          </div>
        </div>

        {/* Right column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          <div>
            <span style={sectionLabel}>Restrições operacionais</span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
              {restrictions.map((r, i) => (
                <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 20, fontSize: 11, fontWeight: 500, background: "rgba(0,0,0,0.04)", border: "0.5px solid rgba(0,0,0,0.12)", color: "#111" }}>
                  {r}
                  <button onClick={() => setRestrictions(prev => prev.filter((_, j) => j !== i))} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: "rgba(0,0,0,0.3)", display: "flex" }}>
                    <X style={{ width: 10, height: 10 }} />
                  </button>
                </span>
              ))}
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <input
                value={restrictionInput}
                onChange={e => setRestrictionInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addRestriction(); } }}
                placeholder="Adicionar restrição..."
                style={{ ...fieldStyle, flex: 1 }}
                onFocus={e => e.currentTarget.style.borderColor = "rgba(212,83,126,0.4)"}
                onBlur={e => e.currentTarget.style.borderColor = "rgba(0,0,0,0.15)"}
              />
              <button onClick={addRestriction} style={{ padding: "6px 10px", borderRadius: 8, border: "0.5px solid rgba(0,0,0,0.15)", background: "white", cursor: "pointer", color: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center" }}>
                <Plus style={{ width: 14, height: 14 }} />
              </button>
            </div>
          </div>

          <div style={{ borderTop: "0.5px solid rgba(0,0,0,0.06)", paddingTop: 16 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <span style={sectionLabel}>Eventos e sazonalidades</span>
              <button onClick={() => setShowEventForm(v => !v)} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, padding: "3px 8px", borderRadius: 6, border: "0.5px solid rgba(0,0,0,0.15)", background: "white", cursor: "pointer", color: "rgba(0,0,0,0.45)" }}>
                <Plus style={{ width: 11, height: 11 }} /> Adicionar
              </button>
            </div>

            {showEventForm && (
              <div style={{ padding: "10px 12px", borderRadius: 8, background: "rgba(0,0,0,0.02)", border: "0.5px solid rgba(0,0,0,0.1)", marginBottom: 10 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                  <input type="date" value={newEvent.date} onChange={e => setNewEvent(p => ({ ...p, date: e.target.value }))} style={fieldStyle} />
                  <select value={newEvent.type} onChange={e => setNewEvent(p => ({ ...p, type: e.target.value }))} style={fieldStyle}>
                    {EVENT_TYPES.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <input value={newEvent.description} onChange={e => setNewEvent(p => ({ ...p, description: e.target.value }))} placeholder="Descrição do evento..." style={{ ...fieldStyle, marginBottom: 8 }} />
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={addEvent} style={{ padding: "5px 12px", borderRadius: 6, border: "none", background: "#D4537E", color: "white", fontSize: 11, fontWeight: 500, cursor: "pointer" }}>Confirmar</button>
                  <button onClick={() => setShowEventForm(false)} style={{ padding: "5px 12px", borderRadius: 6, border: "0.5px solid rgba(0,0,0,0.12)", background: "white", fontSize: 11, cursor: "pointer", color: "rgba(0,0,0,0.4)" }}>Cancelar</button>
                </div>
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
              {events.length === 0 && !showEventForm && (
                <p style={{ fontSize: 11, color: "rgba(0,0,0,0.3)", fontStyle: "italic" }}>Nenhum evento cadastrado</p>
              )}
              {events.map((ev, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: "0.5px solid rgba(0,0,0,0.05)" }}>
                  <span style={{ fontSize: 10, color: "rgba(0,0,0,0.35)", minWidth: 68 }}>{ev.date}</span>
                  <span style={{ fontSize: 10, fontWeight: 500, padding: "2px 7px", borderRadius: 4, background: "rgba(0,0,0,0.05)", color: "rgba(0,0,0,0.5)" }}>{ev.type}</span>
                  <span style={{ fontSize: 11, color: "#111", flex: 1 }}>{ev.description}</span>
                  <button onClick={() => setEvents(prev => prev.filter((_, j) => j !== i))} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(0,0,0,0.25)", padding: 0 }}>
                    <X style={{ width: 11, height: 11 }} />
                  </button>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>

      {/* Save button */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 20, paddingTop: 16, borderTop: "0.5px solid rgba(0,0,0,0.06)" }}>
        <button
          onClick={save}
          disabled={saving}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 18px", borderRadius: 8, border: "none", background: "#D4537E", color: "white", fontSize: 13, fontWeight: 500, cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.75 : 1 }}
        >
          <Save style={{ width: 13, height: 13 }} />
          {saving ? "Salvando..." : "Salvar contexto"}
        </button>
      </div>
    </div>
  );
}
