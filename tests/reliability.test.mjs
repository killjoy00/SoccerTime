import test from "node:test";
import assert from "node:assert/strict";
import { createFplFetcher, FplUpstreamError } from "../src/lib/fpl-server.ts";
import { createSoccerTimeRpc } from "../src/lib/neon-server.ts";
import { createFplApi } from "../scripts/fpl-http.mjs";
import { STATIC_SCORING_VERSION, reusableFinalScores, sameFeedContent } from "../scripts/static-feed-cache.mjs";

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function memoryCache(initialValue) {
  let stored = initialValue;
  const writes = [];
  return {
    writes,
    async get() {
      return stored;
    },
    async set(key, value, options) {
      stored = value;
      writes.push({ key, value, options });
    },
  };
}

function rpcResult(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: JSON.stringify(payload),
    payload,
    contentType: "application/json",
  };
}

test("FPL retry recovers from a transient 403 and caches the fresh payload", async () => {
  const responses = [
    jsonResponse({ error: "blocked" }, 403),
    jsonResponse({ elements: [{ id: 1 }] }, 200),
  ];
  let calls = 0;
  const cache = memoryCache(undefined);
  const fetchFpl = createFplFetcher({
    cache,
    delaysMs: [0, 0, 0],
    sleep: async () => {},
    now: () => Date.parse("2026-10-06T23:45:00.000Z"),
    fetcher: async () => {
      calls += 1;
      return responses.shift();
    },
  });

  const result = await fetchFpl("/event/6/live/", { staleIfError: true });

  assert.equal(calls, 2);
  assert.equal(result.meta.source, "network");
  assert.equal(result.meta.stale, false);
  assert.equal(result.meta.attempts, 2);
  assert.deepEqual(result.data, { elements: [{ id: 1 }] });
  assert.equal(cache.writes.length, 1);
});

test("FPL failure falls back to last-known-good data and marks it stale", async () => {
  const cached = {
    data: { elements: [{ id: 7 }] },
    updatedAt: "2026-10-06T23:40:00.000Z",
  };
  const cache = memoryCache(cached);
  let calls = 0;
  const fetchFpl = createFplFetcher({
    cache,
    delaysMs: [0, 0, 0],
    sleep: async () => {},
    now: () => Date.parse("2026-10-06T23:45:00.000Z"),
    fetcher: async () => {
      calls += 1;
      return jsonResponse({ error: "upstream" }, 503);
    },
  });

  const result = await fetchFpl("/event/6/live/", { staleIfError: true });

  assert.equal(calls, 3);
  assert.deepEqual(result.data, cached.data);
  assert.equal(result.meta.source, "cache");
  assert.equal(result.meta.stale, true);
  assert.equal(result.meta.ageSeconds, 300);
  assert.match(result.meta.warning, /last-known-good/i);
});

test("FPL failure without cached data remains an explicit error", async () => {
  const fetchFpl = createFplFetcher({
    cache: memoryCache(undefined),
    delaysMs: [0],
    sleep: async () => {},
    fetcher: async () => jsonResponse({ error: "upstream" }, 503),
  });

  await assert.rejects(
    () => fetchFpl("/event/6/live/", { staleIfError: true }),
    (error) => error instanceof FplUpstreamError && error.status === 503,
  );
});

test("Neon auth rejection reacquires workload identity and succeeds in the same request", async () => {
  const tokens = ["token-old", "token-fresh"];
  const tokenCalls = [];
  const rpcCalls = [];
  const rpc = createSoccerTimeRpc({
    delaysMs: [0, 0, 0],
    sleep: async () => {},
    getToken: async () => {
      const token = tokens.shift() ?? null;
      tokenCalls.push(token);
      return token;
    },
    rpc: async (token, name, body) => {
      rpcCalls.push({ token, name, body });
      if (rpcCalls.length === 1) return rpcResult({ ok: false, error: "Unauthorized" }, 200);
      return rpcResult({ ok: true, league: { active_gameweek: 6 } }, 200);
    },
  });

  const result = await rpc("league_state_by_id", { p_league_id: "league" }, { source: "test" });

  assert.equal(result.ok, true);
  assert.equal(result.payload.ok, true);
  assert.equal(result.attempts, 2);
  assert.deepEqual(tokenCalls, ["token-old", "token-fresh"]);
  assert.deepEqual(rpcCalls.map((call) => call.token), ["token-old", "token-fresh"]);
});

test("Neon token acquisition failure retries and then recovers", async () => {
  const tokens = [null, "token-fresh"];
  let rpcCalls = 0;
  const rpc = createSoccerTimeRpc({
    delaysMs: [0, 0],
    sleep: async () => {},
    getToken: async () => tokens.shift() ?? null,
    rpc: async () => {
      rpcCalls += 1;
      return rpcResult({ ok: true }, 200);
    },
  });

  const result = await rpc("league_state_by_id", {}, { source: "test" });

  assert.equal(result.ok, true);
  assert.equal(result.attempts, 2);
  assert.equal(rpcCalls, 1);
});

test("Neon application errors are returned without pointless auth retries", async () => {
  let tokenCalls = 0;
  let rpcCalls = 0;
  const rpc = createSoccerTimeRpc({
    delaysMs: [0, 0, 0],
    sleep: async () => {},
    getToken: async () => {
      tokenCalls += 1;
      return "token";
    },
    rpc: async () => {
      rpcCalls += 1;
      return rpcResult({ ok: false, error: "League not found" }, 200);
    },
  });

  const result = await rpc("league_state_workload", { p_code: "wrong" }, { source: "test" });

  assert.equal(result.payload.ok, false);
  assert.equal(result.payload.error, "League not found");
  assert.equal(result.attempts, 1);
  assert.equal(tokenCalls, 1);
  assert.equal(rpcCalls, 1);
});


test("static FPL sync retries transient 403s instead of failing a deploy", async () => {
  const responses = [
    jsonResponse({ error: "blocked" }, 403),
    jsonResponse({ events: [{ id: 6 }] }, 200),
  ];
  let calls = 0;
  const api = createFplApi({
    delaysMs: [0, 0, 0],
    sleep: async () => {},
    fetcher: async () => {
      calls += 1;
      return responses.shift();
    },
  });

  const result = await api("/bootstrap-static/");

  assert.equal(calls, 2);
  assert.deepEqual(result, { events: [{ id: 6 }] });
});

test("static FPL sync does not waste retries on a real 404", async () => {
  let calls = 0;
  const api = createFplApi({
    delaysMs: [0, 0, 0],
    sleep: async () => {},
    fetcher: async () => {
      calls += 1;
      return jsonResponse({ error: "missing" }, 404);
    },
  });

  await assert.rejects(() => api("/missing/"), /404/);
  assert.equal(calls, 1);
});


test("static feed reuses finalized data-checked scores only for the same scoring version", () => {
  const scores = { "101": 7 };
  const previous = {
    scoringVersion: STATIC_SCORING_VERSION,
    scores: { "5": scores },
  };

  assert.equal(
    reusableFinalScores(previous, { id: 5, finished: true, data_checked: true }),
    scores,
  );
  assert.equal(
    reusableFinalScores(previous, { id: 5, finished: true, data_checked: false }),
    null,
  );
  assert.equal(
    reusableFinalScores({ ...previous, scoringVersion: "older-rules" }, { id: 5, finished: true, data_checked: true }),
    null,
  );
});

test("static feed never reuses current or unfinished Gameweek scores", () => {
  const previous = {
    scoringVersion: STATIC_SCORING_VERSION,
    scores: { "6": { "101": 4 } },
  };

  assert.equal(
    reusableFinalScores(previous, { id: 6, finished: false, data_checked: false, is_current: true }),
    null,
  );
});


test("static feed treats updatedAt-only changes as no-op", () => {
  const previous = {
    provider: "official-fpl-public-api",
    scoringVersion: STATIC_SCORING_VERSION,
    updatedAt: "2026-10-07T00:00:00.000Z",
    currentEvent: 5,
    players: [{ id: 1, name: "Player" }],
    scores: { "5": { "1": 7 } },
  };
  const next = {
    ...previous,
    updatedAt: "2026-10-07T03:00:00.000Z",
  };

  assert.equal(sameFeedContent(previous, next), true);
});

test("static feed detects meaningful football data changes", () => {
  const previous = {
    provider: "official-fpl-public-api",
    scoringVersion: STATIC_SCORING_VERSION,
    updatedAt: "2026-10-07T00:00:00.000Z",
    players: [{ id: 1, status: "a" }],
  };
  const next = {
    ...previous,
    updatedAt: "2026-10-07T03:00:00.000Z",
    players: [{ id: 1, status: "d" }],
  };

  assert.equal(sameFeedContent(previous, next), false);
});
