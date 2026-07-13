import { MetaDashboardLayout } from "@/components/MetaDashboardLayout";
import { useAuth } from "@/_core/hooks/useAuth";
import { ShieldCheck, FileSignature, Wallet } from "lucide-react";
import { Link } from "wouter";

export default function Admin() {
  const { user } = useAuth();
  if ((user as any)?.role !== "admin") return null;

  return (
    <MetaDashboardLayout>
      <div className="max-w-2xl mx-auto py-6 space-y-6">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <ShieldCheck className="w-5 h-5" /> Administrativo
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Ferramentas restritas aos administradores da SELVA.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-3">
          <Link href="/contracts">
            <div className="flex items-center gap-4 p-4 rounded-xl border border-border hover:border-primary/50 hover:bg-muted/30 transition-all cursor-pointer">
              <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                <FileSignature className="w-5 h-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium">Contratos PJ</p>
                <p className="text-xs text-muted-foreground">Gerar contratos de prestacao de servicos</p>
              </div>
            </div>
          </Link>
          <Link href="/finance">
            <div className="flex items-center gap-4 p-4 rounded-xl border border-border hover:border-primary/50 hover:bg-muted/30 transition-all cursor-pointer">
              <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                <Wallet className="w-5 h-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium">Controle Financeiro</p>
                <p className="text-xs text-muted-foreground">P&amp;L, reembolsos e reconciliação Gui &amp; SELVA</p>
              </div>
            </div>
          </Link>
        </div>
      </div>
    </MetaDashboardLayout>
  );
}
