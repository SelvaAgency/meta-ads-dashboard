/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Selva Spaces — HubApp (roteador de apps integrados)
 * ─────────────────────────────────────────────────────────────────────────────
 *  Página única para TODAS as rotas de app integrado. Resolve o app pela rota
 *  via config central (integratedAppsConfig) e delega o render ao
 *  HubIntegratedApp.
 *
 *  `?rota=` — deep-link para uma rota interna do Tracker. Quem chega em
 *  /site?account=4 no topo é redirecionado para /tracker?rota=/site&account=4
 *  (ver trackerRoutes.ts) e é aqui que a rota volta a virar o src do iframe,
 *  com a query preservada. Sem isso, todo alerta abriria o Tracker genérico.
 *
 *  `?client=<slug>` — ajusta o título E é repassado ao iframe, que seleciona o
 *  cliente lá dentro. O iframe é outro documento: a URL é o único canal.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useLocation, useSearchParams } from "wouter";
import { HubShell } from "./HubShell";
import { HubIntegratedApp } from "./HubIntegratedApp";
import { integratedAppByRoute } from "./integratedAppsConfig";
import { trackerClientBySlug } from "./trackerConfig";
import { rotaInternaSegura, urlEmbutidaPara } from "./trackerRoutes";

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

  const busca = typeof window !== "undefined" ? window.location.search : "";
  let title = app.label;

  // Deep-link: /tracker?rota=/site&account=4 → iframe abre /site?account=4.
  // rotaInternaSegura recusa qualquer coisa fora da allowlist — o valor vira
  // src de iframe e não pode virar um site de terceiro.
  const rota = app.supportsClientFlyout ? rotaInternaSegura(searchParams.get("rota")) : null;
  // Sem `rota`, o iframe abre a própria rota do app. A query passa nos dois
  // casos — é por ela que `client` (flyout) e `account`/`aba` (alertas) entram.
  const src = urlEmbutidaPara(rota ?? app.route, busca);

  const client = app.supportsClientFlyout ? trackerClientBySlug(searchParams.get("client")) : undefined;
  if (client) title = `${app.label} · ${client.name}`;

  return <HubIntegratedApp title={title} src={src} />;
}
