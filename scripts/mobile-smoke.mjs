import { spawn, execFileSync } from "node:child_process";
import { rm } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";

const BASE_URL = process.argv[2] || "https://soccertime.planitnow.us";
const SELF_TEST = process.env.SOCCERTIME_SMOKE_SELF_TEST === "1";
const PORT = 9337;
const USER_DATA_DIR = "/tmp/soccertime-mobile-smoke-" + process.pid;

function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  try {
    return execFileSync(
      "bash",
      ["-lc", "command -v google-chrome || command -v google-chrome-stable || command -v chromium || command -v chromium-browser"],
      { encoding: "utf8" },
    ).trim();
  } catch {
    return "";
  }
}

class CdpClient {
  constructor(url) {
    this.url = url;
    this.id = 0;
    this.pending = new Map();
    this.waiters = new Map();
  }

  async open() {
    this.ws = new WebSocket(this.url);
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Timed out opening Chrome DevTools websocket")), 5000);
      this.ws.addEventListener("open", () => {
        clearTimeout(timeout);
        resolve();
      }, { once: true });
      this.ws.addEventListener("error", () => {
        clearTimeout(timeout);
        reject(new Error("Chrome DevTools websocket failed"));
      }, { once: true });
    });

    this.ws.addEventListener("message", (event) => {
      const raw = typeof event.data === "string" ? event.data : String(event.data);
      const message = JSON.parse(raw);
      if (message.id && this.pending.has(message.id)) {
        const pending = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(message.error.message));
        else pending.resolve(message.result || {});
        return;
      }
      if (message.method && this.waiters.has(message.method)) {
        const waiters = this.waiters.get(message.method);
        this.waiters.delete(message.method);
        for (const waiter of waiters) waiter(message.params || {});
      }
    });
  }

  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  wait(method, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Timed out waiting for " + method)), timeoutMs);
      const waiter = (params) => {
        clearTimeout(timeout);
        resolve(params);
      };
      const waiters = this.waiters.get(method) || [];
      waiters.push(waiter);
      this.waiters.set(method, waiters);
    });
  }

  close() {
    this.ws?.close();
  }
}

async function debugTargetUrl() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch("http://127.0.0.1:" + PORT + "/json/list");
      if (response.ok) {
        const targets = await response.json();
        const page = targets.find((target) => target.type === "page");
        if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
      }
    } catch {}
    await sleep(100);
  }
  throw new Error("Chrome DevTools target was not available");
}

async function evaluate(client, expression) {
  const result = await client.send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (result.exceptionDetails) throw new Error("Browser evaluation failed");
  return result.result?.value;
}

async function navigate(client, url) {
  const loaded = client.wait("Page.loadEventFired", 20000);
  await client.send("Page.navigate", { url });
  await loaded;
}

async function waitForSelector(client, selector, timeoutMs = 20000) {
  const started = Date.now();
  const expression = "Boolean(document.querySelector(" + JSON.stringify(selector) + "))";
  while (Date.now() - started < timeoutMs) {
    if (await evaluate(client, expression)) return;
    await sleep(350);
  }
  const body = await evaluate(client, "document.body?.innerText?.slice(0, 500) || ''");
  throw new Error("Timed out waiting for " + selector + ". Body: " + body);
}

async function assertMobileLayout(client, width, path, selector) {
  await client.send("Emulation.setDeviceMetricsOverride", {
    width,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });

  await navigate(client, new URL(path, BASE_URL).toString());
  await waitForSelector(client, selector);
  await waitForSelector(client, ".bottomFrame");

  const selectorJson = JSON.stringify(selector);
  const result = await evaluate(client,
    "(() => {" +
    "const doc=document.documentElement;const body=document.body;" +
    "return {width:window.innerWidth,scrollWidth:Math.max(doc?.scrollWidth||0,body?.scrollWidth||0)," +
    "hasTarget:Boolean(document.querySelector(" + selectorJson + "))," +
    "hasNav:Boolean(document.querySelector('.bottomFrame'))};" +
    "})()"
  );

  if (!result?.hasTarget || !result?.hasNav) throw new Error("Required mobile UI missing at " + path);
  if (Math.abs(result.width - width) > 2) {
    throw new Error("Mobile viewport was not honored at " + path + ": expected " + width + ", got " + result.width);
  }
  if (result.scrollWidth > result.width + 2) {
    throw new Error("Horizontal overflow at " + width + "px on " + path + ": scrollWidth=" + result.scrollWidth + ", viewport=" + result.width);
  }

  console.log("mobile smoke ok: " + width + "px " + path + " (" + selector + ")");
}

const chrome = findChrome();
if (!chrome) throw new Error("Chrome/Chromium is not installed on this runner");

const chromeProcess = spawn(chrome, [
  "--headless=new",
  "--no-sandbox",
  "--disable-dev-shm-usage",
  "--disable-gpu",
  "--remote-debugging-port=" + PORT,
  "--user-data-dir=" + USER_DATA_DIR,
  "about:blank",
], { stdio: "ignore" });

let client;
try {
  const wsUrl = await debugTargetUrl();
  client = new CdpClient(wsUrl);
  await client.open();
  await client.send("Page.enable");
  await client.send("Runtime.enable");

  if (SELF_TEST) {
    await client.send("Emulation.setDeviceMetricsOverride", {
      width: 390,
      height: 844,
      deviceScaleFactor: 1,
      mobile: true,
    });
    await evaluate(client, "document.body.innerHTML='<div class=\"matchupRivalryPulse\"></div><div class=\"bottomFrame\"></div>'");
    const result = await evaluate(client,
      "({scrollWidth:document.documentElement.scrollWidth,width:window.innerWidth,ok:Boolean(document.querySelector('.matchupRivalryPulse'))})"
    );
    if (!result?.ok || result.scrollWidth > result.width + 2) throw new Error("Mobile smoke self-test failed");
    console.log("mobile smoke harness self-test ok");
  } else {
    await navigate(client, BASE_URL);
    await evaluate(client, "localStorage.setItem('soccertime-code','mindell');localStorage.setItem('soccertime-slot','1');true");

    for (const width of [390, 375]) {
      await assertMobileLayout(client, width, "/?tab=match", ".matchupRivalryPulse");
      await assertMobileLayout(client, width, "/?tab=league", ".fantasyLeagueTable");
      await assertMobileLayout(client, width, "/history", ".rivalryPulse");
    }
  }
} finally {
  client?.close();
  chromeProcess.kill("SIGTERM");
  await rm(USER_DATA_DIR, { recursive: true, force: true }).catch(() => {});
}
