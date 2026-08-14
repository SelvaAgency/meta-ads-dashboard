/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Coordenador ganhou UMA permissão — e o teste é sobre as que ele NÃO ganhou
 * ─────────────────────────────────────────────────────────────────────────────
 *  `operationalRole` sempre foi responsabilidade, não permissão: dizia por quais
 *  clientes a pessoa responde, e era usado só para escolher destinatário de
 *  alerta. Ele passou a conceder exatamente um acesso — editar as Prioridades da
 *  Semana — e nada mais.
 *
 *  O risco de uma mudança dessas não está no que ela libera; está no que ela
 *  libera SEM QUERER. Se `canAccessAdmin` ou `canManagePeople` começassem a
 *  olhar esse campo, um coordenador entraria no Financeiro e no cadastro de
 *  pessoas — e ninguém perceberia, porque a tela dele passaria a ter mais botões
 *  e isso pareceria a mudança funcionando.
 *
 *  Por isso a metade de baixo deste arquivo testa as OUTRAS funções: elas têm
 *  que continuar cegas ao coordenador.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, expect, it } from "vitest";
import {
  canAccessAdmin, canManageContent, canManagePeople, canManagePriorities,
  isRole, ROLE_LABELS, ROLES,
} from "./permissions";

describe("quem edita as prioridades da semana", () => {
  it("admin e desenvolvedor, como em todo o resto do conteúdo", () => {
    expect(canManagePriorities("admin")).toBe(true);
    expect(canManagePriorities("developer")).toBe(true);
  });

  /** O role novo, e a única permissão que ele tem além do uso geral. */
  it("coordenador edita o quadro", () => {
    expect(canManagePriorities("coordinator")).toBe(true);
  });

  it("colaborador comum só visualiza", () => {
    expect(canManagePriorities("user")).toBe(false);
  });

  /** Sessão sem role não pode virar permissão por omissão. */
  it("valor desconhecido ou ausente não concede nada", () => {
    expect(canManagePriorities(undefined)).toBe(false);
    expect(canManagePriorities(null)).toBe(false);
    expect(canManagePriorities("qualquer-coisa")).toBe(false);
  });
});

describe("coordenador NÃO virou admin", () => {
  /**
   * O ponto do arquivo. Se qualquer uma destas passar a devolver `true`, a
   * mudança vazou para fora do quadro da semana — e o sintoma seria a tela do
   * coordenador ganhando botões, que se parece com a funcionalidade nova
   * funcionando.
   */
  it("não acessa o Administrativo (Financeiro, Contratos, Propostas)", () => {
    expect(canAccessAdmin("coordinator")).toBe(false);
  });

  it("não gerencia conteúdo (News, SelvaTV, conexões, Panorama)", () => {
    expect(canManageContent("coordinator")).toBe(false);
  });

  it("não gerencia colaboradores", () => {
    expect(canManagePeople("coordinator")).toBe(false);
  });

  /**
   * A garantia que sustentou a mudança, escrita como teste: toda permissão do
   * arquivo é ALLOWLIST. Um role novo cai fora de tudo por construção, e não
   * porque alguém lembrou de excluí-lo caso a caso.
   *
   * Se algum dia aparecer a primeira negativa ("todo mundo menos colaborador"),
   * este teste cai — e é aqui que se descobre, antes do acesso vazar.
   */
  it("um role inventado não recebe permissão nenhuma", () => {
    const permissoes = [canAccessAdmin, canManageContent, canManagePeople, canManagePriorities];
    for (const fn of permissoes) expect(fn("role-que-nao-existe")).toBe(false);
  });
});

describe("os quatro roles da interface", () => {
  it("estão na ordem da hierarquia, e todos têm rótulo", () => {
    expect(ROLES).toEqual(["admin", "developer", "coordinator", "user"]);
    for (const r of ROLES) expect(ROLE_LABELS[r]).toBeTruthy();
  });

  it("isRole aceita os quatro e recusa o resto", () => {
    for (const r of ROLES) expect(isRole(r)).toBe(true);
    expect(isRole("coordenador")).toBe(false);
    expect(isRole("")).toBe(false);
  });
});
