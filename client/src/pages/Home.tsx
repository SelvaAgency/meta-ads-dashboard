import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { useLocation } from "wouter";
import { useEffect } from "react";
import {
  Brain, BarChart3, Bell, Zap, FlaskConical, FileText, Bolt,
} from "lucide-react";

export default function Home() {
  const { isAuthenticated, loading } = useAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!loading && isAuthenticated) navigate("/dashboard");
  }, [isAuthenticated, loading, navigate]);

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--color-background-tertiary)" }}>
        <div style={{ width: 32, height: 32, borderRadius: "50%", border: "2px solid #D4537E", borderTopColor: "transparent", animation: "spin 0.8s linear infinite" }} />
      </div>
    );
  }

  const features = [
    { icon: BarChart3, title: "Dashboard por conta", desc: "ROAS, CPA, CTR e conversões em tempo real. Filtros por período e visão consolidada do portfólio." },
    { icon: Zap, title: "Plano de ação", desc: "Sugestões P1/P2/P3 geradas pela IA com base nos dados reais. Chat com contexto completo de cada conta." },
    { icon: Bell, title: "Anomalias e alertas", desc: "Detecção automática de quedas de ROAS, picos de CPA e tokens expirados. Notificações em tempo real." },
    { icon: Brain, title: "Memória da IA", desc: "Contexto por conta e por agência. A IA aprende com cada ação aplicada e melhora continuamente." },
    { icon: FlaskConical, title: "Experimentos", desc: "Crie e acompanhe testes A/B com checkpoints, hipóteses e decisões documentadas." },
    { icon: FileText, title: "Relatórios automáticos", desc: "Briefings diários e relatórios semanais gerados pela IA e entregues por email." },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "var(--color-background-tertiary)", fontFamily: "var(--font-sans)" }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* Header */}
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 32px", borderBottom: "0.5px solid rgba(0,0,0,0.08)", background: "var(--color-background-primary)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: "#D4537E", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Brain style={{ width: 16, height: 16, color: "white" }} />
          </div>
          <div>
            <p style={{ fontSize: 15, fontWeight: 500, color: "var(--color-text-primary)", lineHeight: 1.2 }}>BIT</p>
            <p style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>Brand Intelligence Tracker</p>
          </div>
        </div>
        <button
          onClick={() => window.location.href = getLoginUrl()}
          style={{ padding: "7px 18px", borderRadius: 8, border: "0.5px solid rgba(0,0,0,0.15)", background: "white", fontSize: 13, cursor: "pointer", color: "var(--color-text-primary)" }}
        >
          Entrar
        </button>
      </header>

      {/* Hero */}
      <section style={{ maxWidth: 640, margin: "0 auto", padding: "64px 32px 48px", textAlign: "center" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 12px", borderRadius: 20, background: "#FBEAF0", border: "0.5px solid #ED93B1", color: "#993556", fontSize: 11, fontWeight: 500, marginBottom: 24 }}>
          <Zap style={{ width: 11, height: 11 }} />
          Powered by SELVA Agency
        </div>
        <h1 style={{ fontSize: 36, fontWeight: 500, color: "var(--color-text-primary)", lineHeight: 1.2, marginBottom: 16 }}>
          Inteligência de mídia<br />
          <span style={{ color: "#D4537E" }}>para quem opera de verdade</span>
        </h1>
        <p style={{ fontSize: 14, color: "var(--color-text-secondary)", lineHeight: 1.7, marginBottom: 32, maxWidth: 480, marginLeft: "auto", marginRight: "auto" }}>
          Dashboard interno da SELVA para monitorar, analisar e otimizar campanhas Meta Ads com IA — de todas as contas, em um só lugar.
        </p>
        <button
          onClick={() => window.location.href = getLoginUrl()}
          style={{ padding: "10px 28px", borderRadius: 8, border: "none", background: "#D4537E", fontSize: 14, cursor: "pointer", color: "#FBEAF0", fontWeight: 500, marginBottom: 48 }}
        >
          Acessar o BIT
        </button>

        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16, maxWidth: 480, margin: "0 auto 64px" }}>
          {[
            { val: "11", label: "contas ativas" },
            { val: "IA", label: "análises em tempo real" },
            { val: "24h", label: "monitoramento contínuo" },
          ].map(({ val, label }) => (
            <div key={label} style={{ background: "var(--color-background-secondary)", borderRadius: 8, padding: 16, textAlign: "center" }}>
              <p style={{ fontSize: 24, fontWeight: 500, color: "#D4537E", marginBottom: 4 }}>{val}</p>
              <p style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>{label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, padding: "0 32px 48px", maxWidth: 900, margin: "0 auto" }}>
        {features.map(({ icon: Icon, title, desc }) => (
          <div key={title} style={{ background: "var(--color-background-primary)", border: "0.5px solid rgba(0,0,0,0.08)", borderRadius: 12, padding: 16 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: "#FBEAF0", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
              <Icon style={{ width: 16, height: 16, color: "#D4537E" }} />
            </div>
            <p style={{ fontSize: 13, fontWeight: 500, color: "var(--color-text-primary)", marginBottom: 6 }}>{title}</p>
            <p style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.6 }}>{desc}</p>
          </div>
        ))}
      </section>

      {/* CTA */}
      <section style={{ borderTop: "0.5px solid rgba(0,0,0,0.08)", padding: "40px 32px", textAlign: "center", background: "var(--color-background-primary)" }}>
        <h2 style={{ fontSize: 20, fontWeight: 500, color: "var(--color-text-primary)", marginBottom: 8 }}>Acesso restrito à equipe SELVA</h2>
        <p style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 24 }}>Use suas credenciais para entrar no painel.</p>
        <button
          onClick={() => window.location.href = getLoginUrl()}
          style={{ padding: "10px 28px", borderRadius: 8, border: "none", background: "#D4537E", fontSize: 14, cursor: "pointer", color: "#FBEAF0", fontWeight: 500 }}
        >
          Entrar no BIT
        </button>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 20 }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#D4537E" }} />
          <span style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>SELVA Agency · São Paulo, BR</span>
        </div>
      </section>
    </div>
  );
}
