/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Selva Spaces — HubApp (roteador de apps integrados)
 * ─────────────────────────────────────────────────────────────────────────────
 *  Página única para TODAS as rotas de app integrado (/hub/tracker,
 *  /hub/reports, /hub/contracts). Resolve o app pela rota via config central
 *  (integratedAppsConfig) e delega o render ao HubIntegratedApp.
 *
 *  Tracker (supportsClientFlyout): se vier `?client=<slug>`, ajusta o TÍTULO
 *  para dar contexto visual. O iframe, porém, segue carregando o Tracker GERAL
 *  até existir um entrypoint real por cliente no app (o Tracker seleciona
 *  cliente por id numérico interno, não por URL). Ver trackerConfig →
 *  TODO url-por-cliente.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useLocation, useSearchParams } from "wouter";
import { HubShell } from "./HubShell";
import { HubIntegratedApp } from "./HubIntegratedApp";
import { integratedAppByRoute } from "./integratedAppsConfig";
import { trackerClientBySlug, trackerUrlForClient } from "./trackerConfig";

export default function HubApp() {
  const [location] = useLocation();
  const [searchParams] = useSearchParams();
  const app = integratedAppByRoute(location);

  // Guarda defensiva — rota registrada mas sem app correspondente na config.
  if (!app) {
    return (
      <HubShell>
        <main className="flex-1 flex items-center justify-center p-6 text-sm text-muted-foreground">
          App não encontrado.
        </main>
      </HubShell>
    );
  }

  let title = app.label;
  let src = app.externalUrl;

  // Contexto visual por cliente (apenas título; iframe segue no app geral).
  if (app.supportsClientFlyout) {
    const client = trackerClientBySlug(searchParams.get("client"));
    if (client) {
      title = `${app.label} · ${client.name}`;
      src = trackerUrlForClient(client.slug);
    }
  }

  return <HubIntegratedApp title={title} src={src} externalUrl={app.externalUrl} />;
}
