import {
  AlertTriangle, Bell, CreditCard, ExternalLink, FileX,
  Image, Info, Instagram, Key, Link2Off, Pause, Wallet, Sparkles, Check,
} from "lucide-react";
import React from "react";
import { useLocation } from "wouter";

export const CRITICAL_TYPES = new Set(["SYNC_ERROR", "PAYMENT_FAILED", "AD_REJECTED", "PIXEL_ERROR", "PAGE_UNLINKED", "CAMPAIGN_PAUSED"]);
export const WARNING_TYPES = new Set(["AD_ERROR", "BUDGET_WARNING", "INSTAGRAM_UNLINKED", "ADSET_NO_DELIVERY"]);
export const NOTIFICATION_TYPES = new Set(["SUGGESTION_APPLIED", "EXPERIMENT_UPDATE", "REPORT"]);

export const typeConfig: Record<string, { icon: React.ComponentType<{ size?: number; className?: string; style?: React.CSSProperties }>; label: string; isTokenIssue?: boolean }> = {
  SYNC_ERROR:      { icon: Key,          label: "Token expirado", isTokenIssue: true },
  BUDGET_WARNING:  { icon: Wallet,       label: "Saldo baixo" },
  PAYMENT_FAILED:  { icon: CreditCard,   label: "Falha de pagamento" },
  AD_REJECTED:     { icon: FileX,        label: "Criativo rejeitado" },
  AD_ERROR:        { icon: AlertTriangle,label: "Erro em anúncio/conjunto" },
  PAGE_UNLINKED:   { icon: Link2Off,     label: "Página desvinculada" },
  INSTAGRAM_UNLINKED: { icon: Instagram, label: "Instagram desvinculado" },
  PIXEL_ERROR:     { icon: Image,        label: "Erro no pixel" },
  CAMPAIGN_PAUSED: { icon: Pause,        label: "Campanha pausada" },
  ADSET_NO_DELIVERY: { icon: AlertTriangle, label: "Conjunto sem veiculação" },
  SUGGESTION_APPLIED: { icon: Sparkles,  label: "Ação aplicada" },
  EXPERIMENT_UPDATE: { icon: Info,       label: "Experimento" },
  REPORT:          { icon: Bell,         label: "Relatório" },
};

export function timeAgo(date: string | Date): string {
  const d = new Date(date);
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "agora mesmo";
  if (mins < 60) return `há ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `há ${hours} hora${hours !== 1 ? "s" : ""}`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `há ${days} dia${days !== 1 ? "s" : ""}`;
  return d.toLocaleDateString("pt-BR");
}

export function initials(name: string | null | undefined): string {
  if (!name) return "??";
  const parts = name.replace(/^CA\s*[-–]\s*/i, "").trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase();
}

export function buildManagerUrl(metaAccountId: string | null | undefined): string | null {
  if (!metaAccountId) return null;
  return `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${metaAccountId}`;
}

export function AlertBlock({ alert, onDismiss, isLast }: { alert: any; onDismiss: (id: number) => void; isLast: boolean }) {
  const [, navigate] = useLocation();
  const cfg = typeConfig[alert.type] ?? { icon: AlertTriangle, label: alert.type };
  const Icon = cfg.icon;
  const isCritical = CRITICAL_TYPES.has(alert.type);
  const managerUrl = buildManagerUrl(alert.metaAccountId);

  const iconBoxStyle: React.CSSProperties = isCritical
    ? { background: "#FCEBEB", color: "#A32D2D" }
    : { background: "#FAEEDA", color: "#854F0B" };

  const handleAction = () => {
    if (cfg.isTokenIssue) {
      navigate("/settings");
    } else if (managerUrl) {
      window.open(managerUrl, "_blank", "noopener,noreferrer");
    }
  };

  const actionLabel = cfg.isTokenIssue ? "Reconectar" : "Ver no gerenciador";

  return (
    <div style={{ padding: "16px 18px", borderBottom: isLast ? "none" : "0.5px solid var(--color-border-tertiary)", display: "flex", gap: 14 }}>
      <div style={{ width: 38, height: 38, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, ...iconBoxStyle }}>
        <Icon size={17} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>{alert.title}</div>
            <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.6, maxWidth: 560 }}>{alert.message}</div>
            <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginTop: 8 }}>{timeAgo(alert.createdAt)}</div>
          </div>
          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
            {(cfg.isTokenIssue || managerUrl) && (
              <div onClick={handleAction} style={{ padding: "7px 14px", background: "#FBEAF0", color: "#993556", borderRadius: 8, fontSize: 12, fontWeight: 500, border: "0.5px solid #ED93B1", cursor: "pointer", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 5 }}>
                {actionLabel} <ExternalLink size={12} />
              </div>
            )}
            <div onClick={() => onDismiss(alert.id)} style={{ width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--color-text-secondary)", borderRadius: 8, fontSize: 13, cursor: "pointer", border: "0.5px solid var(--color-border-tertiary)" }}>
              <Check size={14} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
