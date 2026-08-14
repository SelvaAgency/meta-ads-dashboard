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
} from "./permissions";

describe("quem edita as prioridades da semana", () => {
  it("admin e desenvolvedor, como em todo o resto do conteúdo", () => {
    expect(canManagePriorities("admin")).toBe(true);
    expect(canManagePriorities("developer")).toBe(true);
  });

  /** A autorização parcial que a rodada pediu: escreve no quadro, e só. */
  it("colaborador com responsabilidade de coordenador também edita", () => {
    expect(canManagePriorities("user", "coordinator")).toBe(true);
  });

  it("colaborador comum só visualiza", () => {
    expect(canManagePriorities("user")).toBe(false);
    expect(canManagePriorities("user", "collaborator")).toBe(false);
  });

  /** Sessão sem role não pode virar permissão por omissão. */
  it("valor desconhecido ou ausente não concede nada", () => {
    expect(canManagePriorities(undefined)).toBe(false);
    expect(canManagePriorities(null, null)).toBe(false);
    expect(canManagePriorities("coordinator")).toBe(false);
  });
});

describe("coordenador NÃO virou admin", () => {
  /**
   * O ponto do arquivo. Se qualquer uma destas passar a devolver `true`, a
   * mudança vazou para fora do quadro da semana — e o sintoma seria a tela do
   * coordenador ganhando botões, que se parece com a funcionalidade nova
   * funcionando.
   */
  const coordenador = ["user", "coordinator"] as const;

  it("não acessa o Administrativo", () => {
    expect(canAccessAdmin(coordenador[0])).toBe(false);
  });

  it("não gerencia conteúdo (News, SelvaTV, conexões)", () => {
    expect(canManageContent(coordenador[0])).toBe(false);
  });

  it("não gerencia colaboradores", () => {
    expect(canManagePeople(coordenador[0])).toBe(false);
  });

  /**
   * As outras funções recebem só o `role` por assinatura, então nem teriam como
   * ver o campo. Este teste existe para que, no dia em que alguém acrescentar o
   * segundo parâmetro a uma delas, a mudança precise passar por aqui.
   */
  it("as demais funções ignoram operationalRole mesmo se ele for passado", () => {
    const f = [canAccessAdmin, canManageContent, canManagePeople] as Array<(a: unknown, b?: unknown) => boolean>;
    for (const fn of f) expect(fn("user", "coordinator")).toBe(false);
  });
});
