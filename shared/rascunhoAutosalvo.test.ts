/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  O rascunho autossalvo — relógio falso, sem navegador
 * ─────────────────────────────────────────────────────────────────────────────
 *  A perda que isto corrige: o contexto rápido vivia em `useState` e só ia ao
 *  banco no clique de Salvar. Trocar de aba desmontava o componente, o estado
 *  voltava a "" e o texto sumia — sem aviso, e com o navegador descartando abas
 *  para liberar memória, a janela de perda era indefinida.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { ATRASO_DO_RASCUNHO_MS, criarRascunho } from "./rascunhoAutosalvo";

/** Um rascunho com `salvar` espionado e resolução controlável. */
function montar(opts: { falha?: boolean; lento?: boolean } = {}) {
  const salvos: string[] = [];
  let liberar: (() => void) | null = null;
  const salvar = vi.fn(async (v: string) => {
    salvos.push(v);
    if (opts.lento) await new Promise<void>((r) => { liberar = r; });
    if (opts.falha) throw new Error("rede caiu");
  });
  const estados: string[] = [];
  const r = criarRascunho<string>({
    salvar, inicial: "",
    aoMudarEstado: (e) => estados.push(e),
  });
  return { r, salvar, salvos, estados, liberar: () => liberar?.() };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("o debounce", () => {
  it(`salva ${ATRASO_DO_RASCUNHO_MS}ms depois da última tecla`, async () => {
    const { r, salvos } = montar();
    r.digitar("a");
    vi.advanceTimersByTime(ATRASO_DO_RASCUNHO_MS - 1);
    expect(salvos).toEqual([]);
    vi.advanceTimersByTime(1);
    await vi.runAllTimersAsync();
    expect(salvos).toEqual(["a"]);
  });

  it("cada tecla nova reinicia a contagem", async () => {
    const { r, salvos } = montar();
    r.digitar("a");
    vi.advanceTimersByTime(400);
    r.digitar("ab");
    vi.advanceTimersByTime(400);
    r.digitar("abc");
    // 800ms desde a primeira tecla, e nada salvo: a contagem reiniciou duas vezes.
    expect(salvos).toEqual([]);
    await vi.advanceTimersByTimeAsync(ATRASO_DO_RASCUNHO_MS);
    expect(salvos).toEqual(["abc"]);
  });

  it("várias alterações rápidas resultam em UM save, com o último valor", async () => {
    const { r, salvar, salvos } = montar();
    for (const t of ["a", "ab", "abc", "abcd", "abcde"]) {
      r.digitar(t);
      vi.advanceTimersByTime(50);
    }
    await vi.advanceTimersByTimeAsync(ATRASO_DO_RASCUNHO_MS);
    expect(salvar).toHaveBeenCalledTimes(1);
    expect(salvos).toEqual(["abcde"]);
  });

  it("voltar ao texto já salvo cancela o save pendente", async () => {
    const { r, salvar } = montar();
    r.digitar("a");
    await vi.advanceTimersByTimeAsync(ATRASO_DO_RASCUNHO_MS);
    expect(salvar).toHaveBeenCalledTimes(1);
    r.digitar("ab");
    r.digitar("a"); // desfez
    await vi.advanceTimersByTimeAsync(ATRASO_DO_RASCUNHO_MS * 2);
    expect(salvar).toHaveBeenCalledTimes(1);
  });
});

describe("o flush — visibilitychange e blur", () => {
  it("salva imediatamente o que está pendente", async () => {
    const { r, salvos } = montar();
    r.digitar("a");
    r.flush();
    await vi.runAllTimersAsync();
    expect(salvos).toEqual(["a"]);
  });

  it("NÃO duplica com o timer que estava agendado", async () => {
    // Digitar e trocar de aba imediatamente: sem o cancelamento do timer, o
    // flush salvaria agora e o debounce salvaria de novo meio segundo depois.
    const { r, salvar } = montar();
    r.digitar("a");
    r.flush();
    await vi.advanceTimersByTimeAsync(ATRASO_DO_RASCUNHO_MS * 3);
    expect(salvar).toHaveBeenCalledTimes(1);
  });

  it("dois flushes seguidos (blur + visibilitychange) geram um save só", async () => {
    const { r, salvar } = montar();
    r.digitar("a");
    r.flush();
    r.flush();
    await vi.runAllTimersAsync();
    expect(salvar).toHaveBeenCalledTimes(1);
  });

  it("sem pendência, o flush não chama nada", async () => {
    const { r, salvar } = montar();
    r.flush();
    await vi.runAllTimersAsync();
    expect(salvar).not.toHaveBeenCalled();
  });

  it("flush durante um save em curso não abre um segundo", async () => {
    const { r, salvar, liberar } = montar({ lento: true });
    r.digitar("a");
    await vi.advanceTimersByTimeAsync(ATRASO_DO_RASCUNHO_MS);
    expect(salvar).toHaveBeenCalledTimes(1);
    r.digitar("ab");
    r.flush();
    expect(salvar).toHaveBeenCalledTimes(1);
    liberar();
    // O que ficou pendente durante a requisição é salvo depois dela.
    await vi.advanceTimersByTimeAsync(ATRASO_DO_RASCUNHO_MS * 2);
    expect(salvar).toHaveBeenCalledTimes(2);
  });
});

describe("erro não apaga o que está na tela", () => {
  it("o conteúdo local sobrevive à falha, e a pendência continua", async () => {
    const { r, salvos } = montar({ falha: true });
    r.digitar("importante");
    await vi.advanceTimersByTimeAsync(ATRASO_DO_RASCUNHO_MS);
    expect(salvos).toEqual(["importante"]);
    expect(r.estado()).toBe("erro");
    // Ainda pendente: a próxima tecla tenta de novo em vez de dar por salvo.
    expect(r.temPendencia()).toBe(true);
  });

  it("a tecla seguinte reagenda depois de um erro", async () => {
    const { r, salvar } = montar({ falha: true });
    r.digitar("a");
    await vi.advanceTimersByTimeAsync(ATRASO_DO_RASCUNHO_MS);
    r.digitar("ab");
    await vi.advanceTimersByTimeAsync(ATRASO_DO_RASCUNHO_MS);
    expect(salvar).toHaveBeenCalledTimes(2);
  });
});

describe("o servidor não sobrescreve edição local", () => {
  it("resposta antiga é IGNORADA enquanto há pendência", () => {
    // O caso concreto: a query recarrega e devolve o texto de antes, enquanto a
    // pessoa acabou de digitar. Adotá-lo apagaria o que ela escreveu.
    const { r } = montar();
    r.digitar("o que acabei de escrever");
    expect(r.adotarDoServidor("versão antiga do servidor")).toBeNull();
  });

  it("sem pendência, o valor do servidor é adotado", async () => {
    const { r } = montar();
    r.digitar("a");
    await vi.advanceTimersByTimeAsync(ATRASO_DO_RASCUNHO_MS);
    expect(r.adotarDoServidor("veio do banco")).toBe("veio do banco");
    expect(r.temPendencia()).toBe(false);
  });

  it("depois de adotar, o mesmo texto não vira pendência", async () => {
    const { r, salvar } = montar();
    r.adotarDoServidor("do banco");
    r.digitar("do banco");
    await vi.advanceTimersByTimeAsync(ATRASO_DO_RASCUNHO_MS * 2);
    expect(salvar).not.toHaveBeenCalled();
  });
});

describe("os estados que a tela mostra", () => {
  it("pendente → salvando → salvo", async () => {
    const { r, estados } = montar();
    r.digitar("a");
    await vi.advanceTimersByTimeAsync(ATRASO_DO_RASCUNHO_MS);
    expect(estados).toEqual(["pendente", "salvando", "salvo"]);
  });

  it("falha termina em erro, e não em salvo", async () => {
    const { r, estados } = montar({ falha: true });
    r.digitar("a");
    await vi.advanceTimersByTimeAsync(ATRASO_DO_RASCUNHO_MS);
    expect(estados.at(-1)).toBe("erro");
    expect(estados).not.toContain("salvo");
  });
});

describe("a máquina não conhece IA — a separação é estrutural", () => {
  it("o módulo não importa nada de modelo, e não tem como chamar um", () => {
    // Não é promessa em comentário: `salvar` é o ÚNICO efeito que ela executa,
    // e quem a constrói escolhe o que essa função faz.
    const fonte = readFileSync(new URL("./rascunhoAutosalvo.ts", import.meta.url), "utf-8");
    for (const proibido of ["invokeLLM", "refreshAccountAiStatus", "anthropic", "trpc"]) {
      expect(fonte.toLowerCase(), proibido).not.toContain(proibido.toLowerCase());
    }
  });

  it("um save é um save — nada mais é disparado", async () => {
    const { r, salvar } = montar();
    for (const t of ["a", "ab", "abc"]) {
      r.digitar(t);
      await vi.advanceTimersByTimeAsync(ATRASO_DO_RASCUNHO_MS);
    }
    // Três pausas, três writes, zero de qualquer outra coisa.
    expect(salvar).toHaveBeenCalledTimes(3);
  });
});

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  A fiação — que o autosave não passe perto da IA
 * ─────────────────────────────────────────────────────────────────────────────
 *  Testes de fonte, porque a garantia é de FIAÇÃO: nenhum compilador impede
 *  alguém de acrescentar um `refreshStatus.mutate()` ao lado do save, e o
 *  sintoma seria uma conta de API subindo sem nada quebrar.
 * ─────────────────────────────────────────────────────────────────────────────
 */
describe("o autosave não gera análise", () => {
  const semComentarios = (t: string) =>
    t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\/[^\n]*/g, "");
  const fonte = (p: string) =>
    semComentarios(readFileSync(new URL(p, import.meta.url), "utf-8"));

  it("a função que o rascunho salva só chama upsert de contexto", () => {
    const s = fonte("../client/src/components/AccountHeader.tsx");
    const bloco = s.slice(s.indexOf("const rascunho = useRascunhoAutosalvo("),
      s.indexOf("const upsertContextSilencioso"));
    expect(bloco).toContain("upsertContextSilencioso.mutateAsync");
    for (const proibido of ["refreshStatus", "invokeLLM", "refreshAccountAiStatus"]) {
      expect(bloco, proibido).not.toContain(proibido);
    }
  });

  it("a mutation do autosave é distinta da do botão", () => {
    // A do botão invalida `analiseVigente` e mostra toast; a do autosave não
    // faz nem uma coisa nem outra.
    const s = fonte("../client/src/components/AccountHeader.tsx");
    expect(s).toContain("const upsertContextSilencioso = trpc.context.upsertAccount.useMutation();");
  });

  it("o hook não conhece IA", () => {
    const s = fonte("../client/src/hooks/useRascunhoAutosalvo.tsx");
    for (const proibido of ["refreshStatus", "invokeLLM", "refreshAccountAiStatus", "analiseVigente"]) {
      expect(s, proibido).not.toContain(proibido);
    }
  });

  it("a procedure que grava contexto não toca no modelo", () => {
    const s = fonte("../server/routers.ts");
    const bloco = s.slice(s.indexOf("upsertAccount: protectedProcedure"),
      s.indexOf("getAgency: protectedProcedure"));
    expect(bloco).toContain("upsertAccountContext");
    for (const proibido of ["invokeLLM", "refreshAccountAiStatus"]) {
      expect(bloco, proibido).not.toContain(proibido);
    }
  });

  it("a confirmação explícita CONTINUA gerando a análise", () => {
    // O outro lado da separação: o botão precisa seguir funcionando.
    const s = fonte("../client/src/components/AccountHeader.tsx");
    expect(s).toContain("refreshStatus.mutate({ accountId: selectedAccountId })");
  });

  it("o botão garante o texto no banco antes de gerar", () => {
    const s = fonte("../client/src/components/AccountHeader.tsx");
    const bloco = s.slice(s.indexOf("async function salvarContextoDoResumo"),
      s.indexOf("function saveContext"));
    expect(bloco).toContain("rascunho.flush()");
    expect(bloco).toContain("quickContext: rascunho.valor");
  });

  it("a regra de frescor da IA não foi tocada", () => {
    // O autosave existe para deixar editar sem gastar. A régua que decide
    // quando gerar continua sendo a mesma.
    const s = fonte("../shared/frescorDaAnalise.ts");
    expect(s).toContain("AI_STATUS_FRESHNESS_MINUTES = 180");
    expect(s).toContain('motivo: "contexto_mudou"');
  });
});

describe("o rascunho sobrevive à saída da página", () => {
  it("o hook escuta visibilitychange, blur e pagehide", () => {
    const s = readFileSync(new URL("../client/src/hooks/useRascunhoAutosalvo.tsx", import.meta.url), "utf-8");
    for (const ev of ["visibilitychange", "blur", "pagehide"]) {
      expect(s, ev).toContain(`"${ev}"`);
    }
  });

  it("o desmonte grava antes de descartar a máquina", () => {
    // Navegar dentro do Tracker desmonta sem passar por visibilitychange.
    const s = readFileSync(new URL("../client/src/hooks/useRascunhoAutosalvo.tsx", import.meta.url), "utf-8");
    const cleanup = s.slice(s.indexOf("return () => {"), s.indexOf("}, [opts.chave]"));
    expect(cleanup.indexOf("flush()")).toBeLessThan(cleanup.indexOf("cancelar()"));
  });

  it("só salva quando a aba SOME, e não ao voltar", () => {
    const s = readFileSync(new URL("../client/src/hooks/useRascunhoAutosalvo.tsx", import.meta.url), "utf-8");
    expect(s).toContain("if (document.hidden) aoSair()");
  });

  it("o texto vem do banco ao voltar — não de localStorage", () => {
    // Reusa `account_context`, que já existia. Sem armazenamento paralelo.
    const s = readFileSync(new URL("../client/src/hooks/useRascunhoAutosalvo.tsx", import.meta.url), "utf-8");
    expect(s).not.toContain("localStorage");
    expect(s).toContain("doServidor");
  });
});

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Os painéis completos usam a MESMA máquina
 * ─────────────────────────────────────────────────────────────────────────────
 *  Doze campos que só iam ao banco no clique de Salvar. A exigência era não
 *  criar um terceiro mecanismo — então o que muda é só quem é dono do estado.
 * ─────────────────────────────────────────────────────────────────────────────
 */
describe("formulário de vários campos, uma máquina só", () => {
  /** Um objeto de campos, como os painéis montam. */
  const montar = () => {
    const salvos: Record<string, unknown>[] = [];
    const salvar = vi.fn(async (v: Record<string, unknown>) => { salvos.push(v); });
    const r = criarRascunho<Record<string, unknown>>({
      salvar, inicial: { a: "", b: "" },
      // A mesma comparação estrutural que o hook usa: os painéis remontam o
      // objeto a cada render, e `===` acusaria mudança em todo ciclo.
      iguais: (x, y) => JSON.stringify(x) === JSON.stringify(y),
    });
    return { r, salvar, salvos };
  };

  it("remontar o MESMO objeto não gera write", () => {
    // Sem a comparação estrutural, seria um save por render.
    const { r, salvar } = montar();
    for (let i = 0; i < 5; i++) r.digitar({ a: "", b: "" });
    vi.advanceTimersByTime(ATRASO_DO_RASCUNHO_MS * 2);
    expect(salvar).not.toHaveBeenCalled();
  });

  it("mudar UM campo agenda, e salva o objeto inteiro", async () => {
    const { r, salvos } = montar();
    r.digitar({ a: "x", b: "" });
    await vi.advanceTimersByTimeAsync(ATRASO_DO_RASCUNHO_MS);
    expect(salvos).toEqual([{ a: "x", b: "" }]);
  });

  it("mudanças em campos DIFERENTES em sequência viram um save só", async () => {
    const { r, salvar, salvos } = montar();
    r.digitar({ a: "x", b: "" });
    vi.advanceTimersByTime(200);
    r.digitar({ a: "x", b: "y" });
    await vi.advanceTimersByTimeAsync(ATRASO_DO_RASCUNHO_MS);
    expect(salvar).toHaveBeenCalledTimes(1);
    expect(salvos[0]).toEqual({ a: "x", b: "y" });
  });

  it("array dentro do objeto entra na comparação", async () => {
    // Eventos e restrições são listas; `===` nunca as veria mudar.
    const salvos: unknown[] = [];
    const r = criarRascunho<{ eventos: string[] }>({
      salvar: async (v) => { salvos.push(v); },
      inicial: { eventos: [] },
      iguais: (x, y) => JSON.stringify(x) === JSON.stringify(y),
    });
    r.digitar({ eventos: ["um"] });
    await vi.advanceTimersByTimeAsync(ATRASO_DO_RASCUNHO_MS);
    expect(salvos).toEqual([{ eventos: ["um"] }]);
  });

  it("flush do formulário salva o objeto pendente", async () => {
    const { r, salvos } = montar();
    r.digitar({ a: "x", b: "y" });
    r.flush();
    await vi.runAllTimersAsync();
    expect(salvos).toEqual([{ a: "x", b: "y" }]);
  });

  it("erro mantém o objeto pendente para a próxima tentativa", async () => {
    const salvar = vi.fn(async () => { throw new Error("rede"); });
    const r = criarRascunho<{ a: string }>({
      salvar, inicial: { a: "" },
      iguais: (x, y) => JSON.stringify(x) === JSON.stringify(y),
    });
    r.digitar({ a: "importante" });
    await vi.advanceTimersByTimeAsync(ATRASO_DO_RASCUNHO_MS);
    expect(r.estado()).toBe("erro");
    expect(r.temPendencia()).toBe(true);
  });
});

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Os TRÊS pontos de contexto, e nenhum deles chama IA
 * ─────────────────────────────────────────────────────────────────────────────
 */
describe("os três autosaves de contexto", () => {
  const semComentarios = (t: string) =>
    t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\/[^\n]*/g, "");
  const fonte = (p: string) => semComentarios(readFileSync(new URL(p, import.meta.url), "utf-8"));

  const PONTOS: Array<[string, string]> = [
    ["contexto rápido", "../client/src/components/AccountHeader.tsx"],
    ["painel completo", "../client/src/components/ContextPanel.tsx"],
    ["contexto geral", "../client/src/components/ContextoGeralPanel.tsx"],
  ];

  it("todos usam a mesma infraestrutura — não há um terceiro mecanismo", () => {
    for (const [nome, p] of PONTOS) {
      expect(fonte(p), nome).toContain('from "@/hooks/useRascunhoAutosalvo"');
    }
    // E o hook usa a máquina pura, uma só.
    const hook = fonte("../client/src/hooks/useRascunhoAutosalvo.tsx");
    expect(hook.match(/criarRascunho</g)?.length).toBe(2); // campo único + formulário
    expect(hook).toContain('from "@shared/rascunhoAutosalvo"');
  });

  it("nenhum autosave chama IA", () => {
    for (const [nome, p] of PONTOS) {
      const s = fonte(p);
      // O bloco do autosave de cada um.
      const i = s.indexOf("upsertContextSilencioso") >= 0
        ? s.indexOf("upsertContextSilencioso")
        : s.indexOf("upsertSilencioso");
      expect(i, `${nome}: mutation silenciosa não encontrada`).toBeGreaterThan(-1);
      const bloco = s.slice(i, i + 700);
      for (const proibido of ["invokeLLM", "refreshAccountAiStatus", "refreshStatus"]) {
        expect(bloco, `${nome} · ${proibido}`).not.toContain(proibido);
      }
    }
  });

  it("nenhum autosave manda confirmarParaIA", () => {
    // É isso que impede o cron das 06:00 de regerar por causa de digitação.
    for (const [nome, p] of PONTOS) {
      const s = fonte(p);
      const i = s.indexOf("useRascunhoDeFormulario") >= 0
        ? s.indexOf("useRascunhoDeFormulario")
        : s.indexOf("useRascunhoAutosalvo({");
      const bloco = s.slice(i, s.indexOf("payload", i) > i ? s.indexOf("payload", i) : i + 500);
      expect(bloco, nome).not.toContain("confirmarParaIA");
    }
  });

  it("os dois painéis confirmam pelo botão, e só por ele", () => {
    for (const p of ["../client/src/components/ContextPanel.tsx",
      "../client/src/components/ContextoGeralPanel.tsx"]) {
      const s = fonte(p);
      const botao = s.slice(s.indexOf("function save()"), s.indexOf("function save()") + 500);
      expect(botao, p).toContain("confirmarParaIA: true");
      // E o botão garante o texto no banco antes de confirmar.
      expect(botao, p).toContain("rascunho.flush()");
    }
  });

  it("os painéis montam o payload num lugar só", () => {
    // Autosave, botão e adoção passam pelo mesmo montador; três montagens
    // separadas divergiriam e uma esqueceria um campo sem ninguém notar.
    for (const p of ["../client/src/components/ContextPanel.tsx",
      "../client/src/components/ContextoGeralPanel.tsx"]) {
      const s = fonte(p);
      // Os DOIS usos: a adoção do servidor e o payload que autosave e botão
      // compartilham. A definição é arrow e não conta como chamada.
      expect(s, p).toContain("rascunho.adotarDoServidor(montarPayload(");
      expect(s, p).toContain("useMemo(() => montarPayload(");
    }
  });

  it("a adoção do servidor acontece no efeito de carga", () => {
    // Num efeito posterior, os setState ainda não valeriam e o autosave
    // gravaria vazio por cima do contexto real.
    for (const p of ["../client/src/components/ContextPanel.tsx",
      "../client/src/components/ContextoGeralPanel.tsx"]) {
      const s = fonte(p);
      const carga = s.slice(s.indexOf("}, [ctx]") - 1800, s.indexOf("}, [ctx]"));
      expect(carga, p).toContain("rascunho.adotarDoServidor(montarPayload(");
    }
  });

  it("o indicador é o mesmo componente nos três", () => {
    const hook = fonte("../client/src/hooks/useRascunhoAutosalvo.tsx");
    expect(hook).toContain("export function IndicadorDeRascunho");
    for (const p of ["../client/src/components/ContextPanel.tsx",
      "../client/src/components/ContextoGeralPanel.tsx"]) {
      expect(fonte(p), p).toContain("<IndicadorDeRascunho estado={rascunho.estado}");
    }
  });
});
