/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Narrativa segmentada — a IA não pode ver cliente de outro grupo
 * ─────────────────────────────────────────────────────────────────────────────
 *  A garantia NÃO é filtrar o texto depois de gerado: é a ausência na ENTRADA.
 *  O prompt é montado a partir das contas recebidas, então o modelo não tem
 *  como citar quem nunca viu. Filtrar a saída seria confiar que texto livre não
 *  menciona quem não devia — e texto livre não dá essa garantia.
 *
 *  Estes testes espionam a chamada ao LLM e verificam o PROMPT.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const invokeLLM = vi.fn(async () => ({ content: [{ type: "text", text: '{"resumo":"ok","positivo":null,"atencao":null,"critico":null}' }] }));

vi.mock("../_core/llm", () => ({
  invokeLLM: (...a: unknown[]) => invokeLLM(...(a as [])),
  extractTextContent: (r: any) => r.content[0].text,
}));

const CONTAS = [
  { id: 1, accountId: "1", accountName: "Ultra Malhas", aiStatusColor: "green", aiStatusSummary: "ok" },
  { id: 2, accountId: "2", accountName: "Elwing", aiStatusColor: "green", aiStatusSummary: "ok" },
  { id: 3, accountId: "3", accountName: "Musa Resíduos", aiStatusColor: "red", aiStatusSummary: "ruim" },
  { id: 4, accountId: "4", accountName: "CA - ARKA", aiStatusColor: "red", aiStatusSummary: "ruim" },
];

const segmentos = new Map<string, string>();

vi.mock("../db", () => ({
  // O briefing passou a enumerar por `contasDeMidia` (que exclui contas
  // somente-monitoramento). Mockar o enumerador antigo deixaria o teste verde
  // testando um caminho que o código não usa mais.
  contasDeMidia: vi.fn(async () => CONTAS),
  getAccountMetricsSummary: vi.fn(async () => []),
  getAccountContext: vi.fn(async () => null),
  getDailyBriefing: vi.fn(async () => null),
  saveDailyBriefing: vi.fn(async () => {}),
  getBriefingSegmentado: vi.fn(async (d: string, k: string) => segmentos.get(`${d}|${k}`) ?? null),
  saveBriefingSegmentado: vi.fn(async (d: string, k: string, c: string) => { segmentos.set(`${d}|${k}`, c); }),
}));

vi.mock("./jornalExecutivo", () => ({ montarClientesPanorama: vi.fn(async () => []) }));

const { obterBriefingSegmentado, chaveDeSegmento } = await import("./briefingService");

const promptDaChamada = () => String((invokeLLM.mock.calls.at(-1)![0] as any).messages[0].content);

describe("briefing segmentado", () => {
  beforeEach(() => { invokeLLM.mockClear(); segmentos.clear(); });

  it("o prompt cita SÓ os clientes do grupo 1", async () => {
    await obterBriefingSegmentado("2026-08-05", [1, 2]);
    const p = promptDaChamada();
    expect(p).toContain("Ultra Malhas");
    expect(p).toContain("Elwing");
    expect(p).not.toContain("Musa");
    expect(p).not.toContain("ARKA");
  });

  it("o prompt cita SÓ os clientes do grupo 2", async () => {
    await obterBriefingSegmentado("2026-08-05", [3, 4]);
    const p = promptDaChamada();
    expect(p).toContain("Musa");
    expect(p).toContain("ARKA");
    expect(p).not.toContain("Ultra Malhas");
    expect(p).not.toContain("Elwing");
  });

  it("um grupo não vê NENHUM cliente do outro — verificado nos dois sentidos", async () => {
    await obterBriefingSegmentado("2026-08-05", [1, 2]);
    const g1 = promptDaChamada();
    segmentos.clear();
    await obterBriefingSegmentado("2026-08-05", [3, 4]);
    const g2 = promptDaChamada();
    for (const n of ["Musa", "ARKA"]) expect(g1).not.toContain(n);
    for (const n of ["Ultra Malhas", "Elwing"]) expect(g2).not.toContain(n);
  });

  it("lista vazia não chama o modelo", async () => {
    expect(await obterBriefingSegmentado("2026-08-05", [])).toBeNull();
    expect(invokeLLM).not.toHaveBeenCalled();
  });

  it("conta inexistente não vira prompt vazio — devolve null sem chamar", async () => {
    expect(await obterBriefingSegmentado("2026-08-05", [999])).toBeNull();
    expect(invokeLLM).not.toHaveBeenCalled();
  });

  /**
   * Cache por CONJUNTO: os três do Grupo 1 leem a mesma narrativa e o dia gasta
   * UMA chamada. Sem isso seriam três — e cada abertura da prévia geraria outra.
   */
  it("o mesmo conjunto reusa o cache — uma chamada de LLM, não duas", async () => {
    await obterBriefingSegmentado("2026-08-05", [1, 2]);
    await obterBriefingSegmentado("2026-08-05", [2, 1]); // ordem diferente, mesmo conjunto
    expect(invokeLLM).toHaveBeenCalledTimes(1);
  });

  it("conjuntos diferentes não compartilham cache", async () => {
    await obterBriefingSegmentado("2026-08-05", [1, 2]);
    await obterBriefingSegmentado("2026-08-05", [3, 4]);
    expect(invokeLLM).toHaveBeenCalledTimes(2);
  });

  it("a chave do segmento independe de ordem e de repetição", () => {
    expect(chaveDeSegmento([2, 1])).toBe(chaveDeSegmento([1, 2]));
    expect(chaveDeSegmento([1, 1, 2])).toBe(chaveDeSegmento([1, 2]));
    expect(chaveDeSegmento([1, 2])).not.toBe(chaveDeSegmento([1, 3]));
  });
});
