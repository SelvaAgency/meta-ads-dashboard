import { MetaDashboardLayout } from "@/components/MetaDashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { AlertCircle, CheckCircle2, ChevronRight, ExternalLink, Key, Link2, Trash2, Zap } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export default function Connect() {
  const [token, setToken] = useState("");
  const [step, setStep] = useState<"token" | "select">("token");
  const [adAccounts, setAdAccounts] = useState<Array<{ id: string; name: string; currency: string; timezone_name: string }>>([]);
  const [selectedAccount, setSelectedAccount] = useState<string>("");

  const utils = trpc.useUtils();
  const { data: connectedAccounts, isLoading } = trpc.accounts.list.useQuery();

  const validateToken = trpc.accounts.validateToken.useMutation({
    onSuccess: (data) => {
      setAdAccounts(data.adAccounts as any);
      setStep("select");
      toast.success(`Token válido! ${data.adAccounts.length} conta(s) encontrada(s).`);
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const connectAccount = trpc.accounts.connect.useMutation({
    onSuccess: () => {
      utils.accounts.list.invalidate();
      setToken("");
      setStep("token");
      setAdAccounts([]);
      setSelectedAccount("");
      toast.success("Conta conectada com sucesso!");
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

  const handleConnect = () => {
    const acc = adAccounts.find((a) => a.id === selectedAccount);
    if (!acc) return;
    connectAccount.mutate({
      accessToken: token,
      accountId: acc.id.replace("act_", ""),
      accountName: acc.name,
      currency: acc.currency,
      timezone: acc.timezone_name,
    });
  };

  return (
    <MetaDashboardLayout title="Conectar Conta Meta Ads">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-foreground">Conectar Meta Ads</h1>
          <p className="text-muted-foreground mt-1">
            Vincule sua conta de anúncios para começar a análise automatizada.
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
              <p>Acesse o <a href="https://developers.facebook.com/tools/explorer/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">Meta Graph API Explorer <ExternalLink className="w-3 h-3" /></a></p>
            </div>
            <div className="flex items-start gap-2">
              <span className="w-5 h-5 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center flex-shrink-0 mt-0.5">2</span>
              <p>Clique em "Generate Access Token" e selecione as permissões: <code className="bg-muted px-1 rounded text-xs">ads_read</code>, <code className="bg-muted px-1 rounded text-xs">ads_management</code></p>
            </div>
            <div className="flex items-start gap-2">
              <span className="w-5 h-5 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center flex-shrink-0 mt-0.5">3</span>
              <p>Copie o token gerado e cole abaixo. Para uso contínuo, gere um token de longa duração.</p>
            </div>
          </CardContent>
        </Card>

        {/* Connection form */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Link2 className="w-4 h-4 text-primary" />
              {step === "token" ? "Inserir Token de Acesso" : "Selecionar Conta de Anúncios"}
            </CardTitle>
            <CardDescription>
              {step === "token"
                ? "Cole seu token de acesso do Meta Ads abaixo"
                : "Escolha qual conta de anúncios deseja conectar"}
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
                  {validateToken.isPending ? "Validando..." : "Validar Token"}
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </>
            ) : (
              <>
                <div className="space-y-2">
                  <Label>Contas disponíveis</Label>
                  <div className="space-y-2">
                    {adAccounts.map((acc) => (
                      <button
                        key={acc.id}
                        onClick={() => setSelectedAccount(acc.id)}
                        className={`w-full flex items-center justify-between p-3 rounded-lg border transition-all ${
                          selectedAccount === acc.id
                            ? "border-primary bg-primary/10"
                            : "border-border hover:border-primary/50 hover:bg-accent"
                        }`}
                      >
                        <div className="text-left">
                          <p className="text-sm font-medium text-foreground">{acc.name}</p>
                          <p className="text-xs text-muted-foreground">{acc.id} · {acc.currency}</p>
                        </div>
                        {selectedAccount === acc.id && (
                          <CheckCircle2 className="w-4 h-4 text-primary" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setStep("token")} className="flex-1">
                    Voltar
                  </Button>
                  <Button
                    onClick={handleConnect}
                    disabled={!selectedAccount || connectAccount.isPending}
                    className="flex-1 gap-2"
                  >
                    {connectAccount.isPending ? "Conectando..." : "Conectar Conta"}
                    <Zap className="w-4 h-4" />
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Connected accounts */}
        {connectedAccounts && connectedAccounts.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Contas Conectadas</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {connectedAccounts.map((acc) => (
                <div
                  key={acc.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-accent/50"
                >
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
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </MetaDashboardLayout>
  );
}
