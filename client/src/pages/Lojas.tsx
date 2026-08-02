import { MetaDashboardLayout } from "@/components/MetaDashboardLayout";
import { Link } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { canManageContent } from "@shared/permissions";
import { Store, Cable, ArrowRight } from "lucide-react";

/**
 * A gestão de lojas (conectar/editar/testar/sincronizar conexões de e-commerce)
 * migrou para o hub único de Conexões, em Configurações. Esta página virou um
 * atalho.
 */
export default function Lojas() {
  const { user } = useAuth();
  const podeGerenciar = canManageContent(user?.role);

  return (
    <MetaDashboardLayout title="Lojas">
      <div className="p-6">
        <div className="bg-card border border-border rounded-xl p-8 text-center max-w-lg mx-auto">
          <Store className="w-8 h-8 mx-auto text-muted-foreground/40 mb-3" />
          <h2 className="text-sm font-bold text-foreground">Conexões de lojas</h2>
          <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
            {podeGerenciar
              ? "Conectar, editar, testar e sincronizar lojas de e-commerce (WooCommerce, VNDA/Olist) agora fica no hub único de Conexões, em Configurações."
              : "A conexão de lojas é de administradores e desenvolvedores."}
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
