/**
 * Maps Meta Ad Account IDs to their associated Facebook Page IDs.
 * This mapping enables filtering the Redes Sociais tab by selected client,
 * since the Meta API does not reliably link ad accounts to pages.
 *
 * Source: Portfolio 803399908519541 (SELVA Agency)
 * Last updated: 2026-05-06
 */

// Meta Ad Account ID → Facebook Page IDs
export const AD_ACCOUNT_TO_PAGES: Record<string, string[]> = {
  // Ultra Malhas
  "2060651151073806": ["621911054342548"],
  // UMA Comércio e Indústria (no dedicated page found in portfolio)
  "692642033767602": [],
  // Scaffold Play
  "226528564675539": ["782993771571014"],
  // BAESH
  "2293449447774678": ["887270757796795"],
  // Elwing
  "1367169851301247": ["565650963306328"],
  // PHBR Medical
  "746370099294331": ["297805623743164"],
  // Ligvegan
  "2640737262698918": ["638431956501241"],
  // MNBR
  "726618102579554": ["393132420730919"],
  // Caroline Garrafa
  "763528323372836": ["356179010906428"],
  // Musa Resíduos (no dedicated page found in portfolio)
  "1303446334975032": [],
  // Studio Zeca Marques
  "883706257705771": ["898043513402998"],
  // SELVA Agency
  "436245678759718": ["453699201150687"],
};

// Unassigned portfolio pages (not linked to any ad account above)
// "579751495230889" — Spin Gaming Brasil
// "100497209745692" — busy.ness gallery

/**
 * Given a Meta Ad Account ID, returns the Facebook Page IDs for that client.
 * Returns undefined if the account is not mapped (caller should fall back).
 */
export function getPageIdsForAdAccount(metaAccountId: string): string[] | undefined {
  return AD_ACCOUNT_TO_PAGES[metaAccountId];
}
