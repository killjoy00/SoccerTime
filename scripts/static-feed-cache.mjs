export const STATIC_SCORING_VERSION = "soccertime-v1";

export function reusableFinalScores(previousFeed, event) {
  if (!previousFeed || previousFeed.scoringVersion !== STATIC_SCORING_VERSION) return null;
  if (!event?.finished || !event?.data_checked) return null;
  const scores = previousFeed.scores?.[String(event.id)];
  return scores && typeof scores === "object" ? scores : null;
}
