import { describe, it, expect } from "vitest";
import { classificarFontes, conectada, precisaAcao, ORDEM_FONTES, type ConexaoBruta } from "./fontes";

const AGORA = new Date("2026-07-21T12:00:00-03:00");
const diasAtras = (n: number) => new Date(AGORA.getTime() - n * 86400000);

/** Conta sem nada conectado além do Meta saudável. */
const base = (over: Partial<ConexaoBruta> = {}): ConexaoBruta => ({
  accountId: 1,
  ativa: true,
  ultimoSync: diasAtras(0),
  tokenExpiraEm: null,
  googleAdsVinculado: false,
  googleAdsOauthAtivo: false,
  ga4Vinculado: false,
  clarityLigado: false,
  claritySyncStatus: null,
  pagespeedLigado: false,
  pagespeedSyncStatus: null,
  temDominio: false,
  ...over,
});

const pegar = (c: ConexaoBruta, chave: string) =>
  classificarFontes(c, AGORA).find((f) => f.chave === chave)!;

describe("classificação de fontes", () => {
  it("devolve sempre as seis fontes, na ordem definida", () => {
    const fontes = classificarFontes(base(), AGORA);
    expect(fontes.map((f) => f.chave)).toEqual(ORDEM_FONTES);
  });

  describe("Meta — o chip que mentia verde", () => {
    it("conta sincronizada hoje e sem token vencido fica ok", () => {
      expect(pegar(base(), "meta").status).toBe("ok");
    });

    /**
     * O caso ARKA, medido em produção em 21/07/2026: último sync em 03/06 e
     * alerta de token expirado — e o chip mostrava verde, porque era a string
     * fixa "● Meta Ads". É o motivo desta frente existir.
     */
    it("sete semanas sem sincronizar NÃO pode ficar verde", () => {
      const f = pegar(base({ ultimoSync: diasAtras(49) }), "meta");
      expect(f.status).toBe("atencao");
      expect(f.porque).toMatch(/Último sync/);
    });

    it("token expirado vira atenção, com o motivo dito", () => {
      const f = pegar(base({ tokenExpiraEm: diasAtras(1) }), "meta");
      expect(f.status).toBe("atencao");
      expect(f.porque).toMatch(/Token expirado/);
    });

    it("acumula os motivos quando há mais de um", () => {
      const f = pegar(base({ ultimoSync: diasAtras(49), tokenExpiraEm: diasAtras(1) }), "meta");
      expect(f.porque).toMatch(/Token expirado/);
      expect(f.porque).toMatch(/Último sync/);
    });

    it("conta com problema continua CONECTADA — some do verde, não da tela", () => {
      const f = pegar(base({ ultimoSync: diasAtras(49) }), "meta");
      expect(conectada(f)).toBe(true);
      expect(precisaAcao(f)).toBe(true);
    });

    it("47h ainda é ok; 49h já é atenção", () => {
      expect(pegar(base({ ultimoSync: new Date(AGORA.getTime() - 47 * 3600000) }), "meta").status).toBe("ok");
      expect(pegar(base({ ultimoSync: new Date(AGORA.getTime() - 49 * 3600000) }), "meta").status).toBe("atencao");
    });

    it("conta inativa fica ausente, não em atenção", () => {
      expect(pegar(base({ ativa: false }), "meta").status).toBe("ausente");
    });

    it("nunca sincronizou é atenção", () => {
      expect(pegar(base({ ultimoSync: null }), "meta").porque).toMatch(/Nunca sincronizou/);
    });
  });

  describe("Google Ads — o chip que escondia trabalho feito", () => {
    it("vinculada com OAuth da agência ativo fica ok", () => {
      expect(pegar(base({ googleAdsVinculado: true, googleAdsOauthAtivo: true }), "google_ads").status).toBe("ok");
    });

    it("vinculada sem OAuth vira atenção, não ausente", () => {
      const f = pegar(base({ googleAdsVinculado: true, googleAdsOauthAtivo: false }), "google_ads");
      expect(f.status).toBe("atencao");
      expect(f.porque).toMatch(/agência não está conectada/);
    });

    it("sem vínculo fica ausente e explica por quê", () => {
      const f = pegar(base(), "google_ads");
      expect(f.status).toBe("ausente");
      expect(f.porque).toBeTruthy();
    });
  });

  describe("GA4 — apagado até existir vínculo real", () => {
    it("sem vínculo fica ausente", () => {
      expect(pegar(base(), "ga4").status).toBe("ausente");
    });

    it("vinculado, com OAuth e já lido fica ok", () => {
      const f = pegar(base({ ga4Vinculado: true, ga4OauthAtivo: true, ga4UltimoSync: diasAtras(0) }), "ga4");
      expect(f.status).toBe("ok");
      expect(f.porque).toMatch(/Última leitura/);
    });

    it("vinculado mas nunca lido é atenção — parece conectado e não está", () => {
      const f = pegar(base({ ga4Vinculado: true, ga4OauthAtivo: true, ga4UltimoSync: null }), "ga4");
      expect(f.status).toBe("atencao");
      expect(f.porque).toMatch(/nenhuma leitura/i);
    });

    it("vinculado sem OAuth da agência é erro — não consegue ler nada", () => {
      const f = pegar(base({ ga4Vinculado: true, ga4OauthAtivo: false }), "ga4");
      expect(f.status).toBe("erro");
      expect(f.porque).toMatch(/agência não está conectada/);
    });

    it("cadastro legado sem vínculo no banco NÃO conta como conectado", () => {
      const f = pegar(base({ legado: { ga4: true } }), "ga4");
      expect(f.status).toBe("atencao");
      expect(f.status).not.toBe("ok");
    });
  });

  describe("Clarity, PageSpeed e Site", () => {
    it("ligados ficam ok", () => {
      const c = base({ clarityLigado: true, pagespeedLigado: true, temDominio: true });
      expect(pegar(c, "clarity").status).toBe("ok");
      expect(pegar(c, "pagespeed").status).toBe("ok");
      expect(pegar(c, "site").status).toBe("ok");
    });

    it("falha registrada no último sync vira erro, não silêncio", () => {
      expect(pegar(base({ clarityLigado: true, claritySyncStatus: "erro" }), "clarity").status).toBe("erro");
      expect(pegar(base({ pagespeedLigado: true, pagespeedSyncStatus: "erro" }), "pagespeed").status).toBe("erro");
    });
  });

  describe("conta sem fonte nenhuma", () => {
    /** Temos quatro assim em produção: ARKA, MNBR, SPIM e Caroline Garrafa. */
    const semNada = base({ ativa: true, ultimoSync: diasAtras(0) });

    it("não produz undefined em campo nenhum", () => {
      for (const f of classificarFontes(semNada, AGORA)) {
        expect(f.chave).toBeTruthy();
        expect(f.rotulo).toBeTruthy();
        expect(f.status).toBeTruthy();
      }
    });

    it("toda fonte ausente explica o motivo — o chip some, a razão não", () => {
      for (const f of classificarFontes(semNada, AGORA)) {
        if (f.status === "ausente") expect(f.porque).toBeTruthy();
      }
    });

    it("sobra só o Meta como conectado", () => {
      expect(classificarFontes(semNada, AGORA).filter(conectada).map((f) => f.chave)).toEqual(["meta"]);
    });
  });
});
