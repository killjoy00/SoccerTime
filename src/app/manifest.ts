import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SoccerTime",
    short_name: "SoccerTime",
    description: "Two-player Premier League fantasy for the family.",
    start_url: "/",
    display: "standalone",
    background_color: "#f6f4ee",
    theme_color: "#17633a",
    orientation: "portrait-primary",
    categories: ["sports", "games"],
  };
}
