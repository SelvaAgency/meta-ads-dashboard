/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Rascunho autossalvo — a máquina, sem React e sem DOM
 * ─────────────────────────────────────────────────────────────────────────────
 *  Puro de propósito: toda a decisão de QUANDO salvar mora aqui, e por isso
 *  pode ser testada com relógio falso, sem navegador. O hook que a usa só liga
 *  fios — `onChange`, `visibilitychange`, `blur`.
 *
 *  ── O que se perdia antes ──────────────────────────────────────────────────
 *  O contexto rápido vivia em `useState` e só ia ao banco no clique de Salvar.
 *  Trocar de aba desmontava o componente, o estado voltava a `""`, e o texto
 *  digitado sumia sem aviso. Com o navegador descartando abas para liberar
 *  memória, a janela de perda era indefinida.
 *
 *  ── Salvar NÃO é gerar análise ─────────────────────────────────────────────
 *  Esta máquina só conhece a função `salvar` que recebe. Ela não sabe o que é
 *  IA, não importa nada de LLM e não tem como chamar modelo nenhum: a separação
 *  é estrutural, e não uma promessa em comentário.
 *
 *  A vigência da análise continua DERIVADA — `analiseVigente` compara a data da
 *  leitura com a do contexto. Gravar marca a análise como desatualizada
 *  sozinho; a geração acontece quando alguém clica em Atualizar.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * 500ms.
 *
 * Curto porque o risco não é a rede: é o navegador descartar a aba. Cada
 * milissegundo de espera é conteúdo que existe só na memória de uma página que
 * pode sumir. Uma pausa de meio segundo já separa "digitando" de "parou", e
 * gera um write por pausa em vez de um por tecla.
 */
export const ATRASO_DO_RASCUNHO_MS = 500;

export type EstadoDoRascunho = "limpo" | "pendente" | "salvando" | "salvo" | "erro";

export const ROTULO_DO_RASCUNHO: Record<EstadoDoRascunho, string | null> = {
  limpo: null,
  pendente: null,
  salvando: "Salvando…",
  salvo: "Rascunho salvo",
  erro: "Erro ao salvar",
};

export interface Rascunho<T> {
  /** O usuário digitou. Agenda o salvamento e reinicia a contagem. */
  digitar(valor: T): void;
  /** Salva AGORA o que estiver pendente. Sem pendência, não faz nada. */
  flush(): void;
  /** Descarta o agendamento — usado no desmonte, depois do flush. */
  cancelar(): void;
  /**
   * O servidor devolveu um valor. Ele só é adotado se NÃO houver edição local
   * pendente — senão uma resposta antiga apagaria o que a pessoa acabou de
   * escrever.
   */
  adotarDoServidor(valor: T): T | null;
  estado(): EstadoDoRascunho;
  /** `true` enquanto houver diferença entre o digitado e o último salvo. */
  temPendencia(): boolean;
}

export function criarRascunho<T>(opts: {
  /** Persiste. Só isso. Quem passa esta função é quem escolhe o que ela faz. */
  salvar: (valor: T) => Promise<unknown>;
  /** O valor que já está no servidor quando a edição começa. */
  inicial: T;
  atrasoMs?: number;
  aoMudarEstado?: (e: EstadoDoRascunho) => void;
  /** Compara dois valores. O padrão serve para string. */
  iguais?: (a: T, b: T) => boolean;
}): Rascunho<T> {
  const atraso = opts.atrasoMs ?? ATRASO_DO_RASCUNHO_MS;
  const iguais = opts.iguais ?? ((a: T, b: T) => a === b);

  let ultimoSalvo = opts.inicial;
  let atual = opts.inicial;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let emVoo = false;
  let estadoAtual: EstadoDoRascunho = "limpo";

  const mudar = (e: EstadoDoRascunho) => {
    if (e === estadoAtual) return;
    estadoAtual = e;
    opts.aoMudarEstado?.(e);
  };

  const pendente = () => !iguais(atual, ultimoSalvo);

  const limparTimer = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  async function persistir() {
    let deuCerto = false;
    /*
     * ── O flush não pode duplicar o save ────────────────────────────────────
     * Duas portas levam aqui: o timer do debounce e o flush de
     * `visibilitychange`/`blur`. Sem o `limparTimer` no início, digitar e
     * trocar de aba imediatamente dispararia o flush E, meio segundo depois, o
     * timer que já estava agendado — dois writes para uma pausa.
     *
     * `emVoo` cobre a outra metade: um flush durante uma requisição em curso
     * não abre uma segunda. O que estiver pendente ao fim dela é salvo na
     * verificação de cauda, abaixo.
     */
    limparTimer();
    if (emVoo || !pendente()) return;

    const valor = atual;
    emVoo = true;
    mudar("salvando");
    try {
      await opts.salvar(valor);
      ultimoSalvo = valor;
      deuCerto = true;
      mudar(pendente() ? "pendente" : "salvo");
    } catch {
      /*
       * Erro NÃO mexe em `atual`.
       *
       * O conteúdo da tela é do usuário; uma falha de rede não pode apagá-lo
       * nem revertê-lo. `ultimoSalvo` fica como estava, então a pendência
       * continua e a próxima tecla — ou o próximo flush — tenta de novo.
       */
      mudar("erro");
    } finally {
      emVoo = false;
      /*
       * Reagenda SÓ depois de sucesso.
       *
       * Duas razões, e a primeira é visível: `agendar` marca "pendente", então
       * reagendar após uma falha apagava o estado "erro" no mesmo instante — a
       * pessoa nunca via a mensagem, e a tela mentia dizendo que estava tudo
       * em ordem.
       *
       * A segunda é de carga: com a rede fora, um reagendamento automático
       * viraria uma tentativa a cada meio segundo, indefinidamente. Depois de
       * um erro o conteúdo continua pendente e a PRÓXIMA tecla — ou o próximo
       * flush — tenta de novo. Quem está digitando tenta sozinho; quem parou
       * não é cobrado por isso.
       */
      if (deuCerto && pendente()) agendar();
    }
  }

  function agendar() {
    limparTimer();
    mudar("pendente");
    timer = setTimeout(() => { timer = null; void persistir(); }, atraso);
  }

  return {
    digitar(valor) {
      atual = valor;
      if (!pendente()) {
        // Voltou ao que já está salvo — não há o que gravar.
        limparTimer();
        mudar("salvo");
        return;
      }
      agendar();
    },
    flush() {
      if (!pendente()) return;
      void persistir();
    },
    cancelar() {
      limparTimer();
    },
    adotarDoServidor(valor) {
      // Com edição local pendente, o servidor é ignorado: adotá-lo apagaria o
      // que a pessoa escreveu enquanto a resposta viajava.
      if (pendente() || emVoo) return null;
      ultimoSalvo = valor;
      atual = valor;
      return valor;
    },
    estado: () => estadoAtual,
    temPendencia: pendente,
  };
}
