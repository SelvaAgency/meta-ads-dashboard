/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Ícone do Jornalzinho
 * ─────────────────────────────────────────────────────────────────────────────
 *  O SVG mora em client/public/icons/computador-selva.svg — servido como
 *  arquivo estático, referenciado por URL. Não é import de módulo porque o
 *  projeto não tem svgr configurado, e adicionar um plugin de build para um
 *  ícone só não se paga.
 *
 *  Enquanto o arquivo não existir, cai no ícone da lucide. O fallback é por
 *  `onError` e não por checagem prévia: não dá para saber se um arquivo
 *  estático existe sem tentar buscá-lo, e um 404 no console é melhor que um
 *  espaço vazio na tela — ou que uma imagem quebrada.
 *
 *  Quando o arquivo for adicionado, nada aqui muda: ele simplesmente aparece.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useState } from "react";
import { Newspaper } from "lucide-react";

export const CAMINHO_ICONE = "/icons/computador-selva.svg";

export function IconeJornalzinho({ className = "w-3.5 h-3.5" }: { className?: string }) {
  const [falhou, setFalhou] = useState(false);

  if (falhou) return <Newspaper className={className} />;

  return (
    <img
      src={CAMINHO_ICONE}
      alt=""
      aria-hidden="true"
      className={`${className} object-contain`}
      onError={() => setFalhou(true)}
    />
  );
}
