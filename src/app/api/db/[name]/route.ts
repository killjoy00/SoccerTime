import { NextRequest, NextResponse } from "next/server";

const API = "https://ep-icy-resonance-aw87iron.apirest.c-12.us-east-1.aws.neon.tech/neondb/rest/v1";
const ALLOWED = new Set([
  "league_state",
  "draft_pick",
  "set_captain",
  "save_manager",
  "finalize_gameweek",
]);

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ name: string }> },
) {
  const { name } = await context.params;

  if (!ALLOWED.has(name)) {
    return NextResponse.json({ error: "Unsupported database action" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const response = await fetch(`${API}/rpc/${name}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Profile": "api",
        "Accept-Profile": "api",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });

    const text = await response.text();
    const contentType = response.headers.get("content-type") || "application/json";

    if (!response.ok) {
      console.error("Neon RPC failed", {
        name,
        status: response.status,
        body: text.slice(0, 1000),
      });
    }

    return new Response(text, {
      status: response.status,
      headers: { "content-type": contentType },
    });
  } catch (error) {
    console.error("Neon RPC network failure", name, error);
    return NextResponse.json({ error: "Database connection failed" }, { status: 502 });
  }
}
