/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Preferência de clientes — o modelo guarda EXCLUSÕES, não seleções
 * ─────────────────────────────────────────────────────────────────────────────
 *  A regra do produto é "recebe tudo e tira o que não quer". Isso decide como a
 *  tabela é LIDA: vale a lista de `enabled = false`; cliente sem linha está
 *  dentro.
 *
 *  A consequência é o ponto: um cliente novo — que por definição não tem linha
 *  para ninguém — entra sozinho para todo mundo. Guardar "o que está marcado"
 *  faria o oposto: ele nasceria fora e o resumo dele não chegaria a ninguém até
 *  alguém lembrar de ir na tela.
 *
 *  Estas funções replicam a resolução de `contasDoJornalzinho` sem banco, para
 *  a regra ser testável isoladamente.
 */
import { describe, expect, it } from "vitest";

type Pref = { accountId: number; enabled: boolean };

/** Espelha `contasDoJornalzinho`: null = sem recorte (recebe tudo). */
function resolver(prefs: Pref[], ativas: number[]): number[] | null {
  const desmarcados = new Set(prefs.filter((p) => !p.enabled).map((p) => p.accountId));
  if (desmarcados.size === 0) return null;
  return ativas.filter((id) => !desmarcados.has(id));
}

/** Espelha a marcação exibida na tela. */
const marcado = (prefs: Pref[], id: number) =>
  !prefs.some((p) => p.accountId === id && !p.enabled);

const ATIVAS = [10, 11, 12, 13];

describe("padrão: recebe tudo", () => {
  it("quem nunca configurou não tem recorte", () => {
    expect(resolver([], ATIVAS)).toBeNull();
  });

  /**
   * `null` não é só "sem filtro": é o que faz a pessoa cair no briefing GLOBAL,
   * já em cache e compartilhado. Devolver a lista completa geraria uma
   * narrativa idêntica com chave de cache própria.
   */
  it("quem salvou com tudo marcado também fica sem recorte", () => {
    const prefs = ATIVAS.map((id) => ({ accountId: id, enabled: true }));
    expect(resolver(prefs, ATIVAS)).toBeNull();
  });
});

describe("cliente novo entra sozinho", () => {
  it("aparece marcado na tela sem ninguém tocar", () => {
    const prefs = ATIVAS.map((id) => ({ accountId: id, enabled: true }));
    expect(marcado(prefs, 99)).toBe(true); // 99 = conta criada depois
  });

  it("entra no envio de quem só desmarcou outros", () => {
    const prefs: Pref[] = [{ accountId: 13, enabled: false }];
    expect(resolver(prefs, [...ATIVAS, 99])).toEqual([10, 11, 12, 99]);
  });

  /** O caso Aiká: quem está no recorte de GTM também passa a recebê-la. */
  it("entra até para quem tem recorte de grupo", () => {
    // GTM 1 = 10 e 11; 12 e 13 foram desmarcados pela pré-seleção.
    const prefs: Pref[] = [{ accountId: 12, enabled: false }, { accountId: 13, enabled: false }];
    expect(resolver(prefs, [...ATIVAS, 99])).toEqual([10, 11, 99]);
  });
});

describe("escolha individual manda", () => {
  it("desmarcado continua fora", () => {
    const prefs: Pref[] = [{ accountId: 11, enabled: false }];
    expect(resolver(prefs, ATIVAS)).toEqual([10, 12, 13]);
    expect(marcado(prefs, 11)).toBe(false);
  });

  it("desmarcar tudo deixa a pessoa sem cliente algum", () => {
    const prefs = ATIVAS.map((id) => ({ accountId: id, enabled: false }));
    expect(resolver(prefs, ATIVAS)).toEqual([]);
  });

  /** `[]` e `null` são opostos e não podem colapsar num valor só. */
  it("[] (não quero nada) NÃO é o mesmo que null (quero tudo)", () => {
    const nada = ATIVAS.map((id) => ({ accountId: id, enabled: false }));
    expect(resolver(nada, ATIVAS)).toEqual([]);
    expect(resolver([], ATIVAS)).toBeNull();
  });
});

describe("pré-seleção de GTM", () => {
  /** Marca os do grupo e DESMARCA o resto — é a exclusão que cria o recorte. */
  const preSelecionar = (grupo: number[], ativas: number[]): Pref[] =>
    ativas.map((id) => ({ accountId: id, enabled: grupo.includes(id) }));

  it("deixa a pessoa só com os clientes do grupo", () => {
    const prefs = preSelecionar([10, 11], ATIVAS);
    expect(resolver(prefs, ATIVAS)).toEqual([10, 11]);
  });

  it("as caixas fora do grupo aparecem desmarcadas", () => {
    const prefs = preSelecionar([10, 11], ATIVAS);
    expect(marcado(prefs, 10)).toBe(true);
    expect(marcado(prefs, 13)).toBe(false);
  });
});
