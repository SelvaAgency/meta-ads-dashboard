import { describe, it, expect } from "vitest";
import { destinoDaAba, ABAS_SITE, ROTULO_ABA, SECOES_DA_ABA, type AbaSite } from "./abasSite";

/**
 * Havia 14 alertas NÃO LIDOS em produção apontando para `aba=clarity` e
 * `aba=seguranca` quando a seção Site foi reorganizada. Esses links estão
 * gravados no banco, em texto, e não dá para reescrevê-los.
 *
 * Um alerta que abre na aba errada é pior do que alerta nenhum — ensina o time
 * a ignorar. Estes testes existem para que renomear uma aba nunca mais possa
 * quebrar um link antigo em silêncio.
 */
describe("destino das abas do Site", () => {
  describe("links antigos gravados em alertas", () => {
    it("clarity abre Performance, na seção de comportamento", () => {
      expect(destinoDaAba("clarity")).toEqual({ aba: "performance", secao: "comportamento" });
    });

    it("seguranca abre Técnico, na seção de segurança", () => {
      expect(destinoDaAba("seguranca")).toEqual({ aba: "tecnico", secao: "seguranca" });
    });

    it("uptime abre Técnico, na seção de disponibilidade", () => {
      expect(destinoDaAba("uptime")).toEqual({ aba: "tecnico", secao: "disponibilidade" });
    });

    it("perf abre Técnico, na seção de carregamento", () => {
      expect(destinoDaAba("perf")).toEqual({ aba: "tecnico", secao: "carregamento" });
    });

    it("visao abre Resumo", () => {
      expect(destinoDaAba("visao")).toEqual({ aba: "resumo" });
    });

    /** A aba Relatórios saiu do Site — o gerador vive na página Relatórios. */
    it("relatorios abre Resumo em vez de tela vazia", () => {
      expect(destinoDaAba("relatorios")).toEqual({ aba: "resumo" });
    });

    it("todo nome antigo aponta para uma seção que existe de verdade", () => {
      for (const antigo of ["clarity", "perf", "seguranca", "uptime"]) {
        const d = destinoDaAba(antigo);
        expect(SECOES_DA_ABA[d.aba]).toContain(d.secao!);
      }
    });
  });

  describe("nomes novos", () => {
    it("cada aba atual resolve para ela mesma", () => {
      for (const aba of ABAS_SITE) expect(destinoDaAba(aba)).toEqual({ aba });
    });

    it("as ferramentas continuam alcançáveis por link direto", () => {
      for (const t of ["contexto", "chat"] as AbaSite[]) {
        expect(destinoDaAba(t).aba).toBe(t);
      }
    });
  });

  describe("entrada torta não quebra a tela", () => {
    it("valor desconhecido cai em Resumo, não em tela vazia", () => {
      expect(destinoDaAba("aba-que-nunca-existiu")).toEqual({ aba: "resumo" });
    });

    it("ausente, vazio e nulo caem em Resumo", () => {
      expect(destinoDaAba(null)).toEqual({ aba: "resumo" });
      expect(destinoDaAba(undefined)).toEqual({ aba: "resumo" });
      expect(destinoDaAba("")).toEqual({ aba: "resumo" });
    });

    it("aceita maiúsculas e espaços — a URL vem do mundo real", () => {
      expect(destinoDaAba("  CLARITY  ").aba).toBe("performance");
      expect(destinoDaAba("Seguranca").aba).toBe("tecnico");
    });
  });

  it("nenhuma aba de dado ficou sem seções declaradas", () => {
    expect(SECOES_DA_ABA.performance?.length).toBeGreaterThan(0);
    expect(SECOES_DA_ABA.tecnico?.length).toBeGreaterThan(0);
  });
});

/**
 * O deep-link do alerta do robô. É o caminho que alguém percorre às 3 da manhã,
 * vindo de um e-mail — e uma aba que não resolve leva a pessoa ao Resumo, onde
 * não há nada sobre o incidente que a acordou.
 */
describe("aba Monitoramento", () => {
  it("o destino gravado pelo alerta resolve para a aba certa", () => {
    expect(destinoDaAba("monitoramento")).toEqual({ aba: "monitoramento" });
  });

  it.each(["monitor", "dominio"])("apelido '%s' também chega lá", (v) => {
    expect(destinoDaAba(v).aba).toBe("monitoramento");
  });

  it("está na lista de abas e tem rótulo", () => {
    expect(ABAS_SITE).toContain("monitoramento");
    expect(ROTULO_ABA.monitoramento).toBe("Monitoramento");
  });
});
