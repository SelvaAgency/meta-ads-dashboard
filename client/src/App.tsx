import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, useRoute } from "wouter";
import Settings from "./pages/Settings";
import { useEffect } from "react";
import { useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { ActiveAccountProvider } from "./contexts/ActiveAccountContext";
import Dashboard from "./pages/Dashboard";
import Campaigns from "./pages/Campaigns";
import Suggestions from "./pages/Suggestions";
import SuggestionsHub from "./pages/SuggestionsHub";
import Reports from "./pages/Reports";
import Contracts from "./pages/Contracts";
import Finance from "./pages/Finance";
import Admin from "./pages/Admin";
import ReportView from "./pages/ReportView";

import AlertsPage from "./pages/AlertsPage";
import GoogleAds from "./pages/GoogleAds";
import SocialNetworks from "./pages/SocialNetworks";

import Experiments from "./pages/Experiments";
import ExperimentDetail from "./pages/ExperimentDetail";

// Selva Spaces — portal interno (raiz da aplicação). Ver client/src/pages/hub/.
import Hub from "./pages/hub/Hub";
import HubAccess from "./pages/hub/HubAccess";
import NotificacoesPage from "./pages/hub/NotificacoesPage";
import Site from "./pages/Site";
import Analytics from "@/pages/Analytics";
import Lojas from "@/pages/Lojas";
import Panorama from "@/pages/Panorama";
import HubApp from "./pages/hub/HubApp";
import HubSettings from "./pages/hub/HubSettings";
import PeoplePage from "./pages/hub/PeoplePage";
import ChangePassword from "./pages/hub/ChangePassword";
import TrelloCallback from "./pages/hub/TrelloCallback";
import SpacesPage from "./pages/hub/SpacesPage";
import { AdminOnly } from "./pages/hub/AdminOnly";
import { isEmbedded } from "./pages/hub/embed";
import { urlDoShellPara } from "./pages/hub/trackerRoutes";

function RedirectTo({ to }: { to: string }) {
  const [, navigate] = useLocation();
  useEffect(() => { navigate(to, { replace: true }); }, []);
  return null;
}

/**
 * Rota crua do Tracker. Dentro do iframe renderiza normalmente; no topo,
 * manda para o shell do Spaces levando a rota e a query junto — é o que impede
 * o Tracker de funcionar como app solto sem perder os deep-links de alerta.
 */
function Interna({ children }: { children: React.ReactNode }) {
  const [location, navigate] = useLocation();
  const embutido = isEmbedded();
  useEffect(() => {
    if (!embutido) navigate(urlDoShellPara(location, window.location.search), { replace: true });
  }, [embutido, location, navigate]);
  return embutido ? <>{children}</> : null;
}

// Rotas compartilhadas (mesmo deploy): no TOPO renderizam o Selva Spaces; dentro
// do iframe do Spaces renderizam a página crua do dashboard (ver embed.ts).
const Root = () => (isEmbedded() ? <SuggestionsHub /> : <Hub />);
const TrackerRoute = () => (isEmbedded() ? <SuggestionsHub /> : <HubApp />);
const ReportsRoute = () => (isEmbedded() ? <Reports /> : <HubApp />);
// Contratos e Financeiro = área Administrativa do Selva Spaces. Renderizam DIRETO
// no portal (HubShell dentro da própria página), igual à Colaboradores — nunca
// dentro do shell/iframe do Performance Tracker (HubApp).
const ContractsRoute = () => <AdminOnly><Contracts /></AdminOnly>;
const FinanceRoute = () => <AdminOnly><Finance /></AdminOnly>;
const SettingsRoute = () => (isEmbedded() ? <Settings /> : <HubSettings />);

function Router() {
  return (
    <Switch>
      {/* ── Selva Spaces — rotas diretas ─────────────────────────────────────── */}
      <Route path="/" component={Root} />
      <Route path="/tracker" component={TrackerRoute} />
      <Route path="/reports" component={ReportsRoute} />
      <Route path="/contracts" component={ContractsRoute} />
      <Route path="/finance" component={FinanceRoute} />
      <Route path="/settings" component={SettingsRoute} />
      <Route path="/access" component={HubAccess} />
      <Route path="/notificacoes" component={NotificacoesPage} />
      <Route path="/spaces" component={SpacesPage} />
      <Route path="/people" component={() => <AdminOnly><PeoplePage /></AdminOnly>} />
      <Route path="/change-password" component={ChangePassword} />
      <Route path="/trello/callback" component={TrelloCallback} />

      {/* ── Legado /hub → rotas diretas (compatibilidade) ────────────────────── */}
      <Route path="/hub" component={() => <RedirectTo to="/" />} />
      <Route path="/hub/tracker" component={() => <RedirectTo to="/tracker" />} />
      <Route path="/hub/reports" component={() => <RedirectTo to="/reports" />} />
      <Route path="/hub/contracts" component={() => <RedirectTo to="/contracts" />} />
      <Route path="/hub/settings" component={() => <RedirectTo to="/settings" />} />
      <Route path="/hub/acessos" component={() => <RedirectTo to="/access" />} />

      {/* ── Dashboard (Tracker) — rotas internas ──────────────────────────────
          Renderizam cru só dentro do iframe. No topo, <Interna> manda para o
          shell do Spaces preservando a query (ver trackerRoutes.ts).          */}
      <Route path="/overview" component={() => <Interna><SuggestionsHub /></Interna>} />
      <Route path="/panorama" component={() => <Interna><Panorama /></Interna>} />
      <Route path="/dashboard" component={() => <Interna><Dashboard /></Interna>} />
      <Route path="/campaigns" component={() => <Interna><Campaigns /></Interna>} />
      <Route path="/alerts" component={() => <Interna><AlertsPage /></Interna>} />
      <Route path="/ga4" component={() => <Interna><Analytics /></Interna>} />
      <Route path="/lojas" component={() => <Interna><Lojas /></Interna>} />
      <Route path="/site" component={() => <Interna><Site /></Interna>} />
      {/* Alertas antigos apontam para /clarity — preserva o destino deles. */}
      <Route path="/clarity" component={() => <Interna><Site /></Interna>} />
      <Route path="/suggestions" component={() => <Interna><Suggestions /></Interna>} />
      <Route path="/suggestions-hub" component={() => <RedirectTo to="/overview" />} />
      <Route path="/admin" component={() => <Interna><Admin /></Interna>} />
      <Route path="/google-ads" component={() => <Interna><GoogleAds /></Interna>} />
      <Route path="/social-networks" component={() => <Interna><SocialNetworks /></Interna>} />
      <Route path="/experiments" component={() => <Interna><Experiments /></Interna>} />
      <Route path="/experiments/:id" component={() => <Interna><ExperimentDetail /></Interna>} />
      {/* Redirects for removed nav items */}
      <Route path="/anomalies" component={() => <RedirectTo to="/alerts" />} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const [isReportRoute] = useRoute("/r/:token");

  if (isReportRoute) {
    return (
      <ErrorBoundary>
        <ReportView />
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <ActiveAccountProvider>
            <Toaster richColors theme="dark" />
            <Router />
          </ActiveAccountProvider>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
