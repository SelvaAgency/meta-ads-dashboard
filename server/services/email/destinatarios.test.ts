/**
 * Trava de destinatários — fase restrita admin/dev.
 *
 * O incidente original foi de DESTINATÁRIO, não de conteúdo. Estes testes
 * existem para que qualquer reabertura acidental da porta falhe em vermelho:
 * um `role` novo tratado como gestor, um filtro silencioso no lugar do bloqueio,
 * ou um `EMAIL_RECIPIENT_MODE=all` aceito por descuido.
 */
import { describe, expect, it, vi, afterEach } from "vitest";
import {
  MODO_ADMIN_DEV, MODO_ALL_INTERNAL, modoDestinatarios, porqueModoInvalido, normalizarEmail,
  validarDestinatarios, resolverDestinatariosAdminDev, resolverDestinatarios, simularDestinatarios,
} from "./destinatarios";

/**
 * O elenco de teste espelha o quadro real: admin, developer, colaborador e —
 * o caso que mais engana — um COORDENADOR, que é `role=user` +
 * `operationalRole=coordinator`. Ele é o destinatário natural de alerta de site,
 * então é exatamente quem passaria despercebido numa trava mal feita.
 */
const EQUIPE = [
  { id: 1, name: "Admin",        email: "admin@selva.agency",       role: "admin" },
  { id: 2, name: "Dev",          email: "dev@selva.agency",         role: "developer" },
  { id: 3, name: "Colaborador",  email: "colab@selva.agency",       role: "user" },
  { id: 4, name: "Coordenadora", email: "coord@selva.agency",       role: "user" },
  { id: 5, name: "Admin Maiúsc", email: "  Admin2@Selva.Agency  ",  role: "admin" },
  { id: 6, name: "Duplicada",    email: "admin@selva.agency",       role: "admin" },
];

vi.mock("../../db", () => ({
  usuariosAtivosComEmail: vi.fn(async () => EQUIPE),
}));

afterEach(() => vi.unstubAllEnvs());

describe("modo de destinatários", () => {
  it("aceita all_internal", () => {
    for (const v of ["all_internal", "ALL_INTERNAL", " all_internal "]) {
      vi.stubEnv("EMAIL_RECIPIENT_MODE", v);
      expect(modoDestinatarios()).toBe(MODO_ALL_INTERNAL);
      expect(porqueModoInvalido()).toBeNull();
    }
  });

  it("aceita admin_dev, sem depender de maiúscula ou espaço", () => {
    for (const v of ["admin_dev", "ADMIN_DEV", " admin_dev "]) {
      vi.stubEnv("EMAIL_RECIPIENT_MODE", v);
      expect(modoDestinatarios()).toBe(MODO_ADMIN_DEV);
      expect(porqueModoInvalido()).toBeNull();
    }
  });

  /**
   * `all` e `clients` são os valores que alguém escreveria para "destravar" a
   * fase. Recusar explicitamente é o que impede isso de funcionar sem passar
   * por uma mudança de código revisada.
   */
  it.each(["all", "clients", "todos", "true", ""])("RECUSA o modo %s", (v) => {
    vi.stubEnv("EMAIL_RECIPIENT_MODE", v);
    expect(modoDestinatarios()).toBeNull();
    expect(porqueModoInvalido()).toBeTruthy();
  });

  it("ausente não vira default permissivo", () => {
    vi.stubEnv("EMAIL_RECIPIENT_MODE", "");
    expect(modoDestinatarios()).toBeNull();
    expect(porqueModoInvalido()).toMatch(/não definida/i);
  });
});

describe("normalização de endereço", () => {
  /**
   * Sem isto, "Felberg@Selva.agency " e "felberg@selva.agency" seriam pessoas
   * diferentes — e a validação bloquearia um destinatário legítimo, ou deixaria
   * passar um que só parece estar na lista.
   */
  it("ignora caixa e espaços nas pontas", () => {
    expect(normalizarEmail("  Felberg@Selva.Agency ")).toBe("felberg@selva.agency");
  });
});

describe("validação de destinatários", () => {
  const permitidos = ["felberg@selva.agency", "dev@selva.agency"];

  it("aprova quando todos estão na lista", () => {
    const r = validarDestinatarios(["felberg@selva.agency"], permitidos);
    expect(r.ok).toBe(true);
    expect(r.invalidos).toEqual([]);
  });

  it("compara sem se importar com caixa", () => {
    expect(validarDestinatarios(["FELBERG@Selva.Agency"], permitidos).ok).toBe(true);
  });

  /**
   * O ponto central da fase: NÃO filtrar. Filtrar em silêncio transforma erro de
   * configuração em envio parcial que parece ter dado certo — e ninguém
   * investiga o que não reclama.
   */
  it("um destinatário fora derruba o LOTE INTEIRO", () => {
    const r = validarDestinatarios(
      ["felberg@selva.agency", "colaborador@selva.agency", "dev@selva.agency"],
      permitidos,
    );
    expect(r.ok).toBe(false);
    expect(r.invalidos).toEqual(["colaborador@selva.agency"]);
    // Os válidos são reportados, mas ok=false — quem chama NÃO deve enviar para eles.
    expect(r.validos).toEqual(["felberg@selva.agency", "dev@selva.agency"]);
  });

  it.each([
    ["cliente externo", "contato@clientequalquer.com.br"],
    ["contato@ da agência", "contato@selva.agency"],
    ["endereço de teste antigo", "teste@selva.agency"],
  ])("bloqueia %s", (_n, email) => {
    expect(validarDestinatarios([email], permitidos).ok).toBe(false);
  });

  it("lista permitida vazia bloqueia tudo — não vira passe livre", () => {
    const r = validarDestinatarios(["felberg@selva.agency"], []);
    expect(r.ok).toBe(false);
    expect(r.validos).toEqual([]);
  });

  it("pedido vazio não é 'inválido', é ausência de destinatário", () => {
    const r = validarDestinatarios([], permitidos);
    expect(r.ok).toBe(true);      // nada errado…
    expect(r.validos).toEqual([]); // …mas também nada a enviar → o chamador vira skipped
  });

  it("ignora entradas em branco em vez de contá-las como inválidas", () => {
    const r = validarDestinatarios(["", "   ", "felberg@selva.agency"], permitidos);
    expect(r.ok).toBe(true);
    expect(r.validos).toEqual(["felberg@selva.agency"]);
  });
});

describe("resolverDestinatariosAdminDev", () => {
  it("devolve só admin e developer", async () => {
    const r = await resolverDestinatariosAdminDev();
    expect(r.map((p) => p.email).sort()).toEqual([
      "admin2@selva.agency", "admin@selva.agency", "dev@selva.agency",
    ]);
  });

  it("NÃO inclui colaborador", async () => {
    const r = await resolverDestinatariosAdminDev();
    expect(r.some((p) => p.email === "colab@selva.agency")).toBe(false);
  });

  /**
   * `role` e `operationalRole` são eixos independentes, e só `role` concede
   * permissão. Coordenador continua fora nesta fase, por mais que ele seja o
   * destinatário natural do alerta de site.
   */
  it("NÃO inclui coordenador com role=user", async () => {
    const r = await resolverDestinatariosAdminDev();
    expect(r.some((p) => p.email === "coord@selva.agency")).toBe(false);
  });

  it("normaliza e deduplica por endereço, não por id", async () => {
    const r = await resolverDestinatariosAdminDev();
    expect(r.filter((p) => p.email === "admin@selva.agency")).toHaveLength(1); // ids 1 e 6
    expect(r.some((p) => p.email === "admin2@selva.agency")).toBe(true);       // caixa/espaços
  });
});

describe("simulação (sem enviar nada)", () => {
  it("separa quem receberia de quem seria bloqueado, com motivo", async () => {
    vi.stubEnv("EMAIL_RECIPIENT_MODE", "admin_dev");
    const s = await simularDestinatarios();

    expect(s.modo).toBe(MODO_ADMIN_DEV);
    expect(s.receberiam.map((p) => p.email).sort()).toEqual([
      "admin2@selva.agency", "admin@selva.agency", "dev@selva.agency",
    ]);
    const bloqueados = s.bloqueados.map((b) => b.email).sort();
    expect(bloqueados).toEqual(["coord@selva.agency", "colab@selva.agency"].sort());
    // O motivo agora nomeia o MODO, para o histórico dizer sob qual regra a
    // pessoa ficou de fora — a regra muda entre fases.
    expect(s.bloqueados.every((b) => /admin_dev.*admin e developer/.test(b.motivo))).toBe(true);
  });

  it("mostra o modo inválido em vez de fingir que está tudo certo", async () => {
    vi.stubEnv("EMAIL_RECIPIENT_MODE", "all");
    const s = await simularDestinatarios();
    expect(s.modo).toBeNull();
    expect(s.porqueModoInvalido).toMatch(/all/);
    // A lista de permitidos continua sendo calculada — dá para conferir os nomes
    // antes de configurar a env.
    expect(s.receberiam.length).toBeGreaterThan(0);
  });
});


/**
 * ─── all_internal ───────────────────────────────────────────────────────────
 * Libera o Jornalzinho para todo usuário interno ativo, colaborador incluído.
 *
 * O ponto que estes testes fixam: as exclusões que o produto pede (cliente
 * externo, lista fixa no código, endereço de env, fallback) NÃO são regras
 * novas — são consequência de a lista nascer de `usuariosAtivosComEmail()`.
 * Quem não é usuário interno simplesmente não existe nessa fonte.
 */
describe("modo all_internal", () => {
  it("inclui admin, developer E colaborador", async () => {
    const r = await resolverDestinatarios(MODO_ALL_INTERNAL);
    const roles = new Set(r.map((p) => p.role));
    expect(roles.has("admin")).toBe(true);
    expect(roles.has("developer")).toBe(true);
    expect(roles.has("user")).toBe(true);
  });

  /** O coordenador é role=user; em admin_dev ficava fora, aqui entra. */
  it("inclui o coordenador (role=user), que admin_dev cortava", async () => {
    const r = await resolverDestinatarios(MODO_ALL_INTERNAL);
    expect(r.some((p) => p.email === "coord@selva.agency")).toBe(true);
    const restrito = await resolverDestinatariosAdminDev();
    expect(restrito.some((p) => p.email === "coord@selva.agency")).toBe(false);
  });

  it("continua deduplicando por endereço e normalizando", async () => {
    const r = await resolverDestinatarios(MODO_ALL_INTERNAL);
    expect(r.filter((p) => p.email === "admin@selva.agency")).toHaveLength(1);
    expect(r.some((p) => p.email === "admin2@selva.agency")).toBe(true);
  });

  /**
   * A lista inteira sai de usuariosAtivosComEmail(), que já filtra
   * active=true / deletedAt IS NULL / e-mail não nulo. Nada fora dessa fonte
   * pode entrar — é o que torna impossível cliente externo ou env solta.
   */
  it("todo destinatário tem id de usuário interno", async () => {
    const r = await resolverDestinatarios(MODO_ALL_INTERNAL);
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((p) => Number.isInteger(p.id) && p.id > 0)).toBe(true);
    expect(r.every((p) => p.email.endsWith("@selva.agency"))).toBe(true);
  });

  it("é mais abrangente que admin_dev, nunca menos", async () => {
    const todos = await resolverDestinatarios(MODO_ALL_INTERNAL);
    const restrito = await resolverDestinatarios(MODO_ADMIN_DEV);
    const emails = new Set(todos.map((p) => p.email));
    expect(restrito.every((p) => emails.has(p.email))).toBe(true);
    expect(todos.length).toBeGreaterThan(restrito.length);
  });

  it("com all_internal em vigor, ninguém sobra como bloqueado", async () => {
    vi.stubEnv("EMAIL_RECIPIENT_MODE", "all_internal");
    const s = await simularDestinatarios();
    expect(s.modo).toBe(MODO_ALL_INTERNAL);
    expect(s.bloqueados).toHaveLength(0);
    expect(s.receberiam.length).toBe(s.totalAtivosComEmail - 1); // -1 = duplicata por e-mail
  });

  /** Sem modo configurado a simulação mostra o cenário MAIS restrito. */
  it("sem modo definido, simula admin_dev — nunca promete alcance maior", async () => {
    vi.stubEnv("EMAIL_RECIPIENT_MODE", "");
    const s = await simularDestinatarios();
    expect(s.modo).toBeNull();
    expect(s.receberiam.some((p) => p.email === "colab@selva.agency")).toBe(false);
  });
});
