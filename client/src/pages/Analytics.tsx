import { MetaDashboardLayout } from "@/components/MetaDashboardLayout";
import { Link } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { canManageContent } from "@shared/permissions";
import { BarChart3, Cable, ArrowRight } from "lucide-react";

/**
 * A gestão do Google Analytics (conectar OAuth, descobrir e vincular propriedades)
 * migrou para o hub único de Conexões, em Configurações. Esta página virou um
 * atalho — os dados das propriedades já vinculadas aparecem na seção Site de cada
 * cliente, como sempre.
 */
export default function Analytics() {
  const { user } = useAuth();
  const podeGerenciar = canManageContent(user?.role);

  return (
    <MetaDashboardLayout title="Google Analytics">
      <div className="p-6">
        <div className="bg-card border border-border rounded-xl p-8 text-center max-w-lg mx-auto">
          <BarChart3 className="w-8 h-8 mx-auto text-muted-foreground/40 mb-3" />
          <h2 className="text-sm font-bold text-foreground">Gestão do Google Analytics</h2>
          <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
            {podeGerenciar
              ? "Conectar a agência, descobrir e vincular propriedades agora fica no hub único de Conexões, em Configurações. Os dados de cada propriedade vinculada aparecem na seção Site do cliente."
              : "A gestão é de administradores e desenvolvedores. Os dados das propriedades já vinculadas aparecem na seção Site de cada cliente."}
          </p>
          {podeGerenciar && (
            <Link href="/settings"
              className="inline-flex h-9 px-4 mt-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium items-center gap-1.5">
              <Cable className="w-4 h-4" /> Ir para Conexões <ArrowRight className="w-4 h-4" />
            </Link>
          )}
        </div>
      </div>
    </MetaDashboardLayout>
  );
}
