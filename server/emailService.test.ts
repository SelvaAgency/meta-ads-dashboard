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
    // Destinatário PERMITIDO e modo válido: sem isso o envio seria barrado pela
    // trava de destinatários e o teste não chegaria a exercitar o transporte —
    // que é justamente o que ele existe para verificar.
    vi.stubEnv("EMAIL_RECIPIENT_MODE", "admin_dev");
    vi.stubEnv("RESEND_API_KEY", "re_chave_que_funcionaria"); // o fallback ESTÁ disponível
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const r = await sendEmail({ to: "admin@selva.agency", subject: "x", html: "<p>x</p>", tipo: "digest" });

    expect(r.ok).toBe(false);
    // Sem conexão Gmail no banco → falha com motivo claro, no transporte.
    expect(r.erro).toMatch(/gmail/i);
    expect(r.bloqueado).toBeFalsy(); // passou pelas travas; quebrou no envio
    // O que importa: NENHUMA chamada ao Resend aconteceu.
    const chamouResend = fetchSpy.mock.calls.some(([url]) => String(url).includes("api.resend.com"));
    expect(chamouResend).toBe(false);
    fetchSpy.mockRestore();
  });

  it("sem provider e com automação ligada: bloqueia em vez de adivinhar", async () => {
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

/**
 * ─── Fase restrita: só admin/dev ────────────────────────────────────────────
 * A simulação end-to-end da ordem aprovada:
 *   pausa → provider → modo → resolver → validar → blocked/skipped → gmail.
 *
 * O elenco tem um COORDENADOR (`role=user` + `operationalRole=coordinator`) de
 * propósito: ele é destinatário natural de alerta de site, então é quem passaria
 * despercebido numa trava mal feita.
 */
vi.mock("./db", async (importOriginal) => {
  const real = await importOriginal<typeof import("./db")>();
  return {
    ...real,
    registrarEnvioEmail: vi.fn(async () => {}),
    getConexaoGmailAgencia: vi.fn(async () => null),
    usuariosAtivosComEmail: vi.fn(async () => ([
      { id: 1, name: "Admin", email: "admin@selva.agency", role: "admin" },
      { id: 2, name: "Dev", email: "dev@selva.agency", role: "developer" },
      { id: 3, name: "Colab", email: "colab@selva.agency", role: "user" },
      { id: 4, name: "Coord", email: "coord@selva.agency", role: "user" },
    ])),
  };
});

describe("fase restrita admin/dev", () => {
  /** Automação e provider ligados: queremos exercitar a trava de DESTINATÁRIO. */
  const ligarTudo = () => {
    vi.stubEnv("EMAIL_AUTOMATION_ENABLED", "true");
    vi.stubEnv("EMAIL_PROVIDER", "gmail");
    vi.stubEnv("EMAIL_RECIPIENT_MODE", "admin_dev");
    vi.stubEnv("EMAIL_DRY_RUN", "true"); // dry-run: prova a trava sem tocar na rede
    vi.stubEnv("EMAIL_TEST_RECIPIENT", "");
  };
  afterEach(() => vi.unstubAllEnvs());

  it("admin e developer passam pela validação", async () => {
    ligarTudo();
    const r = await sendEmail({ to: ["admin@selva.agency", "dev@selva.agency"], subject: "x", html: "<p>x</p>", tipo: "digest" });
    expect(r.bloqueado).toBeFalsy();
    expect(r.pulado).toBeFalsy();
    expect(r.entregas).toHaveLength(2);
  });

  it("colaborador BLOQUEIA o envio", async () => {
    ligarTudo();
    const r = await sendEmail({ to: "colab@selva.agency", subject: "x", html: "<p>x</p>", tipo: "digest" });
    expect(r.bloqueado).toBe(true);
    expect(r.ok).toBe(false);
    expect(r.erro).toMatch(/colab@selva\.agency/);
  });

  it("coordenador com role=user BLOQUEIA — operationalRole não concede nada", async () => {
    ligarTudo();
    const r = await sendEmail({ to: "coord@selva.agency", subject: "x", html: "<p>x</p>", tipo: "site_critico" });
    expect(r.bloqueado).toBe(true);
  });

  /** O ponto central: NÃO filtrar. Um inválido no meio derruba o lote inteiro. */
  it("um inválido no meio de válidos derruba o lote — nada é enviado em silêncio", async () => {
    ligarTudo();
    const r = await sendEmail({
      to: ["admin@selva.agency", "colab@selva.agency", "dev@selva.agency"],
      subject: "x", html: "<p>x</p>", tipo: "digest",
    });
    expect(r.bloqueado).toBe(true);
    expect(r.entregas.every((e) => !e.ok)).toBe(true);
  });

  it.each([
    ["cliente externo", "contato@clientequalquer.com.br"],
    ["contato@ da agência", "contato@selva.agency"],
    ["endereço que não é usuário", "qualquer@selva.agency"],
  ])("bloqueia %s", async (_n, email) => {
    ligarTudo();
    const r = await sendEmail({ to: email, subject: "x", html: "<p>x</p>", tipo: "digest" });
    expect(r.bloqueado).toBe(true);
  });

  it("EMAIL_TEST_RECIPIENT é IGNORADO na fase restrita", async () => {
    ligarTudo();
    vi.stubEnv("EMAIL_TEST_RECIPIENT", "colab@selva.agency"); // desvio configurado
    const r = await sendEmail({ to: "admin@selva.agency", subject: "x", html: "<p>x</p>", tipo: "digest" });
    expect(r.redirecionado).toBe(false);
    // O desvio foi a causa direta do incidente: ninguém pode ser redirecionado.
    expect(r.entregas.every((e) => e.para === "admin@selva.agency")).toBe(true);
  });

  it("modo ausente bloqueia, mesmo com automação e provider corretos", async () => {
    ligarTudo();
    vi.stubEnv("EMAIL_RECIPIENT_MODE", "");
    const r = await sendEmail({ to: "admin@selva.agency", subject: "x", html: "<p>x</p>", tipo: "digest" });
    expect(r.bloqueado).toBe(true);
    expect(r.erro).toMatch(/EMAIL_RECIPIENT_MODE/);
  });

  it("modo 'all' é recusado — não existe destravar por env", async () => {
    ligarTudo();
    vi.stubEnv("EMAIL_RECIPIENT_MODE", "all");
    const r = await sendEmail({ to: "admin@selva.agency", subject: "x", html: "<p>x</p>", tipo: "digest" });
    expect(r.bloqueado).toBe(true);
  });

  it("provider resend bloqueia o automático — Resend é legado, não automação", async () => {
    ligarTudo();
    vi.stubEnv("EMAIL_PROVIDER", "resend");
    vi.stubEnv("RESEND_API_KEY", "re_chave");
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const r = await sendEmail({ to: "admin@selva.agency", subject: "x", html: "<p>x</p>", tipo: "digest" });
    expect(r.bloqueado).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  /** A pausa mestre continua sendo a PRIMEIRA coisa — antes de qualquer trava nova. */
  it("com automação pausada, o resultado é paused (não blocked)", async () => {
    ligarTudo();
    vi.stubEnv("EMAIL_AUTOMATION_ENABLED", "false");
    const r = await sendEmail({ to: "colab@selva.agency", subject: "x", html: "<p>x</p>", tipo: "digest" });
    expect(r.pausado).toBe(true);
    expect(r.bloqueado).toBeFalsy();
  });
});
