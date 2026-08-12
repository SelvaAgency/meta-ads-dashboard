/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Ligar as fontes ao banco, e medir o estado de cada uma
 * ─────────────────────────────────────────────────────────────────────────────
 *  A DECISÃO de qual fonte usar é pura e mora em `shared/fontesSociais`. Aqui
 *  fica só o que ela precisa saber: o que existe no banco e em que estado está.
 *  Separado de propósito — a decisão é a parte que a tela também executa, e ela
 *  não tem banco.
 *
 *  ── "Utilizável" aqui é a ÚLTIMA MEDIÇÃO, não uma sondagem ─────────────────
 *  Perguntar à Meta se cada token vive, toda vez que a lista de clientes é
 *  desenhada, seriam dezenas de chamadas para pintar uma tela. Então o estado
 *  vem do que já se sabe: prazo de validade, para o OAuth, e o resultado do
 *  último teste, para a agência. É por isso que "Testar" existe como ação
 *  explícita — ele é a sondagem, e esta função é a memória dela.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import type { EstadoDaFonte } from "@shared/fontesSociais";
import { credencialDaConta, atualizarTokenRenovado, registrarFalhaDeRenovacao, credencialSocialInfo, tokenDaContaInfo } from "../db";
import { fonteDaConta, diasAte } from "./fonteInstagramConta";
import type { FonteInstagram } from "./fonteInstagram";

/** A fonte OAuth de um cliente, ligada ao banco. */
export function fonteInstagramDaConta(accountId: number): FonteInstagram {
  return fonteDaConta(accountId, {
    ler: () => credencialDaConta(accountId),
    gravarRenovado: (t) => atualizarTokenRenovado(accountId, t),
    registrarFalhaDeRenovacao: (d) => registrarFalhaDeRenovacao(accountId, d),
  });
}

export async function estadosDasFontes(
  accountId: number,
  _conta: FonteInstagram,
  agencia: FonteInstagram,
  agora: Date = new Date(),
): Promise<EstadoDaFonte[]> {
  const [oauth, credAgencia, agenciaExiste] = await Promise.all([
    tokenDaContaInfo(accountId),
    credencialSocialInfo(),
    agencia.disponivel(),
  ]);

  const dias = diasAte(oauth?.expiresAt ?? null, agora);
  const expirado = dias !== null && dias <= 0;

  return [
    {
      fonte: "oauth_conta",
      configurada: !!oauth,
      utilizavel: !!oauth && !expirado,
      diasParaExpirar: dias,
      problema: !oauth ? null
        : expirado ? "O login desta conta expirou. Token expirado não se renova — é preciso reconectar a conta."
        : oauth.refreshFalhaDetalhe ? `A última renovação automática falhou: ${oauth.refreshFalhaDetalhe}`
        : null,
    },
    {
      fonte: "agencia_system_user",
      configurada: agenciaExiste,
      // Último teste, não sondagem — ver cabeçalho.
      utilizavel: agenciaExiste && credAgencia?.lastTestStatus !== "erro",
      problema: !agenciaExiste ? null
        : credAgencia?.lastTestStatus === "erro"
          ? "O token da agência falhou no último teste. Rode o diagnóstico geral para o detalhe."
          : null,
    },
  ];
}
