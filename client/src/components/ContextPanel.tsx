import { trpc } from "@/lib/trpc";
import { IndicadorDeRascunho, useRascunhoDeFormulario } from "@/hooks/useRascunhoAutosalvo";
import {
  FAIXAS_DE_TICKET, TIPOS_DE_NEGOCIO, alternarTipoDeNegocio, escreverTiposDeNegocio,
  lerFaixaDeTicket, lerTiposDeNegocio,
} from "@shared/contextoOpcoes";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Brain, Check, Plus, X, Calendar, Save } from "lucide-react";

const AUDIENCE_AGES = ["18–24", "25–34", "35–44", "45–54", "55+", "Amplo"];
const AUDIENCE_GENDERS = ["Feminino", "Masculino", "Neutro"];
const AUDIENCE_GEOS = ["Nacional", "Sul/Sudeste", "Nordeste", "Regional", "Internacional"];
const EVENT_TYPES = ["Lançamento", "Promoção", "Sazonalidade", "Pausa", "Crise", "Outro"];

const estiloChip = (on: boolean) => ({
  padding: "4px 12px", borderRadius: 20, fontSize: 12, cursor: "pointer",
  border: on ? "1px solid rgba(212,83,126,0.5)" : "0.5px solid rgba(0,0,0,0.15)",
  background: on ? "rgba(212,83,126,0.08)" : "white",
  color: on ? "#993556" : "rgba(0,0,0,0.5)",
  fontWeight: on ? 500 : 400,
  display: "inline-flex", alignItems: "center", gap: 5,
} as const);

/**
 * Seleção MÚLTIPLA — as categorias de negócio não são exclusivas.
 *
 * B2B + SaaS e E-commerce + Marketplace são combinações reais. O visto marcado
 * é o que distingue este grupo do de seleção única; sem ele os dois pareceriam
 * iguais e ninguém descobriria que dá para marcar mais de um.
 */
function ChipGroupMultiplo({ options, valores, onToggle }: {
  options: readonly string[];
  valores: string[];
  onToggle: (v: string) => void;
}) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {options.map((opt) => {
        const on = valores.includes(opt);
        return (
          <button key={opt} type="button" aria-pressed={on}
            onClick={() => onToggle(opt)} style={estiloChip(on)}>
            {on && <Check size={12} strokeWidth={3} />}
            {opt}
          </button>
        );
      })}
    </div>
  );
}

function ChipGroup({ options, value, onChange }: {
  options: readonly string[];
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

interface CamposDoPainel {
  businessType: string; ticketRange: string;
  audienceAge: string; audienceGender: string; audienceGeo: string;
  restrictions: string[]; events: Array<{ date: string; type: string; description: string }>;
  freeInput: string; focusMoment: string;
}

/**
 * O payload, montado num lugar só.
 *
 * Autosave, botão e adoção do que vem do servidor passam todos por aqui. Três
 * montagens separadas divergiriam, e uma delas passaria a esquecer um campo sem
 * ninguém notar.
 */
const montarPayload = (c: CamposDoPainel) => ({ ...c });

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
  const [focusMoment, setFocusMoment] = useState("");
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
      setFocusMoment(ctx.focusMoment ?? "");

      /*
       * A adoção acontece AQUI, com o payload montado a partir de `ctx`.
       *
       * Os `setState` acima só valem no próximo render; um efeito posterior
       * rodaria neste ciclo ainda com os campos em branco e adotaria um payload
       * vazio como se fosse o do servidor — o autosave então gravaria vazio por
       * cima do contexto real na primeira tecla.
       */
      rascunho.adotarDoServidor(montarPayload({
        businessType: ctx.businessType ?? "", ticketRange: ctx.ticketRange ?? "",
        audienceAge: ctx.audienceAge ?? "", audienceGender: ctx.audienceGender ?? "",
        audienceGeo: ctx.audienceGeo ?? "",
        restrictions: (ctx.restrictions as string[]) ?? [],
        events: (ctx.events as CamposDoPainel["events"]) ?? [],
        freeInput: ctx.freeInput ?? "", focusMoment: ctx.focusMoment ?? "",
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx]);

  const upsert = trpc.context.upsertAccount.useMutation({
    onSuccess: () => { toast.success("Contexto salvo"); setSaving(false); refetch(); onClose?.(); },
    onError: () => { toast.error("Erro ao salvar"); setSaving(false); },
  });

  /**
   * Autosave — a MESMA máquina do contexto rápido.
   *
   * Sem toast e SEM `confirmarParaIA`: gravar rascunho não carimba
   * `contextoConfirmadoEm`, então o cron das 06:00 não regera por causa de
   * digitação.
   */
  const upsertSilencioso = trpc.context.upsertAccount.useMutation();
  const rascunho = useRascunhoDeFormulario<CamposDoPainel>({
    chave: accountId,
    salvar: (v) => upsertSilencioso.mutateAsync({ accountId, ...v } as never),
  });

  const payload = useMemo(() => montarPayload({
    businessType, ticketRange, audienceAge, audienceGender, audienceGeo,
    restrictions, events, freeInput, focusMoment,
  }), [businessType, ticketRange, audienceAge, audienceGender, audienceGeo,
       restrictions, events, freeInput, focusMoment]);

  useEffect(() => { rascunho.sincronizar(payload); }, [payload, rascunho]);

  function save() {
    setSaving(true);
    // Pode haver uma pausa em voo; gravar aqui garante o texto final.
    rascunho.flush();
    // `confirmarParaIA`: é o gesto explícito. O autosave nunca manda isto.
    upsert.mutate({ accountId, ...payload, confirmarParaIA: true });
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
            <ChipGroupMultiplo options={TIPOS_DE_NEGOCIO} valores={lerTiposDeNegocio(businessType)}
              onToggle={(t) => setBusinessType(
                escreverTiposDeNegocio(alternarTipoDeNegocio(lerTiposDeNegocio(businessType), t)))} />
            <p style={{ fontSize: 11, color: "rgba(0,0,0,0.4)", margin: "12px 0 8px" }}>Ticket médio</p>
            <ChipGroup options={FAIXAS_DE_TICKET} value={lerFaixaDeTicket(ticketRange).faixa ?? ""}
              onChange={setTicketRange} />
            {lerFaixaDeTicket(ticketRange).legado && (
              <p style={{ fontSize: 10.5, color: "#B45309", marginTop: 6, lineHeight: 1.35 }}>
                Valor anterior: <b>{lerFaixaDeTicket(ticketRange).legado}</b> — a escala mudou e esta
                faixa não tem correspondente exato. Escolha a nova.
              </p>
            )}
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

      {/*
        O botão FICA, e mudou de significado.
        Auditado: ele nunca gerou IA — só persistia (com toast, refetch e
        fechamento do painel). Com o autosave, persistir deixou de ser trabalho
        dele. O que sobra é dizer que ESTE contexto deve valer para a próxima
        análise: ele carimba `contextoConfirmadoEm`, e o rótulo diz isso.
      */}
      <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 12, marginTop: 20, paddingTop: 16, borderTop: "0.5px solid rgba(0,0,0,0.06)" }}>
        <IndicadorDeRascunho estado={rascunho.estado} />
        <button
          onClick={save}
          disabled={saving}
          title="Marca este contexto como o que a IA deve considerar na próxima análise"
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 18px", borderRadius: 8, border: "none", background: "#D4537E", color: "white", fontSize: 13, fontWeight: 500, cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.75 : 1 }}
        >
          <Save style={{ width: 13, height: 13 }} />
          {saving ? "Confirmando…" : "Confirmar para a IA"}
        </button>
      </div>
    </div>
  );
}
