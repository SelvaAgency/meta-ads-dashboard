/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Leitura da aba Monitoramento — a lógica de exibição, fora do componente
 * ─────────────────────────────────────────────────────────────────────────────
 *  Tudo aqui é puro. O motivo é o mesmo do avaliador no servidor: a frase que
 *  esta tela mostra é a diferença entre "está tudo bem" e "seu domínio está
 *  sendo sequestrado agora", e essa decisão precisa ser exercitável sem montar
 *  React, sem rede e sem banco.
 *
 *  O "agora" ENTRA como argumento — senão o teste de "há quanto tempo" passaria
 *  hoje e falharia amanhã.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type Tom = "off" | "ok" | "atencao" | "critico";

export interface MetricasDia {
  checagens?: number;
  anomalias?: number;
  ultimaEm?: string;
  ultimaSeveridade?: string;
  ultima?: Record<string, unknown>;
  achados?: { chave: string; sev: string; titulo: string }[];
}

export interface Painel {
  configurado: boolean;
  ativo: boolean;
  dominioEsperado: string | null;
  ultimaVerificacaoEm: string | Date | null;
  suspeita: { chave: string; titulo: string; ciclos: number; desde: string; confirmada: boolean } | null;
  confirmacoesNecessarias: number;
  hoje: { dns: MetricasDia | null; redirect: MetricasDia | null };
  nsBaseline?: string[] | null;
  eventos: { em: string; dia: string; tipo: string; chave: string; detalhe: string }[];
}

/**
 * Há quanto tempo. Aproximado de propósito: a pergunta que a tela responde é
 * "isso está fresco?", e "há 3 min" responde melhor que "14:32:07".
 */
export function haQuantoTempo(quando: string | Date | null | undefined, agoraMs: number): string {
  if (!quando) return "nunca";
  const t = quando instanceof Date ? quando.getTime() : Date.parse(quando);
  if (!Number.isFinite(t)) return "nunca";
  const seg = Math.max(0, Math.round((agoraMs - t) / 1000));
  if (seg < 90) return "agora há pouco";
  const min = Math.round(seg / 60);
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h}h`;
  return `há ${Math.round(h / 24)}d`;
}

/**
 * A frase de estado do topo da aba.
 *
 * A ordem das perguntas é a regra: uma suspeita CONFIRMADA precede qualquer
 * outra coisa que a tela pudesse dizer. Perguntar antes "quantas checagens
 * houve hoje" produziria "12 verificações, nenhuma anomalia" numa tela que
 * deveria estar gritando.
 */
export function resumoDeEstado(p: Painel, agoraMs: number): { tom: Tom; frase: string; detalhe?: string } {
  if (!p.configurado) {
    return { tom: "off", frase: "Monitoramento não configurado para este cliente." };
  }
  if (!p.dominioEsperado) {
    return { tom: "off", frase: "Sem domínio esperado — o robô não tem contra o que comparar." };
  }
  if (!p.ativo) {
    return { tom: "off", frase: "Monitoramento desligado.", detalhe: `Domínio configurado: ${p.dominioEsperado}` };
  }
  if (p.suspeita?.confirmada) {
    return {
      tom: "critico",
      frase: p.suspeita.titulo,
      detalhe: `Confirmado em ${p.suspeita.ciclos} leituras. Alerta enviado.`,
    };
  }
  if (p.suspeita) {
    return {
      tom: "atencao",
      frase: `${p.suspeita.titulo} — aguardando confirmação`,
      detalhe: `${p.suspeita.ciclos} de ${p.confirmacoesNecessarias} leituras. Nada foi alertado ainda.`,
    };
  }
  if (!p.ultimaVerificacaoEm) {
    return { tom: "atencao", frase: "Ligado — aguardando a primeira leitura.", detalhe: "O robô verifica a cada 5 minutos." };
  }
  const anomalias = (p.hoje.dns?.anomalias ?? 0) + (p.hoje.redirect?.anomalias ?? 0);
  return {
    tom: "ok",
    frase: `Sem anomalias em ${p.dominioEsperado}.`,
    detalhe: anomalias > 0
      ? `Última verificação ${haQuantoTempo(p.ultimaVerificacaoEm, agoraMs)}. ${anomalias} leitura(s) com atenção hoje — veja o histórico.`
      : `Última verificação ${haQuantoTempo(p.ultimaVerificacaoEm, agoraMs)}.`,
  };
}

/** Total de checagens do dia, somando os dois coletores. */
export const checagensDoDia = (p: Painel): number =>
  (p.hoje.dns?.checagens ?? 0) + (p.hoje.redirect?.checagens ?? 0);

export const anomaliasDoDia = (p: Painel): number =>
  (p.hoje.dns?.anomalias ?? 0) + (p.hoje.redirect?.anomalias ?? 0);

export const TOM_EVENTO: Record<string, Tom> = {
  confirmado: "critico",
  suspeita: "atencao",
  instabilidade: "ok",
  normalizado: "ok",
};

/**
 * Evidência da última leitura, em linhas legíveis.
 *
 * Mapa explícito em vez de despejar o JSON: quem abre esta aba vindo de um
 * alerta precisa ler "Chegou em", não `finalUrl`. Chave sem rótulo não aparece
 * — evidência nova entra quando alguém decidir como ela se lê.
 */
const CAMPOS: [string, string][] = [
  ["ns", "Nameservers"],
  ["a", "Endereços IP"],
  ["erroCodigo", "Código do erro"],
  ["finalUrl", "URL final"],
  ["statusCode", "Resposta HTTP"],
  ["saltos", "Redirecionamentos"],
  ["cadeia", "Caminho"],
  ["canonical", "Canonical"],
  ["tituloTrecho", "Título da página"],
  ["erro", "Erro"],
  ["emMs", "Tempo de resposta"],
];

export function linhasDaLeitura(leitura: Record<string, unknown> | null | undefined): { rotulo: string; valor: string }[] {
  if (!leitura) return [];
  const out: { rotulo: string; valor: string }[] = [];
  for (const [chave, rotulo] of CAMPOS) {
    const v = leitura[chave];
    if (v == null || v === "" || (Array.isArray(v) && v.length === 0)) continue;
    const valor = Array.isArray(v) ? v.join(" → ") : String(v);
    out.push({ rotulo, valor: chave === "emMs" ? `${valor} ms` : valor.slice(0, 300) });
  }
  return out;
}
