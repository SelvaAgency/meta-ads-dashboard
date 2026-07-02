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
import HubApp from "./pages/hub/HubApp";
import HubSettings from "./pages/hub/HubSettings";

function RedirectTo({ to }: { to: string }) {
  const [, navigate] = useLocation();
  useEffect(() => { navigate(to, { replace: true }); }, []);
  return null;
}

function Router() {
  return (
    <Switch>
      {/* Raiz = Selva Spaces Home. A Visão Geral do Tracker vive em /overview. */}
      <Route path="/" component={Hub} />
      <Route path="/overview" component={SuggestionsHub} />

      <Route path="/dashboard" component={Dashboard} />
      <Route path="/campaigns" component={Campaigns} />
      <Route path="/alerts" component={AlertsPage} />
      <Route path="/suggestions" component={Suggestions} />
      <Route path="/suggestions-hub" component={() => <RedirectTo to="/overview" />} />
      <Route path="/reports" component={Reports} />
      <Route path="/contracts" component={Contracts} />
      <Route path="/admin" component={Admin} />
      <Route path="/google-ads" component={GoogleAds} />
      <Route path="/social-networks" component={SocialNetworks} />
      <Route path="/settings" component={Settings} />
      <Route path="/experiments" component={Experiments} />
      <Route path="/experiments/:id" component={ExperimentDetail} />
      {/* Selva Spaces — /hub mantido como alias da raiz */}
      <Route path="/hub" component={Hub} />
      <Route path="/hub/settings" component={HubSettings} />
      <Route path="/hub/acessos" component={HubAccess} />
      <Route path="/hub/tracker" component={HubApp} />
      <Route path="/hub/reports" component={HubApp} />
      <Route path="/hub/contracts" component={HubApp} />
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
