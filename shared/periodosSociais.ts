/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Que períodos a coleta permite oferecer
 * ─────────────────────────────────────────────────────────────────────────────
 *  Puro, compartilhado, e existe para a tela não mentir.
 *
 *  Um seletor de período que oferece "30 dias" com três dias de histórico devolve
 *  um número — e esse número é o de três dias, com o rótulo de trinta. Ninguém
 *  percebe: é plausível, tem casa decimal, e cai numa comparação como se fosse
 *  comparável. Era o estado da página até aqui, e é o que este módulo impede.
 *
 *  ── Desabilitado, e não escondido ──────────────────────────────────────────
 *  Preset indisponível continua VISÍVEL, apagado, com o motivo. Sumir faria a
 *  tela parecer que só existem duas opções, e a opção nova apareceria do nada
 *  duas semanas depois. Apagado com motivo, ele ensina que a medição começou
 *  agora e mostra quando vai liberar.
 *
 *  Datas são strings YYYY-MM-DD do começo ao fim: `new Date` aqui converteria
 *  para UTC e deslocaria a virada do dia em três horas de fuso.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type PresetSocial = "hoje" | "7d" | "30d" | "mesAtual" | "mesAnterior";

export const ROTULO_PRESET: Record<PresetSocial, string> = {
  hoje: "Hoje",
  "7d": "7 dias",
  "30d": "30 dias",
  mesAtual: "Mês atual",
  mesAnterior: "Mês anterior",
};

/** Dias de série necessários para a variação deixar de ser ruído. */
export const DIAS_PARA_TENDENCIA = 14;

export interface DisponibilidadeDePeriodo {
  preset: PresetSocial;
  rotulo: string;
  disponivel: boolean;
  /** Por que não dá. Vazio quando disponível. */
  motivo: string | null;
  /** Dia (YYYY-MM-DD) em que este preset passa a existir. */
  liberaEm: string | null;
}

const DIA = 86_400_000;

/** Aritmética de dia em UTC puro: entra string, sai string, sem fuso no meio. */
export function somarDias(dia: string, n: number): string {
  const [a, m, d] = dia.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d) + n * DIA).toISOString().slice(0, 10);
}

export function diasEntre(de: string, ate: string): number {
  const [a1, m1, d1] = de.split("-").map(Number);
  const [a2, m2, d2] = ate.split("-").map(Number);
  return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / DIA);
}

/**
 * Quantos dias de série existem, contando as duas pontas.
 *
 * `null` quando nunca se coletou — que é diferente de zero dias: zero seria
 * "coletamos e não deu nada".
 */
export function diasDeColeta(coletaDesde: string | null, hoje: string): number | null {
  if (!coletaDesde) return null;
  return Math.max(0, diasEntre(coletaDesde, hoje) + 1);
}

/** Quantos dias cada preset exige para não ser uma janela pela metade. */
const EXIGE: Record<PresetSocial, number> = {
  hoje: 0,       // leitura ao vivo, não depende de histórico
  "7d": 7,
  "30d": 30,
  mesAtual: 1,   // basta ter começado dentro do mês
  mesAnterior: 1,
};

export function periodosDisponiveis(a: {
  coletaDesde: string | null;
  hoje: string;
}): DisponibilidadeDePeriodo[] {
  const dias = diasDeColeta(a.coletaDesde, a.hoje);

  return (Object.keys(EXIGE) as PresetSocial[]).map((preset) => {
    const rotulo = ROTULO_PRESET[preset];

    // "Hoje" é sempre possível: ele não vem de snapshot, vem da API ao vivo.
    if (preset === "hoje") {
      return { preset, rotulo, disponivel: true, motivo: null, liberaEm: null };
    }
    if (dias === null || a.coletaDesde === null) {
      return {
        preset, rotulo, disponivel: false, liberaEm: null,
        motivo: "A coleta ainda não começou. Só a leitura de hoje está disponível.",
      };
    }

    // Mês anterior exige que a coleta tenha começado ANTES dele terminar —
    // senão o mês existiria com metade dos dias e pareceria um mês fraco.
    if (preset === "mesAnterior") {
      const primeiroDoMes = `${a.hoje.slice(0, 7)}-01`;
      const ultimoDoAnterior = somarDias(primeiroDoMes, -1);
      const primeiroDoAnterior = `${ultimoDoAnterior.slice(0, 7)}-01`;
      const ok = a.coletaDesde <= primeiroDoAnterior;
      return {
        preset, rotulo, disponivel: ok, liberaEm: ok ? null : somarDias(primeiroDoMes, 32).slice(0, 7) + "-01",
        motivo: ok ? null : `A coleta começou em ${brl(a.coletaDesde)}, depois do início do mês anterior. O período ficaria incompleto.`,
      };
    }

    if (preset === "mesAtual") {
      const primeiroDoMes = `${a.hoje.slice(0, 7)}-01`;
      const ok = a.coletaDesde <= primeiroDoMes;
      return {
        preset, rotulo, disponivel: ok, liberaEm: ok ? null : `${somarDias(a.hoje, 32).slice(0, 7)}-01`,
        motivo: ok ? null : `A coleta começou em ${brl(a.coletaDesde)}. O mês atual só fecha completo a partir do mês que vem.`,
      };
    }

    const exigido = EXIGE[preset];
    const ok = dias >= exigido;
    return {
      preset, rotulo, disponivel: ok,
      liberaEm: ok ? null : somarDias(a.coletaDesde, exigido - 1),
      motivo: ok ? null : `Faltam ${exigido - dias} dia(s) de coleta. Disponível a partir de ${brl(somarDias(a.coletaDesde, exigido - 1))}.`,
    };
  });
}

/** A frase de cobertura, que fica acima dos gráficos. */
export function textoDeCobertura(a: { coletaDesde: string | null; hoje: string }): string {
  const dias = diasDeColeta(a.coletaDesde, a.hoje);
  if (dias === null || !a.coletaDesde) {
    return "A medição começa hoje. O histórico aparece a partir de amanhã.";
  }
  if (dias === 1) return `Medindo desde ${brl(a.coletaDesde)} — 1 dia de histórico.`;
  return `Dados disponíveis desde ${brl(a.coletaDesde)} — ${dias} dias de histórico.`;
}

/**
 * Já dá para falar em tendência?
 *
 * Antes de duas semanas, qualquer variação é a única variação que existe, e
 * chamar isso de pico ou queda é apresentar ruído como achado.
 */
export function podeFalarDeTendencia(a: { coletaDesde: string | null; hoje: string }): {
  pode: boolean; motivo: string | null; liberaEm: string | null;
} {
  const dias = diasDeColeta(a.coletaDesde, a.hoje);
  if (dias === null || !a.coletaDesde) {
    return { pode: false, motivo: "A coleta ainda não começou.", liberaEm: null };
  }
  if (dias >= DIAS_PARA_TENDENCIA) return { pode: true, motivo: null, liberaEm: null };
  const libera = somarDias(a.coletaDesde, DIAS_PARA_TENDENCIA - 1);
  return {
    pode: false,
    motivo: `Variação e alertas de pico/queda a partir de ${brl(libera)}, com ${DIAS_PARA_TENDENCIA} dias de série.`,
    liberaEm: libera,
  };
}

const brl = (dia: string): string => {
  const [a, m, d] = dia.split("-");
  return `${d}/${m}/${a}`;
};
