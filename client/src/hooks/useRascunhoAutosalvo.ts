/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  useRascunhoAutosalvo — só a fiação
 * ─────────────────────────────────────────────────────────────────────────────
 *  Toda a decisão de QUANDO salvar vive em `shared/rascunhoAutosalvo`, que é
 *  pura e testada com relógio falso. Aqui só se ligam os três eventos que o
 *  navegador dá: digitação, `visibilitychange` e `blur`.
 *
 *  ── Por que os dois eventos, e não só um ───────────────────────────────────
 *  `visibilitychange` cobre trocar de aba e minimizar; `blur` cobre trocar de
 *  janela ou de aplicativo, onde a aba segue "visível". Os dois chamam o mesmo
 *  `flush`, e a máquina garante que dois disparos seguidos gerem um save só.
 *
 *  ── O desmonte salva antes de sair ─────────────────────────────────────────
 *  Navegar dentro do Tracker desmonta o componente sem passar por
 *  `visibilitychange`. O flush no cleanup é o que impede a perda que originou
 *  esta frente — e ele não bloqueia a navegação: dispara a requisição e segue.
 *
 *  ── Nenhuma IA passa por aqui ──────────────────────────────────────────────
 *  O hook recebe `salvar` e não sabe o que ela faz. Quem o usa passa a mutation
 *  de contexto, que grava e nada mais.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  criarRascunho, type EstadoDoRascunho, type Rascunho,
} from "@shared/rascunhoAutosalvo";

export function useRascunhoAutosalvo(opts: {
  /** Persiste o valor. Só isso — nada de gerar análise. */
  salvar: (valor: string) => Promise<unknown>;
  /** O que veio do servidor. Adotado só quando não há edição local pendente. */
  doServidor: string | undefined;
  /** Muda de conta = outro rascunho. Recria a máquina. */
  chave: string | number | null;
}) {
  const [valor, setValor] = useState("");
  const [estado, setEstado] = useState<EstadoDoRascunho>("limpo");
  const rascunho = useRef<Rascunho<string> | null>(null);
  // A função de salvar entra por ref: ela muda a cada render (é uma mutation do
  // tRPC), e recriar a máquina a cada render perderia o timer pendente.
  const salvarRef = useRef(opts.salvar);
  salvarRef.current = opts.salvar;

  // Uma máquina por conta. Trocar de cliente no meio da digitação não pode
  // fazer o texto de um cair no contexto do outro.
  useEffect(() => {
    const inicial = opts.doServidor ?? "";
    setValor(inicial);
    setEstado("limpo");
    rascunho.current = criarRascunho<string>({
      inicial,
      salvar: (v) => salvarRef.current(v),
      aoMudarEstado: setEstado,
    });
    return () => {
      // Antes de trocar de conta: grava o que estiver pendente e só então
      // descarta a máquina.
      rascunho.current?.flush();
      rascunho.current?.cancelar();
    };
    // `doServidor` de propósito fora: ele chega depois, e recriar a máquina
    // quando a query responde apagaria o que já foi digitado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.chave]);

  /** O servidor respondeu — a máquina decide se pode adotar. */
  useEffect(() => {
    if (opts.doServidor === undefined) return;
    const adotado = rascunho.current?.adotarDoServidor(opts.doServidor);
    if (adotado !== null && adotado !== undefined) setValor(adotado);
  }, [opts.doServidor]);

  const digitar = useCallback((v: string) => {
    setValor(v);
    rascunho.current?.digitar(v);
  }, []);

  /** Para o botão de confirmar: garante que o texto está no banco antes de gerar. */
  const flush = useCallback(() => rascunho.current?.flush(), []);

  useEffect(() => {
    const aoSair = () => rascunho.current?.flush();
    // `visibilitychange` só quando a aba SOME — ao voltar não há o que salvar.
    const aoTrocarVisibilidade = () => { if (document.hidden) aoSair(); };
    document.addEventListener("visibilitychange", aoTrocarVisibilidade);
    window.addEventListener("blur", aoSair);
    /*
     * `pagehide` e não `beforeunload`: o segundo não dispara em navegador móvel
     * quando a aba é descartada, que é exatamente o cenário desta frente.
     */
    window.addEventListener("pagehide", aoSair);
    return () => {
      document.removeEventListener("visibilitychange", aoTrocarVisibilidade);
      window.removeEventListener("blur", aoSair);
      window.removeEventListener("pagehide", aoSair);
    };
  }, []);

  return { valor, digitar, estado, flush };
}
