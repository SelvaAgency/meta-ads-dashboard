import { MetaDashboardLayout } from "@/components/MetaDashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  CreditCard,
  ExternalLink,
  Key,
  Link2,
  Loader2,
  Trash2,
  Wallet,
  Zap,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

// ─── Funding source type → label ─────────────────────────────────────────────
function getFundingLabel(type: number | null): string {
  if (type === null) return "Não configurado";
  const map: Record<number, string> = {
    0: "Não configurado",
    1: "Cartão de crédito",
    2: "Saldo Meta (pré-pago)",
    3: "Crédito pago Meta",
    4: "Crédito estendido Meta",
    5: "Ordem",
    6: "Fatura",
    12: "PayPal",
    13: "PayPal (recorrente)",
    15: "Depósito externo (PIX/Boleto)",
    17: "Débito direto",
    19: "Pagamento alternativo",
    20: "Saldo armazenado (pré-pago)",
  };
  return map[type] ?? `Tipo ${type}`;
}

function getFundingIcon(type: number | null) {
  if (type === null) return <AlertCircle className="w-3.5 h-3.5 text-muted-foreground" />;
  if ([2, 15, 20].includes(type)) return <Wallet className="w-3.5 h-3.5 text-blue-400" />;
  return <CreditCard className="w-3.5 h-3.5 text-purple-400" />;
}

// ─── Balance card for a connected account ────────────────────────────────────
function AccountBillingCard({ accountId }: { accountId: number }) {
  const { data: billing, isLoading } = trpc.accounts.billing.useQuery({ accountId });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
        <Loader2 className="w-3 h-3 animate-spin" />
        Carregando saldo...
      </div>
    );
  }

  if (!billing) return null;

  const remaining = billing.remainingBalance;
  const isLow = remaining !== null && remaining < 200;
  const isCritical = remaining !== null && remaining < 50;

  return (
    <div className="mt-2 pt-2 border-t border-border/50 space-y-1.5">
      {/* Payment method */}
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {getFundingIcon(billing.fundingSourceType)}
        <span>{billing.fundingSourceDisplay ?? getFundingLabel(billing.fundingSourceType)}</span>
      </div>

      {/* Balance (pre-paid only) */}
      {billing.isPrePaid && remaining !== null && (
        <div className={`flex items-center gap-1.5 text-xs font-medium ${isCritical ? "text-red-400" : isLow ? "text-yellow-400" : "text-green-400"}`}>
          {isCritical ? (
            <AlertTriangle className="w-3.5 h-3.5" />
          ) : isLow ? (
            <AlertTriangle className="w-3.5 h-3.5" />
          ) : (
            <CheckCircle2 className="w-3.5 h-3.5" />
          )}
          Saldo: {billing.currency} {remaining.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
          {isLow && <span className="text-xs font-normal text-muted-foreground ml-1">— Recarregue em breve</span>}
        </div>
      )}

      {/* Non-prepaid: show spend cap info */}
      {!billing.isPrePaid && billing.spendCap && (
        <div className="text-xs text-muted-foreground">
          Limite de gasto: {billing.currency}{" "}
          {(parseFloat(billing.spendCap) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function Connect() {
  const [token, setToken] = useState("");
  const [step, setStep] = useState<"token" | "confirm">("token");
  const [previewAccounts, setPreviewAccounts] = useState<
    Array<{ id: string; name: string; currency: string; timezone_name: string }>
  >([]);

  const utils = trpc.useUtils();
  const { data: connectedAccounts, isLoading } = trpc.accounts.list.useQuery();

  const validateToken = trpc.accounts.validateToken.useMutation({
    onSuccess: (data) => {
      setPreviewAccounts(data.adAccounts as any);
      setStep("confirm");
      toast.success(`Token válido! ${data.adAccounts.length} conta(s) encontrada(s) no portfólio.`);
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const connectAll = trpc.accounts.connectAll.useMutation({
    onSuccess: (data) => {
      utils.accounts.list.invalidate();
      setToken("");
      setStep("token");
      setPreviewAccounts([]);
      toast.success(`${data.connected} conta(s) conectada(s) com sucesso!`);
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const disconnectAccount = trpc.accounts.disconnect.useMutation({
    onSuccess: () => {
      utils.accounts.list.invalidate();
      toast.success("Conta desconectada.");
    },
  });

  return (
    <MetaDashboardLayout title="Gerenciar Contas Meta Ads">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-foreground">Conectar Portfólio Meta Ads</h1>
          <p className="text-muted-foreground mt-1">
            Cole o token do seu portfólio empresarial para importar todas as contas de uma vez. O token é salvo com segurança e você nunca precisará inseri-lo novamente.
          </p>
        </div>

        {/* How to get token */}
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Key className="w-4 h-4 text-primary" />
              Como obter seu Token de Acesso
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <div className="flex items-start gap-2">
              <span className="w-5 h-5 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center flex-shrink-0 mt-0.5">1</span>
              <p>
                Acesse o{" "}
                <a
                  href="https://developers.facebook.com/tools/explorer/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline inline-flex items-center gap-1"
                >
                  Meta Graph API Explorer <ExternalLink className="w-3 h-3" />
                </a>
              </p>
            </div>
            <div className="flex items-start gap-2">
              <span className="w-5 h-5 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center flex-shrink-0 mt-0.5">2</span>
              <p>
                Clique em "Generate Access Token" com as permissões:{" "}
                <code className="bg-muted px-1 rounded text-xs">ads_read</code>,{" "}
                <code className="bg-muted px-1 rounded text-xs">ads_management</code>,{" "}
                <code className="bg-muted px-1 rounded text-xs">business_management</code>
              </p>
            </div>
            <div className="flex items-start gap-2">
              <span className="w-5 h-5 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center flex-shrink-0 mt-0.5">3</span>
              <p>
                Para uso permanente, gere um <strong>System User Token</strong> no Business Manager (nunca expira).
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Connection form */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Link2 className="w-4 h-4 text-primary" />
              {step === "token" ? "Inserir Token de Acesso" : "Confirmar Importação"}
            </CardTitle>
            <CardDescription>
              {step === "token"
                ? "Cole o token do seu portfólio para importar todas as contas automaticamente"
                : `${previewAccounts.length} conta(s) encontrada(s) — clique em Importar para conectar todas`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {step === "token" ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="token">Token de Acesso</Label>
                  <Input
                    id="token"
                    type="password"
                    placeholder="EAAxxxxxxxxxxxxxxx..."
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    className="font-mono text-sm"
                  />
                </div>
                <Button
                  onClick={() => validateToken.mutate({ accessToken: token })}
                  disabled={!token || validateToken.isPending}
                  className="w-full gap-2"
                >
                  {validateToken.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Validando...
                    </>
                  ) : (
                    <>
                      Validar Token
                      <ChevronRight className="w-4 h-4" />
                    </>
                  )}
                </Button>
              </>
            ) : (
              <>
                {/* Preview of accounts to be imported */}
                <div className="space-y-2">
                  <Label>Contas que serão importadas</Label>
                  <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                    {previewAccounts.map((acc) => (
                      <div
                        key={acc.id}
                        className="flex items-center gap-3 p-3 rounded-lg border border-primary/20 bg-primary/5"
                      >
                        <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0" />
                        <div className="flex-1 text-left">
                          <p className="text-sm font-medium text-foreground">{acc.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {acc.id} · {acc.currency}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setStep("token");
                      setPreviewAccounts([]);
                    }}
                    className="flex-1"
                  >
                    Voltar
                  </Button>
                  <Button
                    onClick={() => connectAll.mutate({ accessToken: token })}
                    disabled={connectAll.isPending}
                    className="flex-1 gap-2"
                  >
                    {connectAll.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Importando...
                      </>
                    ) : (
                      <>
                        <Zap className="w-4 h-4" />
                        Importar {previewAccounts.length} conta(s)
                      </>
                    )}
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Connected accounts with billing info */}
        {connectedAccounts && connectedAccounts.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-400" />
                Contas Conectadas ({connectedAccounts.length})
              </CardTitle>
              <CardDescription className="text-xs">
                Selecione uma conta na sidebar para analisar. Saldo e forma de pagamento são exibidos abaixo.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {isLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Carregando contas...
                </div>
              ) : (
                connectedAccounts.map((acc) => (
                  <div
                    key={acc.id}
                    className="p-3 rounded-lg bg-accent/40 border border-border/50"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-foreground">{acc.accountName}</p>
                        <p className="text-xs text-muted-foreground">
                          ID: {acc.accountId} · {acc.currency}
                          {acc.lastSyncAt && (
                            <> · Sync: {new Date(acc.lastSyncAt).toLocaleDateString("pt-BR")}</>
                          )}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs text-green-400 border-green-400/30">
                          <CheckCircle2 className="w-3 h-3 mr-1" />
                          Ativa
                        </Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                          onClick={() => disconnectAccount.mutate({ accountId: acc.id })}
                          disabled={disconnectAccount.isPending}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                    {/* Billing info per account */}
                    <AccountBillingCard accountId={acc.id} />
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </MetaDashboardLayout>
  );
}
