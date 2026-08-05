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
  hoje: { dns: MetricasDia | null; redirect: MetricasDia | null; conteudo?: MetricasDia | null };
  checarConteudo?: boolean;
  ultimaVerificacaoConteudoEm?: string | Date | null;
  termosExtras?: string[] | null;
  termosIgnorados?: string[] | null;
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
  const anomalias = anomaliasDoDia(p);
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
  (p.hoje.dns?.checagens ?? 0) + (p.hoje.redirect?.checagens ?? 0) + (p.hoje.conteudo?.checagens ?? 0);

export const anomaliasDoDia = (p: Painel): number =>
  (p.hoje.dns?.anomalias ?? 0) + (p.hoje.redirect?.anomalias ?? 0) + (p.hoje.conteudo?.anomalias ?? 0);

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
  // Conteúdo
  ["posts", "Posts analisados"],
  ["novos", "Posts novos"],
  ["tentativas", "Fontes tentadas"],
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


// ─── Bloco de conteúdo ──────────────────────────────────────────────────────

export const ROTULO_FONTE: Record<string, string> = {
  rest: "REST API do WordPress",
  rss: "Feed RSS",
  sitemap: "Sitemap",
  html: "HTML da página",
  nenhuma: "não verificado",
};

export interface EstadoConteudo {
  tom: Tom;
  fonte: string;
  frase: string;
  posts: number;
  novos: number;
  suspeitos: number;
}

/**
 * Estado do bloco de conteúdo.
 *
 * O caso que define a honestidade desta função é `fonte: "nenhuma"`: leitura
 * que falhou NÃO pode sair como "ok". Zero posts lidos e zero posts suspeitos
 * viram a mesma tela se ninguém perguntar primeiro se a leitura funcionou — e
 * a tela diria "tudo certo" todo dia com o blog cheio de spam.
 */
export function estadoDoConteudo(p: Painel): EstadoConteudo | null {
  if (!p.checarConteudo) return null;
  const m = p.hoje.conteudo;
  if (!m) {
    return {
      tom: "off", fonte: "—", posts: 0, novos: 0, suspeitos: 0,
      frase: p.ativo
        ? "Ainda não houve leitura do blog hoje. O conteúdo é verificado a cada 30 minutos."
        : "Monitoramento desligado.",
    };
  }
  const ultima = (m.ultima ?? {}) as { fonte?: string; posts?: number; novos?: number };
  const achados = m.achados ?? [];
  const naoVerificado = ultima.fonte === "nenhuma" || achados.some((a) => a.chave === "conteudo_nao_verificado");
  const suspeitos = achados.filter((a) => a.chave === "conteudo_spam" || a.chave === "conteudo_suspeito").length;

  if (naoVerificado) {
    return {
      tom: "atencao", fonte: ROTULO_FONTE.nenhuma, posts: 0, novos: 0, suspeitos: 0,
      frase: "O blog NÃO foi verificado — nenhuma fonte respondeu. Isto não é o mesmo que estar limpo.",
    };
  }
  const critico = achados.some((a) => a.sev === "CRITICAL");
  const atencao = achados.some((a) => a.sev === "WARNING");
  return {
    tom: critico ? "critico" : atencao ? "atencao" : "ok",
    fonte: ROTULO_FONTE[ultima.fonte ?? ""] ?? (ultima.fonte ?? "—"),
    posts: Number(ultima.posts) || 0,
    novos: Number(ultima.novos) || 0,
    suspeitos,
    frase: critico
      ? "Publicação com conteúdo de apostas/cassino."
      : atencao
        ? "Há sinal fraco para olhar no histórico."
        : "Nenhuma publicação suspeita.",
  };
}
