export const PUBLIC_LEAGUE_CODE = "mindell";
const DATABASE_LEAGUE_CODE = "pitch-ember-7421";

export function normalizeLeagueCode(value: unknown) {
  const code = typeof value === "string" ? value.trim() : "";
  return code.toLowerCase() === PUBLIC_LEAGUE_CODE ? DATABASE_LEAGUE_CODE : code;
}
