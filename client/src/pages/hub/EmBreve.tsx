/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Spaces — estado "Em breve" (camada de UI)
 * ─────────────────────────────────────────────────────────────────────────────
 *  Para páginas do portal (dentro do HubShell) ainda não liberadas ao
 *  colaborador. Diferente do "Sem acesso": aqui a mensagem é de recurso a
 *  caminho, não de área restrita. Admin/dev seguem vendo a tela real; o
 *  colaborador vê este estado e as queries da página ficam desligadas.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { Clock } from "lucide-react";
import { HubShell } from "./HubShell";

export function EmBreve({ titulo, descricao }: { titulo: string; descricao?: string }) {
  return (
    <HubShell>
      <main className="flex-1 flex items-center justify-center p-6">
        <div className="max-w-sm w-full text-center">
          <span className="w-12 h-12 rounded-2xl bg-primary/15 text-accent flex items-center justify-center mx-auto mb-4">
            <Clock className="w-6 h-6" />
          </span>
          <h1 className="text-lg font-bold">{titulo}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {descricao ?? "Este recurso estará disponível em breve."}
          </p>
        </div>
      </main>
    </HubShell>
  );
}
