import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import {
  BarChart3,
  Bell,
  Brain,
  ChevronRight,
  FileText,
  Lightbulb,
  Shield,
  TrendingUp,
  Zap,
} from "lucide-react";
import { useEffect } from "react";

export default function Home() {
  const { isAuthenticated, loading } = useAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!loading && isAuthenticated) {
      navigate("/dashboard");
    }
  }, [isAuthenticated, loading, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  const features = [
    {
      icon: BarChart3,
      title: "Dashboard Interativo",
      description: "Visualize ROAS, CPA, CTR e conversões em tempo real com gráficos de tendências.",
    },
    {
      icon: Bell,
      title: "Detecção de Anomalias",
      description: "Alertas automáticos para quedas de ROAS, picos de CPA e mudanças de entrega.",
    },
    {
      icon: Brain,
      title: "Diagnóstico com IA",
      description: "Identifica fadiga de criativos, segmentação ruim e campanhas underperformers.",
    },
    {
      icon: Lightbulb,
      title: "Sugestões de Melhoria",
      description: "Recomendações práticas e acionáveis geradas por IA com base nos seus dados.",
    },
    {
      icon: FileText,
      title: "Relatórios Automatizados",
      description: "Resumos diários e semanais de performance entregues automaticamente.",
    },
    {
      icon: Shield,
      title: "Dados Seguros",
      description: "Tokens de acesso armazenados com segurança, sem modificações em campanhas.",
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
            <Zap className="w-4 h-4 text-primary" />
          </div>
          <span className="font-semibold text-foreground">Meta Ads Intelligence</span>
        </div>
        <Button size="sm" onClick={() => (window.location.href = getLoginUrl())}>
          Entrar
        </Button>
      </header>

      {/* Hero */}
      <section className="max-w-5xl mx-auto px-6 pt-24 pb-16 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-medium mb-8">
          <Zap className="w-3 h-3" />
          Powered by AI — Meta Ads Analytics
        </div>

        <h1 className="text-5xl font-bold text-foreground mb-6 leading-tight">
          Análise inteligente das suas
          <br />
          <span className="text-primary">campanhas Meta Ads</span>
        </h1>

        <p className="text-lg text-muted-foreground mb-10 max-w-2xl mx-auto">
          Monitore performance, detecte anomalias e receba sugestões de melhoria geradas por IA —
          tudo automaticamente, sem precisar navegar por múltiplos dashboards.
        </p>

        <div className="flex items-center justify-center gap-4">
          <Button size="lg" onClick={() => (window.location.href = getLoginUrl())} className="gap-2">
            Começar agora
            <ChevronRight className="w-4 h-4" />
          </Button>
          <Button size="lg" variant="outline" onClick={() => (window.location.href = getLoginUrl())}>
            Ver demonstração
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-8 mt-20 max-w-2xl mx-auto">
          {[
            { value: "10+", label: "Métricas monitoradas" },
            { value: "24/7", label: "Detecção de anomalias" },
            { value: "IA", label: "Sugestões inteligentes" },
          ].map((stat) => (
            <div key={stat.label} className="text-center">
              <p className="text-3xl font-bold text-primary mb-1">{stat.value}</p>
              <p className="text-sm text-muted-foreground">{stat.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="max-w-5xl mx-auto px-6 pb-24">
        <h2 className="text-2xl font-bold text-foreground text-center mb-12">
          Tudo que você precisa para otimizar campanhas
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <div
                key={feature.title}
                className="p-6 rounded-xl bg-card border border-border hover:border-primary/30 transition-all duration-200 hover:shadow-lg hover:shadow-primary/5"
              >
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                  <Icon className="w-5 h-5 text-primary" />
                </div>
                <h3 className="font-semibold text-foreground mb-2">{feature.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-border py-16 text-center px-6">
        <h2 className="text-2xl font-bold text-foreground mb-4">
          Pronto para otimizar suas campanhas?
        </h2>
        <p className="text-muted-foreground mb-8">
          Conecte sua conta Meta Ads e comece a receber insights em minutos.
        </p>
        <Button size="lg" onClick={() => (window.location.href = getLoginUrl())} className="gap-2">
          Começar gratuitamente
          <ChevronRight className="w-4 h-4" />
        </Button>
      </section>
    </div>
  );
}
