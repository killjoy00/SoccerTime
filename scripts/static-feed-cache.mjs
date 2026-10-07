export const STATIC_SCORING_VERSION = "soccertime-v1";

export function reusableFinalScores(previousFeed, event) {
  if (!previousFeed || previousFeed.scoringVersion !== STATIC_SCORING_VERSION) return null;
  if (!event?.finished || !event?.data_checked) return null;
  const scores = previousFeed.scores?.[String(event.id)];
  return scores && typeof scores === "object" ? scores : null;
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .filter((key) => key !== "updatedAt")
      .sort()
      .map((key) => [key, canonical(value[key])]),
  );
}

export function sameFeedContent(previousFeed, nextFeed) {
  if (!previousFeed || !nextFeed) return false;
  return JSON.stringify(canonical(previousFeed)) === JSON.stringify(canonical(nextFeed));
}
