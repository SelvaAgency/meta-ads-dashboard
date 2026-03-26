import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { ActiveAccountProvider } from "./contexts/ActiveAccountContext";
import Home from "./pages/Home";
import Dashboard from "./pages/Dashboard";
import Campaigns from "./pages/Campaigns";
import Anomalies from "./pages/Anomalies";
import Suggestions from "./pages/Suggestions";
import Reports from "./pages/Reports";
import Connect from "./pages/Connect";
import AlertsPage from "./pages/AlertsPage";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/connect" component={Connect} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/campaigns" component={Campaigns} />
      <Route path="/anomalies" component={Anomalies} />
      <Route path="/suggestions" component={Suggestions} />
      <Route path="/reports" component={Reports} />
      <Route path="/alerts" component={AlertsPage} />
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
