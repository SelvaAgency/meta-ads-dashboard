/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  A fonte por login da conta
 * ─────────────────────────────────────────────────────────────────────────────
 *  Duas coisas que só existem nesta fonte e que os testes precisam travar:
 *
 *   PRAZO       o token vale 60 dias e se renova ao ser usado. Renovar sem
 *               gravar renovaria de novo na chamada seguinte; e uma renovação
 *               que falha não pode derrubar a leitura de hoje, porque o token
 *               velho ainda vale até expirar.
 *
 *   PESSOAL     aqui, diferente da fonte da agência, a conta PODE ser pessoal —
 *               o login não passa por Página. Perguntar insights a ela produziria
 *               quatro recusas e um cartão vermelho para uma conta que está
 *               exatamente como o dono quer.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { fonteDaConta, diasAte, type CredencialDaConta } from "./fonteInstagramConta";
import { FonteSemCredencial } from "./fonteInstagram";

const TOKEN = "IGQ-token-longo-de-teste-que-nao-sai-daqui-0123456789";
const AGORA = new Date("2026-08-12T12:00:00Z");
const emDias = (d: number) => new Date(AGORA.getTime() + d * 86_400_000);

const cred = (over: Partial<CredencialDaConta> = {}): CredencialDaConta => ({
  token: TOKEN,
  instagramUserId: "17841400000000000",
  instagramUsername: "selva.agency",
  escopos: ["instagram_business_basic", "instagram_business_manage_insights"],
  expiresAt: emDias(45),
  ...over,
});

function simular(opts: {
  accountType?: string | null;
  insights?: "ok" | "recusa";
  perfilFalha?: boolean;
  renovacao?: "ok" | "falha";
} = {}) {
  vi.stubGlobal("fetch", vi.fn(async (url: string | URL) => {
    const u = new URL(String(url));
    const json = (corpo: unknown) => new Response(JSON.stringify(corpo), { status: 200 });

    if (u.pathname.includes("refresh_access_token")) {
      return opts.renovacao === "falha"
        ? json({ error: { message: "token muito novo para renovar", code: 190 } })
        : json({ access_token: "IGQ-token-renovado-xxxxxxxxxxxxxxxxxxxx", expires_in: 60 * 86_400 });
    }
    if (u.pathname.includes("/me/insights")) {
      return opts.insights === "recusa"
        ? json({ error: { message: "(#10) Application does not have permission", code: 10 } })
        : json({ data: [{ name: "reach", total_value: { value: 7 } }] });
    }
    if (u.pathname.endsWith("/me")) {
      if (opts.perfilFalha) return json({ error: { message: "perfil indisponível", code: 100 } });
      return json({
        user_id: "17841400000000000", username: "selva.agency",
        account_type: opts.accountType === undefined ? "BUSINESS" : opts.accountType,
        media_count: 312, followers_count: 4210,
      });
    }
    return json({ error: { message: `não simulado: ${u.pathname}`, code: 1 } });
  }));
}

const fonte = (c: CredencialDaConta | null, io: Record<string, unknown> = {}) =>
  fonteDaConta(7, { ler: async () => c, agora: () => AGORA, ...io });

afterEach(() => vi.unstubAllGlobals());

describe("identidade e disponibilidade", () => {
  it("é a fonte oauth_conta", () => {
    expect(fonte(cred()).nome).toBe("oauth_conta");
  });

  it("sem credencial, indisponível — e o erro é próprio", async () => {
    expect(await fonte(null).disponivel()).toBe(false);
    await expect(fonte(null).diagnosticar({})).rejects.toBeInstanceOf(FonteSemCredencial);
  });

  /** Portfólio é conceito da outra fonte. Ver o cabeçalho da porta. */
  it("não descobre Páginas — não tem portfólio", () => {
    expect(fonte(cred()).descobrirPaginas).toBeUndefined();
  });
});

describe("leitura", () => {
  it("perfil vem da conta autorizada", async () => {
    simular();
    const p = await fonte(cred()).perfil({});
    expect(p.username).toBe("selva.agency");
    expect(p.tipoConta).toBe("BUSINESS");
    expect(p.posts).toBe(312);
  });

  it("insights respondendo dão DISPONIVEL", async () => {
    simular({ insights: "ok" });
    expect((await fonte(cred()).insights({})).statusInsight).toBe("DISPONIVEL");
  });

  it("recusa nomeia a métrica com o motivo", async () => {
    simular({ insights: "recusa" });
    const r = await fonte(cred()).insights({});
    expect(r.statusInsight).toBe("INDISPONIVEL");
    expect(r.recusadas).toHaveLength(4);
    expect(r.recusadas.join(" ")).toContain("(#10)");
  });
});

describe("renovação preguiçosa", () => {
  it("longe do prazo, não renova", async () => {
    simular();
    const gravar = vi.fn();
    await fonte(cred({ expiresAt: emDias(45) }), { gravarRenovado: gravar }).perfil({});
    expect(gravar).not.toHaveBeenCalled();
  });

  it("perto do prazo, renova E GRAVA", async () => {
    simular();
    const gravar = vi.fn();
    await fonte(cred({ expiresAt: emDias(4) }), { gravarRenovado: gravar }).perfil({});
    expect(gravar).toHaveBeenCalledTimes(1);
    const salvo = gravar.mock.calls[0][0] as { token: string; expiresAt: Date };
    expect(salvo.token).toBe("IGQ-token-renovado-xxxxxxxxxxxxxxxxxxxx");
    // Sem gravar, a próxima chamada renovaria tudo de novo.
    expect(salvo.expiresAt.getTime()).toBeGreaterThan(emDias(50).getTime());
  });

  /**
   * A leitura de hoje não pode morrer por causa da renovação: o token velho
   * ainda vale, e antecipar o prejuízo seria pior que adiá-lo.
   */
  it("renovação que falha não derruba a leitura, mas fica registrada", async () => {
    simular({ renovacao: "falha" });
    const registrar = vi.fn();
    const p = await fonte(cred({ expiresAt: emDias(3) }), { registrarFalhaDeRenovacao: registrar }).perfil({});
    expect(p.username).toBe("selva.agency");
    expect(registrar).toHaveBeenCalledTimes(1);
  });

  /** Token já expirado não se renova — só reconectando. Não adianta tentar. */
  it("token expirado não tenta renovar", async () => {
    simular();
    const gravar = vi.fn();
    await fonte(cred({ expiresAt: emDias(-1) }), { gravarRenovado: gravar }).insights({});
    expect(gravar).not.toHaveBeenCalled();
  });

  it("sem prazo declarado, não renova", async () => {
    simular();
    const gravar = vi.fn();
    await fonte(cred({ expiresAt: null }), { gravarRenovado: gravar }).perfil({});
    expect(gravar).not.toHaveBeenCalled();
  });
});

describe("diagnóstico próprio desta fonte", () => {
  const acha = (d: { etapas: Array<{ pergunta: string; resposta: string; detalhe: string }> }, t: string) =>
    d.etapas.find((e) => e.pergunta.includes(t));

  it("pergunta o que só esta fonte tem: prazo e permissões concedidas", async () => {
    simular();
    const d = await fonte(cred({ expiresAt: emDias(45) })).diagnosticar({});
    expect(acha(d, "Quanto tempo")?.detalhe).toContain("45 dia(s)");
    expect(acha(d, "permissões a conta concedeu")?.resposta).toBe("sim");
    expect(acha(d, "permissões a conta concedeu")?.detalhe).toContain("tem tudo");
    // E NÃO pergunta o que não existe aqui.
    expect(acha(d, "portfólio")).toBeUndefined();
    expect(acha(d, "Página")).toBeUndefined();
  });

  it("o texto declara a fonte na primeira linha", async () => {
    simular();
    const d = await fonte(cred()).diagnosticar({});
    expect(d.texto.split("\n")[0]).toContain("login da conta");
  });

  it("token expirado é dito com o conserto certo", async () => {
    simular();
    const d = await fonte(cred({ expiresAt: emDias(-2) })).diagnosticar({});
    const e = acha(d, "Quanto tempo");
    expect(e?.resposta).toBe("não");
    expect(e?.detalhe).toContain("não se renova");
    expect(e?.detalhe).toContain("reconectar");
  });

  it("permissão faltando explica a recusa dos insights", async () => {
    simular({ insights: "recusa" });
    const d = await fonte(cred({ escopos: ["instagram_business_basic"] })).diagnosticar({});
    expect(acha(d, "permissões a conta concedeu")?.detalhe).toContain("FALTAM");
    expect(acha(d, "Insights")?.detalhe).toContain("instagram_business_manage_insights");
    expect(acha(d, "Insights")?.detalhe).toContain("Reconecte");
  });

  /** Recusa COM permissão concedida não pode ser confundida com falta dela. */
  it("recusa apesar das permissões manda ler a mensagem da Meta", async () => {
    simular({ insights: "recusa" });
    const d = await fonte(cred()).diagnosticar({});
    expect(acha(d, "Insights")?.detalhe).toContain("mesmo com as permissões concedidas");
    expect(d.texto).toContain("Métricas recusadas");
  });

  it("perfil que não responde encerra o diagnóstico como falha", async () => {
    simular({ perfilFalha: true });
    const d = await fonte(cred()).diagnosticar({});
    expect(d.ok).toBe(false);
    expect(acha(d, "perfil responde")?.resposta).toBe("não");
  });
});

describe("conta pessoal não é erro, e nem é perguntada", () => {
  it("pessoal fica limitada, com o caminho para ter métricas", async () => {
    simular({ accountType: "PERSONAL" });
    const d = await fonte(cred()).diagnosticar({});
    expect(d.ok).toBe(true);
    expect(d.tipoConta).toBe("PESSOAL");
    expect(d.statusInsight).toBe("INDISPONIVEL");
    // "não é falha" é dito na etapa do TIPO, onde a identidade da conta é
    // estabelecida; a etapa dos insights carrega o caminho para ter métricas.
    expect(d.etapas.find((x) => x.pergunta.includes("tipo de conta"))?.detalhe).toContain("não é falha");
    const e = d.etapas.find((x) => x.pergunta.includes("Insights"));
    expect(e?.resposta).toBe("n/a");
    expect(e?.detalhe).toContain("gratuito e reversível");
    expect(e?.detalhe).toContain("continuam funcionando");
  });

  /** Quatro recusas viram quatro linhas vermelhas para quem não tem problema. */
  it("pessoal não chega a pedir insights à Meta", async () => {
    simular({ accountType: "PERSONAL" });
    await fonte(cred()).diagnosticar({});
    const chamadas = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    expect(chamadas.some(([u]) => String(u).includes("insights"))).toBe(false);
  });

  it("tipo não declarado não vira pessoal", async () => {
    simular({ accountType: null, insights: "ok" });
    const d = await fonte(cred()).diagnosticar({});
    expect(d.tipoConta).toBe("DESCONHECIDO");
    expect(d.statusInsight).toBe("DISPONIVEL");
  });
});

describe("o token não escapa", () => {
  it("nada do diagnóstico contém o token", async () => {
    simular({ insights: "recusa" });
    const d = await fonte(cred()).diagnosticar({});
    expect(JSON.stringify(d)).not.toContain(TOKEN);
    expect(d.impressao).toMatch(/^[0-9a-f]{8}$/);
  });
});

describe("diasAte", () => {
  it("conta dias inteiros para frente e para trás", () => {
    expect(diasAte(emDias(10), AGORA)).toBe(10);
    expect(diasAte(emDias(-1), AGORA)).toBe(-1);
    expect(diasAte(null, AGORA)).toBeNull();
  });
});
