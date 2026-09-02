import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import RedesSociais from "@/pages/RedesSociais";
import Rascunho from "@/pages/Rascunho";
import ConsumoIA from "@/pages/ConsumoIA";
import LinkedinLab from "@/pages/LinkedinLab";
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


import Experiments from "./pages/Experiments";
import ExperimentDetail from "./pages/ExperimentDetail";

// Selva Spaces — portal interno (raiz da aplicação). Ver client/src/pages/hub/.
import Hub from "./pages/hub/Hub";
import HubAccess from "./pages/hub/HubAccess";
import NotificacoesPage from "./pages/hub/NotificacoesPage";
import OnboardingPage from "./pages/Onboarding";
import Site from "./pages/Site";
import Panorama from "@/pages/Panorama";
import HubApp from "./pages/hub/HubApp";
import HubSettings from "./pages/hub/HubSettings";
import PeoplePage from "./pages/hub/PeoplePage";
import JornalzinhoPreview from "./pages/hub/JornalzinhoPreview";
import ChangePassword from "./pages/hub/ChangePassword";
import TrelloCallback from "./pages/hub/TrelloCallback";
import { AdminOnly, AdminOuDevOnly, LaboratorioOnly } from "./pages/hub/AdminOnly";
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
      {/* A própria página decide o que mostrar: a trilha de quem entra, ou o
          acompanhamento para o administrativo. Sem trilha e sem papel, é um
          aviso — e não um 404, que faria parecer erro. */}
      <Route path="/onboarding" component={OnboardingPage} />
      <Route path="/people" component={() => <AdminOnly><PeoplePage /></AdminOnly>} />
      {/* Prévia do Jornalzinho — admin/dev. O developer precisa conferir o
          e-mail dele e o do colaborador; a visão ADMIN (que carrega o
          financeiro) é barrada na procedure, não aqui. Leitura pura: não envia
          nem consome dedup. */}
      <Route path="/jornalzinho" component={() => <AdminOuDevOnly><JornalzinhoPreview /></AdminOuDevOnly>} />
      {/*
        `/consumo-ia` — rota de PRIMEIRO NÍVEL, ao lado de Colaboradores.

        ── Por que ela não é `Interna` ──────────────────────────────────────
        `Interna` é para página do Tracker: no topo ela redireciona para
        `/tracker?rota=…` e só renderiza dentro do iframe. Consumo de IA nasceu
        assim e herdou a URL `/tracker?rota=%2Fconsumo-ia`, mas ela não é
        análise de cliente — não tem conta ativa, não usa seletor de cliente, e
        fala do gasto do próprio Spaces. É irmã de Colaboradores, Contratos e
        Financeiro, que renderizam direto no portal.

        A permissão é a mesma de antes: `AdminOuDevOnly` usa `canManageContent`,
        que é o que a `contentProcedure` exige no servidor. A guarda de rota
        troca de lugar; ela não afrouxa.
      */}
      <Route path="/consumo-ia" component={() => <AdminOuDevOnly><ConsumoIA /></AdminOuDevOnly>} />

      {/*
        `/linkedin-lab` — bancada interna da Fase 1 do LinkedIn.

        Primeiro nível, ao lado de `/consumo-ia` e pelo mesmo motivo: não é
        página do Tracker, não tem conta ativa e não usa o seletor de cliente do
        BIT. Fora de `ROTAS_INTERNAS` — entrar naquela lista faria a rota
        redirecionar para o shell e abrir como `/tracker?rota=%2Flinkedin-lab`.

        Invisível para colaborador: não está em menu nenhum, e o link direto
        para em `LaboratorioOnly`. A proteção real é `laboratorioProcedure`.
      */}
      <Route path="/linkedin-lab" component={() => <LaboratorioOnly><LinkedinLab /></LaboratorioOnly>} />
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
      {/*
        `/social-networks` voltou a ser página, e não mais redirecionamento.

        Ela morreu junto com o router `socialNetworks` porque lia o Instagram com
        `accounts[0].accessToken` — o token de mídia de uma conta arbitrária — e
        misturava número de campanha com número de perfil sob o mesmo rótulo.
        Renasce sobre a porta `FonteInstagram`, com orgânico e pago em blocos
        separados, e restrita a admin/dev enquanto a frente está em teste.

        O caminho antigo continua valendo: era ele que estava nos favoritos.
      */}
      <Route path="/social-networks" component={() => <Interna><RedesSociais /></Interna>} />
      <Route path="/redes-sociais" component={() => <RedirectTo to="/social-networks" />} />
      {/*
        `/rascunho` — a bancada de peças fora de produção.

        Aberta a todos os papéis, e de propósito: quem trabalha nas telas precisa
        alcançá-la, e o pedido era não POLUIR a navegação, não esconder o
        conteúdo. Por isso ela existe como ROTA e não como item de menu — o
        atalho fica em Configurações, para admin e dev.

        Nada aqui é ambiente de teste de dado: as peças leem as mesmas consultas
        da produção. Um rascunho alimentado por número fictício não ensina nada
        sobre como a peça se comporta.
      */}
      <Route path="/rascunho" component={() => <Interna><Rascunho /></Interna>} />
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
