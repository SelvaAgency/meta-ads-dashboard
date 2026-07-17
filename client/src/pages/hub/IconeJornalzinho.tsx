/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Ícone do Jornalzinho
 * ─────────────────────────────────────────────────────────────────────────────
 *  O SVG (computador-selva) é mais ALTO que largo (177×194). Forçá-lo numa
 *  caixa quadrada com object-contain o encolhia para caber na dimensão maior —
 *  aparecia pequeno e "cortado". A correção: mandar pela ALTURA e deixar a
 *  largura automática, preservando a proporção sem recorte.
 *
 *  O arquivo mora em client/public/icons/computador-selva.svg (estático). Cai
 *  no ícone da lucide por onError enquanto não existir — 404 no console é melhor
 *  que imagem quebrada. Quando o arquivo chega, nada aqui muda.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useState } from "react";
import { Newspaper } from "lucide-react";

export const CAMINHO_ICONE = "/icons/computador-selva.svg";

/**
 * `altura` em px. A largura sai da proporção do SVG — nunca distorce, nunca
 * corta. O fallback lucide usa uma caixa quadrada dessa mesma altura.
 */
export function IconeJornalzinho({ altura = 20 }: { altura?: number }) {
  const [falhou, setFalhou] = useState(false);

  if (falhou) return <Newspaper style={{ width: altura, height: altura }} className="flex-shrink-0" />;

  return (
    <img
      src={CAMINHO_ICONE}
      alt=""
      aria-hidden="true"
      className="flex-shrink-0"
      style={{ height: altura, width: "auto", objectFit: "contain" }}
      onError={() => setFalhou(true)}
    />
  );
}
