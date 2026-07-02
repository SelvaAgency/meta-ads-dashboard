/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Selva Spaces — ACESSOS (placeholder · rota /hub/acessos)
 * ─────────────────────────────────────────────────────────────────────────────
 *  PLACEHOLDER da futura área privada de credenciais de clientes.
 *
 *  ⚠️  Segurança — o que esta página NÃO faz (de propósito):
 *      · Não exibe nenhum acesso, senha, token, e-mail ou dado sensível.
 *      · Não usa mocks com dados reais.
 *      · Não embute nem busca conteúdo de Google Docs.
 *      · Não expõe nada em rota pública/GitHub Pages.
 *
 *  O gate por role abaixo é apenas UX (não há dado a proteger ainda). Quando a
 *  área real for construída, as credenciais devem vir do servidor com
 *  autorização enforced no backend — nunca embutidas no frontend.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { KeyRound, Lock, ShieldCheck } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { HubShell } from "./HubShell";
import { canViewAccess } from "./hubMocks";

export default function HubAccess() {
  const { user } = useAuth();
  const authorized = canViewAccess(user);

  return (
    <HubShell>
      <main className="flex-1 overflow-auto p-6 md:p-8">
        <div className="max-w-3xl mx-auto flex flex-col gap-6">
          <header className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-xl bg-primary/20 text-accent flex items-center justify-center flex-shrink-0">
              <KeyRound className="w-5 h-5" />
            </span>
            <div>
              <h1 className="text-2xl font-bold">Acessos</h1>
              <p className="text-sm text-muted-foreground">Área restrita · credenciais de clientes</p>
            </div>
          </header>

          {authorized ? (
            <Card className="gap-4 py-6">
              <div className="px-6 flex items-center gap-2.5">
                <ShieldCheck className="w-5 h-5 text-accent flex-shrink-0" />
                <h2 className="text-sm font-semibold">Em construção</h2>
              </div>
              <div className="px-6 text-sm text-muted-foreground leading-relaxed space-y-3">
                <p>
                  Esta será a área privada para armazenar os <strong>acessos dos clientes</strong>
                  {" "}(logins, plataformas, credenciais), visível apenas para papéis autorizados.
                </p>
                <p>
                  Por segurança, nenhum dado real é exibido aqui ainda. A implementação final vai
                  buscar os dados do servidor, com permissão validada no backend e sem depender de
                  documentos publicados na web.
                </p>
                <div className="rounded-lg border border-border bg-secondary/50 p-3 text-xs">
                  Placeholder seguro — sem senhas, tokens, e-mails ou qualquer dado sensível.
                </div>
              </div>
            </Card>
          ) : (
            <Card className="gap-4 py-6">
              <div className="px-6 flex items-center gap-3">
                <span className="w-9 h-9 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                  <Lock className="w-4 h-4 text-muted-foreground" />
                </span>
                <div>
                  <p className="text-sm font-semibold">Acesso restrito</p>
                  <p className="text-xs text-muted-foreground">
                    Esta área será liberada apenas para papéis autorizados.
                  </p>
                </div>
              </div>
            </Card>
          )}
        </div>
      </main>
    </HubShell>
  );
}
