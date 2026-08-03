import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  envioAutomaticoHabilitado, sendEmail, providerConfigurado, transporteAtivo, porqueNaoEnvia,
} from "./emailService";

/**
 * A PAUSA MESTRE é uma regra de operação, não de estilo: enquanto Gmail API e
 * destinatários finais não estão definidos, NENHUM email automático pode sair —
 * nem para o destinatário real, nem desviado para EMAIL_TEST_RECIPIENT (foi
 * assim que ~10 emails caíram numa caixa única às 06:30). Estes testes fazem
 * essa garantia falhar em vermelho se alguém reabrir o envio sem querer.
 */
describe("interruptor mestre de envio automático", () => {
  beforeEach(() => {
    // Sem banco no teste: registrarEnvioEmail vira no-op silencioso.
    vi.stubEnv("DATABASE_URL", "");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("SÓ habilita com o valor exato \"true\" — fail-safe por padrão", () => {
    vi.stubEnv("EMAIL_AUTOMATION_ENABLED", "");
    expect(envioAutomaticoHabilitado()).toBe(false);      // ausente
    vi.stubEnv("EMAIL_AUTOMATION_ENABLED", "false");
    expect(envioAutomaticoHabilitado()).toBe(false);
    vi.stubEnv("EMAIL_AUTOMATION_ENABLED", "TRUE");
    expect(envioAutomaticoHabilitado()).toBe(false);      // maiúsculo não conta
    vi.stubEnv("EMAIL_AUTOMATION_ENABLED", "1");
    expect(envioAutomaticoHabilitado()).toBe(false);
    vi.stubEnv("EMAIL_AUTOMATION_ENABLED", "true");
    expect(envioAutomaticoHabilitado()).toBe(true);
  });

  it("pausado: sendEmail não envia e não desvia para EMAIL_TEST_RECIPIENT", async () => {
    vi.stubEnv("EMAIL_AUTOMATION_ENABLED", "false");
    vi.stubEnv("EMAIL_TEST_RECIPIENT", "contato@selva.agency"); // mesmo com desvio configurado
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const r = await sendEmail({
      to: ["natalia@selva.agency", "gustavo@selva.agency"],
      subject: "Jornalzinho de teste", html: "<p>x</p>", tipo: "digest",
    });

    expect(r.pausado).toBe(true);
    expect(r.ok).toBe(true);          // no-op bem-sucedido: o job não quebra
    expect(r.dryRun).toBe(true);
    expect(r.redirecionado).toBe(false);
    // Uma "entrega" por destinatário ORIGINAL, e o final é o próprio original —
    // nada foi desviado para contato@selva.agency.
    expect(r.entregas).toHaveLength(2);
    expect(r.entregas.map((e) => e.para)).toEqual(["natalia@selva.agency", "gustavo@selva.agency"]);
    expect(r.entregas.every((e) => e.para === e.destinoOriginal)).toBe(true);
    expect(r.entregas.some((e) => e.para === "contato@selva.agency")).toBe(false);
    // O ponto central: nenhuma chamada HTTP de envio (Resend) aconteceu.
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  /**
   * A trava mestre vem ANTES da escolha de provider. Um provider novo não pode
   * abrir uma porta lateral: se abrisse, o Gmail estaria enviando enquanto todo
   * mundo acha que a automação está pausada.
   */
  it("pausado com Gmail escolhido: continua sem enviar nada", async () => {
    vi.stubEnv("EMAIL_AUTOMATION_ENABLED", "false");
    vi.stubEnv("EMAIL_PROVIDER", "gmail");
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const r = await sendEmail({ to: "natalia@selva.agency", subject: "x", html: "<p>x</p>", tipo: "digest" });

    expect(r.pausado).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled(); // nem Google, nem Resend
    fetchSpy.mockRestore();
  });
});

/**
 * ─── Escolha EXPLÍCITA de provider ──────────────────────────────────────────
 * Antes a escolha era por dedução ("tem RESEND_API_KEY? então Resend"). Com dois
 * providers isso vira uma decisão de produção tomada por presença de variável,
 * que ninguém revisa porque não está escrita em lugar nenhum.
 */
describe("EMAIL_PROVIDER", () => {
  beforeEach(() => vi.stubEnv("DATABASE_URL", ""));
  afterEach(() => vi.unstubAllEnvs());

  it("ausente → não envia, mesmo com credencial do Resend presente", () => {
    vi.stubEnv("EMAIL_PROVIDER", "");
    vi.stubEnv("RESEND_API_KEY", "re_chave_valida");
    expect(providerConfigurado()).toBeNull();
    expect(transporteAtivo()).toBe("nenhum");
    expect(porqueNaoEnvia()).toMatch(/EMAIL_PROVIDER não definida/i);
  });

  it("valor inválido → não envia, e diz o que foi digitado", () => {
    vi.stubEnv("EMAIL_PROVIDER", "sendgrid");
    expect(providerConfigurado()).toBeNull();
    expect(transporteAtivo()).toBe("nenhum");
    expect(porqueNaoEnvia()).toMatch(/sendgrid.*inválida/i);
  });

  it("aceita os três nomes válidos, sem depender de maiúscula/espaço", () => {
    for (const v of ["gmail", "GMAIL", " resend ", "smtp"]) {
      vi.stubEnv("EMAIL_PROVIDER", v);
      expect(providerConfigurado()).toBe(v.trim().toLowerCase());
    }
  });

  it("nomeado mas sem credencial → não envia, e explica qual falta", () => {
    vi.stubEnv("EMAIL_PROVIDER", "resend");
    vi.stubEnv("RESEND_API_KEY", "");
    expect(transporteAtivo()).toBe("nenhum");
    expect(porqueNaoEnvia()).toMatch(/RESEND_API_KEY/);
  });

  /**
   * O ponto central da Fase 4: falha do Gmail NÃO cai no Resend. Cair seria pior
   * do que falhar — o e-mail sairia pelo remetente errado e ninguém saberia por
   * quê, que é a classe de bug que este projeto passou semanas caçando.
   */
  it("Gmail sem conexão NÃO cai no Resend — falha e registra", async () => {
    vi.stubEnv("EMAIL_AUTOMATION_ENABLED", "true"); // automação ligada de propósito
    vi.stubEnv("EMAIL_DRY_RUN", "false");           // e sem dry-run: queremos a tentativa real
    vi.stubEnv("EMAIL_TEST_RECIPIENT", "");
    vi.stubEnv("EMAIL_PROVIDER", "gmail");
    vi.stubEnv("RESEND_API_KEY", "re_chave_que_funcionaria"); // o fallback ESTÁ disponível
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const r = await sendEmail({ to: "a@selva.agency", subject: "x", html: "<p>x</p>", tipo: "digest" });

    expect(r.ok).toBe(false);
    // Sem banco no teste, a conexão do Gmail não existe → falha com motivo claro.
    expect(r.erro).toMatch(/gmail/i);
    // O que importa: NENHUMA chamada ao Resend aconteceu.
    const chamouResend = fetchSpy.mock.calls.some(([url]) => String(url).includes("api.resend.com"));
    expect(chamouResend).toBe(false);
    fetchSpy.mockRestore();
  });

  it("sem provider e com automação ligada: falha em vez de adivinhar", async () => {
    vi.stubEnv("EMAIL_AUTOMATION_ENABLED", "true");
    vi.stubEnv("EMAIL_DRY_RUN", "false");
    vi.stubEnv("EMAIL_TEST_RECIPIENT", "");
    vi.stubEnv("EMAIL_PROVIDER", "");
    vi.stubEnv("RESEND_API_KEY", "re_chave_valida");
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const r = await sendEmail({ to: "a@selva.agency", subject: "x", html: "<p>x</p>", tipo: "digest" });

    expect(r.ok).toBe(false);
    expect(r.erro).toMatch(/EMAIL_PROVIDER/);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
