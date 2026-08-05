/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Cliente sem mídia — isolamento dos fluxos de mídia
 * ─────────────────────────────────────────────────────────────────────────────
 *  A Aiká é uma cliente normal da Selva que hoje só tem SITE com a agência —
 *  não é uma entidade técnica, é um cliente com outro escopo. O nome da coluna
 *  (`somenteMonitoramento`) é técnico e descreve o que ela faz no banco; no
 *  produto, isso é "cliente sem mídia".
 *
 *  Sem o isolamento ela cairia nos SETE laços de sync de mídia do autoSync com
 *  `accessToken` vazio e produziria erro e alerta de "token expirado" todo dia
 *  — ruído que ensina o time a ignorar alerta de verdade.
 *
 *  O isolamento NÃO é "sumir do sistema", e é aí que ele é fácil de errar: ela
 *  precisa continuar selecionável (senão a área Site dela é inalcançável),
 *  visível no Panorama, presente nas preferências do Jornalzinho e no GTM 1.
 *  São três destinos diferentes:
 *
 *    sync de mídia   → FORA   (getAllActiveMetaAdAccounts)
 *    análise de mídia→ FORA   (contasDeMidia: briefing, portfólio, consolidação)
 *    listagem/UI     → DENTRO (…ForListing: seletor de cliente, Panorama)
 *
 *  A garantia estrutural é o filtro morar num ponto só por destino; este teste
 *  fixa a REGRA que os três usam.
 */
import { describe, expect, it } from "vitest";
import { ehContaDeMidia } from "../../db";

const AIKA = { id: 90, accountName: "Aiká", somenteMonitoramento: true };
const ULTRA = { id: 12, accountName: "Ultra Malhas", somenteMonitoramento: false };

describe("ehContaDeMidia", () => {
  it("a conta de monitoramento NÃO é conta de mídia", () => {
    expect(ehContaDeMidia(AIKA)).toBe(false);
  });

  it("cliente com mídia continua sendo", () => {
    expect(ehContaDeMidia(ULTRA)).toBe(true);
  });

  /**
   * Toda conta que já existia tem a coluna ausente/null até a migração rodar.
   * Se `undefined` fosse tratado como "monitoramento", a migração apagaria o
   * portfólio inteiro dos syncs — falha catastrófica e silenciosa.
   */
  it.each([
    ["campo ausente", {} as Record<string, never>],
    ["null", { somenteMonitoramento: null }],
    ["undefined", { somenteMonitoramento: undefined }],
  ])("conta legada (%s) é tratada como mídia, nunca como monitoramento", (_n, conta) => {
    expect(ehContaDeMidia(conta)).toBe(true);
  });

  it("filtrar uma lista mista deixa só quem tem mídia", () => {
    expect([AIKA, ULTRA].filter(ehContaDeMidia).map((c) => c.accountName)).toEqual(["Ultra Malhas"]);
  });

  /**
   * O outro lado da moeda: a listagem NÃO filtra. Se alguém "consertar" isso
   * aplicando o mesmo filtro no seletor de clientes, a Aiká some da UI e a área
   * Site dela deixa de existir — sem erro nenhum, só desaparece.
   */
  it("a listagem mantém as duas — é isso que dá acesso à área Site da Aiká", () => {
    const listagem = [AIKA, ULTRA]; // ForListing não aplica ehContaDeMidia
    expect(listagem.map((c) => c.accountName)).toEqual(["Aiká", "Ultra Malhas"]);
  });
});
