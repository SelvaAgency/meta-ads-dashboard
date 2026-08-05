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
import MeusReembolsos from "./pages/MeusReembolsos";
import { useAuth } from "@/_core/hooks/useAuth";
import { canAccessAdmin } from "@shared/permissions";
import Admin from "./pages/Admin";
import ReportView from "./pages/ReportView";

import SocialNetworks from "./pages/SocialNetworks";

import Experiments from "./pages/Experiments";
import ExperimentDetail from "./pages/ExperimentDetail";

// Selva Spaces — portal interno (raiz da aplicação). Ver client/src/pages/hub/.
import Hub from "./pages/hub/Hub";
import HubAccess from "./pages/hub/HubAccess";
import NotificacoesPage from "./pages/hub/NotificacoesPage";
import Site from "./pages/Site";
import Panorama from "@/pages/Panorama";
import HubApp from "./pages/hub/HubApp";
import HubSettings from "./pages/hub/HubSettings";
import PeoplePage from "./pages/hub/PeoplePage";
import JornalzinhoPreview from "./pages/hub/JornalzinhoPreview";
import ChangePassword from "./pages/hub/ChangePassword";
import TrelloCallback from "./pages/hub/TrelloCallback";
import { AdminOnly, AdminOuDevOnly } from "./pages/hub/AdminOnly";
import { isEmbedded } from "./pages/hub/embed";
import { urlDoShellPara, destinoDeConexoes } from "./pages/hub/trackerRoutes";

function RedirectTo({ to }: { to: string }) {
  const [, navigate] = useLocation();
  useEffect(() => { navigate(to, { replace: true }); }, []);
  return null;
}

/**
 * As páginas soltas de Google Ads, Google Analytics e Lojas foram absorvidas
 * pelo hub de Conexões (dentro de Configurações do Tracker). As rotas antigas
 * continuam existindo — e não morrem em 404 — porque duas coisas ainda apontam
 * para elas: deep-links salvos por quem usava o menu antigo, e o retorno do
 * OAuth do Google (`/tracker?rota=/ga4`). Todas caem em Conexões.
 *
 * O destino depende de onde a rota foi aberta: dentro do iframe basta navegar;
 * no topo é preciso passar pelo shell do Spaces, senão /settings renderiza as
 * configurações do PORTAL, que não é onde Conexões mora.
 */
function ParaConexoes() {
  const [, navigate] = useLocation();
  useEffect(() => {
    navigate(destinoDeConexoes(window.location.search, isEmbedded()), { replace: true });
  }, []);
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
/**
 * /finance leva cada um ao que pode ver: admin abre o financeiro completo;
 * colaborador cai na própria página de reembolsos. Um item só no menu, e
 * ninguém leva "Sem acesso" na cara ao clicar em Financeiro.
 *
 * Isto é roteamento, não segurança: o financeiro inteiro é adminProcedure no
 * servidor, e as procedures de reembolso derivam o dono da sessão.
 */
const FinanceRoute = () => {
  const { user } = useAuth();
  return canAccessAdmin(user?.role) ? <Finance /> : <MeusReembolsos />;
};
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
      <Route path="/people" component={() => <AdminOnly><PeoplePage /></AdminOnly>} />
      {/* Prévia do Jornalzinho — admin/dev. O developer precisa conferir o
          e-mail dele e o do colaborador; a visão ADMIN (que carrega o
          financeiro) é barrada na procedure, não aqui. Leitura pura: não envia
          nem consome dedup. */}
      <Route path="/jornalzinho" component={() => <AdminOuDevOnly><JornalzinhoPreview /></AdminOuDevOnly>} />
      <Route path="/change-password" component={ChangePassword} />
      <Route path="/trello/callback" component={TrelloCallback} />

      {/* ── Legado /hub → rotas diretas (compatibilidade) ────────────────────── */}
      {/*
        `/connect` nunca foi registrada, e três botões "Conectar conta"
        (Dashboard ×2, Campanhas ×1) navegavam para ela — caindo no 404. Não era
        permissão: o caminho de adicionar conta estava QUEBRADO para todo mundo,
        admin inclusive.

        A rota vira redirecionamento em vez de sumir porque link morto também
        mora em favorito e em print de instrução. `?painel=conexoes` abre o hub
        de Conexões já expandido, que é onde o token da agência entra.
      */}
      <Route path="/connect" component={() => <RedirectTo to="/settings?painel=conexoes" />} />
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
      {/* /alerts aposentada — a caixa única é /notificacoes (renderiza no shell
          do Tracker quando embutida). Redireciona preservando compatibilidade. */}
      <Route path="/alerts" component={() => <RedirectTo to="/notificacoes" />} />
      <Route path="/site" component={() => <Interna><Site /></Interna>} />
      {/* Alertas antigos apontam para /clarity — preserva o destino deles. */}
      <Route path="/clarity" component={() => <Interna><Site /></Interna>} />
      <Route path="/suggestions" component={() => <Interna><Suggestions /></Interna>} />
      <Route path="/suggestions-hub" component={() => <RedirectTo to="/overview" />} />
      <Route path="/admin" component={() => <Interna><Admin /></Interna>} />
      <Route path="/social-networks" component={() => <Interna><SocialNetworks /></Interna>} />
      <Route path="/experiments" component={() => <Interna><Experiments /></Interna>} />
      <Route path="/experiments/:id" component={() => <Interna><ExperimentDetail /></Interna>} />

      {/* ── Páginas de conexão aposentadas → hub de Conexões ─────────────────
          Google Ads, Google Analytics e Lojas saíram do menu: o que elas
          faziam agora vive em Conexões. As rotas ficam só para não quebrar
          link antigo nem o retorno do OAuth do Google. */}
      <Route path="/conexoes" component={ParaConexoes} />
      <Route path="/google-ads" component={ParaConexoes} />
      <Route path="/ga4" component={ParaConexoes} />
      <Route path="/lojas" component={ParaConexoes} />

      {/* Redirects for removed nav items */}
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
