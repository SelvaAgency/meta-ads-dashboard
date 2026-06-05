import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import { useEffect } from "react";
import { useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { ActiveAccountProvider } from "./contexts/ActiveAccountContext";
import Home from "./pages/Home";
import Dashboard from "./pages/Dashboard";
import Campaigns from "./pages/Campaigns";
import Suggestions from "./pages/Suggestions";
import Reports from "./pages/Reports";
import Connect from "./pages/Connect";
import AlertsPage from "./pages/AlertsPage";
import GoogleAds from "./pages/GoogleAds";
import SocialNetworks from "./pages/SocialNetworks";
import AccountSettings from "./pages/AccountSettings";

function RedirectTo({ to }: { to: string }) {
  const [, navigate] = useLocation();
  useEffect(() => { navigate(to, { replace: true }); }, []);
  return null;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/connect" component={Connect} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/campaigns" component={Campaigns} />
      <Route path="/alerts" component={AlertsPage} />
      <Route path="/suggestions" component={Suggestions} />
      <Route path="/reports" component={Reports} />
      <Route path="/google-ads" component={GoogleAds} />
      <Route path="/social-networks" component={SocialNetworks} />
      <Route path="/settings/accounts" component={AccountSettings} />
      {/* Redirects for removed nav items */}
      <Route path="/anomalies" component={() => <RedirectTo to="/alerts" />} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
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
