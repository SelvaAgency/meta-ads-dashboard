import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { envioAutomaticoHabilitado, sendEmail } from "./emailService";

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
});
