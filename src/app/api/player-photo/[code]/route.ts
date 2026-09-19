import { NextRequest } from "next/server";

export const revalidate = 86400;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  if (!/^\d+$/.test(code)) return new Response(null, { status: 400 });

  const urls = [
    `https://resources.premierleague.com/premierleague/photos/players/250x250/p${code}.png`,
    `https://resources.premierleague.com/premierleague26/photos/players/250x250/${code}.png`,
    `https://resources.premierleague.com/premierleague25/photos/players/250x250/${code}.png`,
  ];

  for (const url of urls) {
    try {
      const response = await fetch(url, {
        headers: { "user-agent": "SoccerTime family fantasy app" },
        next: { revalidate: 86400 },
      });
      if (!response.ok) continue;
      const body = await response.arrayBuffer();
      return new Response(body, {
        status: 200,
        headers: {
          "content-type": response.headers.get("content-type") || "image/png",
          "cache-control": "public, max-age=86400, s-maxage=86400",
        },
      });
    } catch {
      // Try the next official Premier League image path.
    }
  }

  return new Response(null, { status: 404 });
}
