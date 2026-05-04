import { useState, useMemo, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "lucide-react";

// ─── Shared date-period filter ───────────────────────────────────────────────
// Reusable across Dashboard, Campaigns, Anomalies, Alerts, Suggestions, etc.

export type PeriodPreset = "today" | "yesterday" | "today_yesterday" | "7d" | "14d" | "30d" | "custom";

export interface PeriodState {
  preset: PeriodPreset;
  customStart: string; // YYYY-MM-DD
  customEnd: string;   // YYYY-MM-DD
}

export const PERIOD_LABELS: Record<PeriodPreset, string> = {
  today: "Hoje",
  yesterday: "Ontem",
  today_yesterday: "Hoje e Ontem",
  "7d": "Últimos 7d",
  "14d": "Últimos 14d",
  "30d": "Últimos 30d",
  custom: "Personalizado",
};

export const ALL_PRESETS: PeriodPreset[] = [
  "today", "yesterday", "today_yesterday", "7d", "14d", "30d", "custom",
];

/** Returns { startDate, endDate } in YYYY-MM-DD for a given preset */
export function getPresetDateRange(
  preset: PeriodPreset,
  customStart?: string,
  customEnd?: string,
): { startDate: string; endDate: string } {
  const now = new Date();
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const today = fmt(now);

  const daysAgo = (n: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() - n);
    return fmt(d);
  };

  switch (preset) {
    case "today":
      return { startDate: today, endDate: today };
    case "yesterday":
      return { startDate: daysAgo(1), endDate: daysAgo(1) };
    case "today_yesterday":
      return { startDate: daysAgo(1), endDate: today };
    case "7d":
      return { startDate: daysAgo(6), endDate: today };
    case "14d":
      return { startDate: daysAgo(13), endDate: today };
    case "30d":
      return { startDate: daysAgo(29), endDate: today };
    case "custom":
      if (customStart && customEnd) return { startDate: customStart, endDate: customEnd };
      return { startDate: daysAgo(6), endDate: today };
    default:
      return { startDate: daysAgo(6), endDate: today };
  }
}

/** Converts preset to numeric days (for backend endpoints that take `days` param) */
export function getPresetDays(preset: PeriodPreset): number {
  switch (preset) {
    case "today": return 1;
    case "yesterday": return 1;
    case "today_yesterday": return 2;
    case "7d": return 7;
    case "14d": return 14;
    case "30d": return 30;
    default: return 7;
  }
}

/** Returns a human-readable label for the current period */
export function getPeriodLabel(period: PeriodState): string {
  if (period.preset === "custom" && period.customStart && period.customEnd) {
    const fmtBR = (d: string) => d.split("-").reverse().join("/");
    return `${fmtBR(period.customStart)} — ${fmtBR(period.customEnd)}`;
  }
  return PERIOD_LABELS[period.preset] ?? "Últimos 7d";
}

// ─── Date input with mask DD/MM/YYYY ─────────────────────────────────────────
function applyDateMask(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

function DateInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (iso: string) => void;
  placeholder: string;
}) {
  const display = value
    ? value.split("-").reverse().join("/")
    : "";

  const [local, setLocal] = useState(display);

  useEffect(() => {
    setLocal(value ? value.split("-").reverse().join("/") : "");
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const masked = applyDateMask(e.target.value);
    setLocal(masked);
    if (masked.length === 10) {
      const [dd, mm, yyyy] = masked.split("/");
      const iso = `${yyyy}-${mm}-${dd}`;
      if (!isNaN(Date.parse(iso))) onChange(iso);
    }
  };

  return (
    <Input
      value={local}
      onChange={handleChange}
      placeholder={placeholder}
      className="h-7 w-[110px] text-xs bg-background"
    />
  );
}

// ─── PeriodFilter component ──────────────────────────────────────────────────
interface PeriodFilterProps {
  period: PeriodState;
  onChange: (p: PeriodState | ((prev: PeriodState) => PeriodState)) => void;
  /** Compact mode: smaller buttons, inline layout */
  compact?: boolean;
  /** Subset of presets to show (default: all) */
  presets?: PeriodPreset[];
}

export function PeriodFilter({
  period,
  onChange,
  compact = false,
  presets = ALL_PRESETS,
}: PeriodFilterProps) {
  const btnSize = compact ? "h-7 text-xs px-2.5" : "h-8 text-xs px-3";

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Calendar className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
      {presets.map((p) => (
        <Button
          key={p}
          variant={period.preset === p ? "default" : "outline"}
          size="sm"
          className={`${btnSize} ${
            period.preset === p
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
          onClick={() => onChange({ preset: p, customStart: "", customEnd: "" })}
        >
          {PERIOD_LABELS[p]}
        </Button>
      ))}
      {period.preset === "custom" && (
        <div className="flex items-center gap-1.5">
          <DateInput
            value={period.customStart}
            onChange={(v) =>
              onChange((prev) => ({ ...prev, customStart: v }))
            }
            placeholder="DD/MM/AAAA"
          />
          <span className="text-xs text-muted-foreground">a</span>
          <DateInput
            value={period.customEnd}
            onChange={(v) =>
              onChange((prev) => ({ ...prev, customEnd: v }))
            }
            placeholder="DD/MM/AAAA"
          />
        </div>
      )}
    </div>
  );
}

// ─── usePeriodFilter hook ────────────────────────────────────────────────────
export function usePeriodFilter(defaultPreset: PeriodPreset = "7d") {
  const [period, setPeriod] = useState<PeriodState>({
    preset: defaultPreset,
    customStart: "",
    customEnd: "",
  });

  const dateRange = useMemo(
    () => getPresetDateRange(period.preset, period.customStart, period.customEnd),
    [period],
  );

  /** Query params compatible with backend endpoints expecting { days } or { startDate, endDate } */
  const queryParams = useMemo(() => {
    if (period.preset === "custom" && period.customStart && period.customEnd) {
      return { startDate: period.customStart, endDate: period.customEnd };
    }
    return { days: getPresetDays(period.preset) };
  }, [period]);

  /** Check if a date string (YYYY-MM-DD or ISO timestamp) falls within the selected period range */
  const isInRange = useCallback(
    (dateStr: string | Date | null | undefined): boolean => {
      if (!dateStr) return false;
      const d = typeof dateStr === "string" ? dateStr.slice(0, 10) : dateStr.toISOString().slice(0, 10);
      return d >= dateRange.startDate && d <= dateRange.endDate;
    },
    [dateRange],
  );

  const reset = useCallback(() => {
    setPeriod({ preset: defaultPreset, customStart: "", customEnd: "" });
  }, [defaultPreset]);

  return { period, setPeriod, dateRange, queryParams, isInRange, reset };
}
