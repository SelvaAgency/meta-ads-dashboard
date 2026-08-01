/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  SELVA Spaces — /spaces · GAME (piscina de bolinhas em tela cheia)
 * ─────────────────────────────────────────────────────────────────────────────
 *  A mesma "piscina" (GravityField) que aparece em uma caixinha na Home, aqui
 *  ocupando a área toda dentro da shell do Spaces (com a sidebar). É a versão
 *  "brinquedo": clicar despeja moedas, o mouse empurra as bolinhas.
 *
 *  No menu lateral o item se chama "GAME" (o nome "Spaces" confundia com o nome
 *  do próprio sistema). A rota continua /spaces por compatibilidade.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { HubShell } from "./HubShell";
import { GravityField } from "./GravityField";

export default function SpacesPage() {
  return (
    <HubShell>
      <main className="flex-1 min-h-0 overflow-hidden" style={{ background: "#060810" }}>
        <div className="relative w-full h-full">
          <GravityField fill active />

          {/* Dica sutil, no rodapé — some visualmente sem atrapalhar o brinquedo */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center pb-4">
            <span
              className="text-[10px] uppercase tracking-[0.22em]"
              style={{ color: "rgba(253,255,237,0.28)" }}
            >
              CREATING COOL SHIT
            </span>
          </div>
        </div>
      </main>
    </HubShell>
  );
}
