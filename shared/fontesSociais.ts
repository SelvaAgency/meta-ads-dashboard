/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Qual fonte usar para um cliente — e por que a outra não foi usada
 * ─────────────────────────────────────────────────────────────────────────────
 *  Puro, compartilhado entre servidor e tela, para as duas contarem a MESMA
 *  história sobre a mesma conexão.
 *
 *  ── Fallback silencioso é o erro que este módulo existe para evitar ─────────
 *  A regra é simples: OAuth da conta primeiro, token da agência depois. O que
 *  não é simples é o que acontece quando a primeira falha.
 *
 *  Cair para a segunda em silêncio faz um cliente com OAuth EXPIRADO ficar
 *  idêntico a um cliente que nunca conectou por OAuth — os dois aparecem
 *  "conectado via agência", e o aviso de reconectar nunca chega. Pior: no dia
 *  em que o token da agência também morrer, os dois quebram juntos e ninguém
 *  sabe qual precisava de qual conserto.
 *
 *  Por isso a escolha carrega o MOTIVO, e o que foi descartado carrega o dele.
 *  Uma fonte que existe mas está quebrada nunca é substituída caladamente: ela
 *  vira estado visível com o próximo passo escrito.
 *
 *  ── O que é "falhar" aqui ──────────────────────────────────────────────────
 *  Fonte AUSENTE (o cliente nunca conectou por OAuth) não é falha — é a segunda
 *  fonte assumindo normalmente. Fonte PRESENTE E QUEBRADA é falha, e aí a
 *  substituição automática seria esconder um problema que tem dono.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import type { FonteNome } from "./instagram";

/** O que se sabe de uma fonte para este cliente, antes de usá-la. */
export interface EstadoDaFonte {
  fonte: FonteNome;
  /** Existe configuração desta fonte para este cliente? */
  configurada: boolean;
  /** Está utilizável agora? (token vivo, credencial presente) */
  utilizavel: boolean;
  /** Por que não está utilizável. Só faz sentido com configurada=true. */
  problema?: string | null;
  /** Dias até expirar, quando a fonte tem prazo. */
  diasParaExpirar?: number | null;
}

export interface EscolhaDeFonte {
  usada: FonteNome | null;
  titulo: string;
  detalhe: string;
  /** Precisa de ação humana? Governa a cor e o botão na tela. */
  nivel: "ok" | "atencao" | "pendente";
  descartadas: Array<{ fonte: FonteNome; porque: string }>;
}

/** Abaixo disto, a renovação preguiçosa entra ao usar. Ver `fonteInstagramConta`. */
export const DIAS_PARA_RENOVAR = 10;

export const ROTULO_FONTE: Record<FonteNome, string> = {
  oauth_conta: "Login da conta",
  agencia_system_user: "Token da agência",
};

/**
 * Escolhe a fonte na ordem OAuth → agência, sem nunca trocar em silêncio.
 *
 * A ordem dos estados na entrada não importa: a preferência é declarada aqui,
 * uma vez, e não no chamador — duas listas em ordens diferentes escolheriam
 * fontes diferentes para o mesmo cliente.
 */
export function escolherFonte(estados: EstadoDaFonte[]): EscolhaDeFonte {
  const PREFERENCIA: FonteNome[] = ["oauth_conta", "agencia_system_user"];
  const de = (f: FonteNome) => estados.find((e) => e.fonte === f);

  const descartadas: Array<{ fonte: FonteNome; porque: string }> = [];

  for (const nome of PREFERENCIA) {
    const e = de(nome);
    if (!e || !e.configurada) {
      // Ausente não entra em "descartadas": não houve descarte, houve ausência.
      continue;
    }
    if (e.utilizavel) {
      const expirando =
        typeof e.diasParaExpirar === "number" && e.diasParaExpirar <= DIAS_PARA_RENOVAR;
      return {
        usada: nome,
        nivel: expirando ? "atencao" : "ok",
        titulo: `Conectado via ${ROTULO_FONTE[nome].toLowerCase()}`,
        detalhe: expirando
          ? `O token expira em ${e.diasParaExpirar} dia(s). Reconecte antes disso para não perder a leitura.`
          : `Fonte em uso: ${ROTULO_FONTE[nome]}.`,
        descartadas,
      };
    }

    // Configurada e quebrada: PARA aqui. Ver cabeçalho — descer para a próxima
    // esconderia o conserto que só esta fonte tem.
    const proxima = PREFERENCIA.slice(PREFERENCIA.indexOf(nome) + 1)
      .map(de).find((x) => x?.configurada && x.utilizavel);
    return {
      usada: null,
      nivel: "pendente",
      titulo: `${ROTULO_FONTE[nome]} indisponível`,
      detalhe:
        `${e.problema ?? "Fonte indisponível."} ` +
        (proxima
          ? `A ${ROTULO_FONTE[proxima.fonte].toLowerCase()} NÃO é usada automaticamente no lugar — trocar sem avisar esconderia este problema. Reconecte, ou mude a fonte deste cliente.`
          : "Não há outra fonte configurada para este cliente."),
      descartadas: [
        ...descartadas,
        ...(proxima ? [{ fonte: proxima.fonte, porque: "disponível, mas não substitui automaticamente uma fonte quebrada" }] : []),
      ],
    };
  }

  return {
    usada: null,
    nivel: "pendente",
    titulo: "Nenhuma fonte conectada",
    detalhe: "Conecte o Instagram deste cliente pelo login da conta, ou cadastre a credencial da agência.",
    descartadas,
  };
}
