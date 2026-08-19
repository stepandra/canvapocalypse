import { randomBytes } from "node:crypto";
import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
  GROK_CONFIG_DEFAULT_PORT,
  createGrokConfigServer,
} from "./grok-config-service.mjs";

export const GROK_BRIDGE_HOST = "127.0.0.1";
export const GROK_BRIDGE_DEFAULT_PORT = 5187;
export const GROK_BRIDGE_SERVICE = "grok-canvas-bridge";
export const GROK_BRIDGE_PROXY_HEADER = "x-canvas-studio-dev-proxy";

const execFileAsync = promisify(execFile);
const SESSION_BROWSER_ORIGINS = new Set([
  "http://127.0.0.1:5173",
  "http://localhost:5173",
  "http://127.0.0.1:5175",
  "http://localhost:5175",
  "tldraw-app://app",
]);

export function createInstalledGrokInspector(options = {}) {
  const command = options.command ?? process.env.GROK_BIN ?? "grok";
  const projectCwd = resolve(options.projectCwd ?? process.cwd());
  const run = options.execFile ?? execFileAsync;
  return async () => {
    const result = await run(command, ["inspect", "--json"], {
      cwd: projectCwd,
      env: {
        ...process.env,
        ...(options.env ?? {}),
        GROK_FOLDER_TRUST: "0",
      },
      encoding: "utf8",
      maxBuffer: 2 * 1024 * 1024,
      timeout: 15_000,
    });
    const stdout = typeof result === "string" ? result : result?.stdout;
    const payload = JSON.parse(String(stdout ?? ""));
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new Error("grok inspect returned an invalid catalog.");
    }
    return payload;
  };
}

export function createGrokCanvasBridge(options = {}) {
  const host = options.host ?? GROK_BRIDGE_HOST;
  if (host !== GROK_BRIDGE_HOST) {
    throw new Error("Grok canvas bridge must bind to 127.0.0.1 only.");
  }
  const port = parsePort(
    options.port ?? process.env.GROK_BRIDGE_PORT ?? GROK_BRIDGE_DEFAULT_PORT,
    "Grok canvas bridge",
  );
  const configPort = parsePort(
    options.configPort ??
      process.env.GROK_CONFIG_PORT ??
      GROK_CONFIG_DEFAULT_PORT,
    "Grok config service",
  );
  const capability =
    options.capability ?? `gk_${randomBytes(32).toString("base64url")}`;
  const projectCwd = resolve(options.projectCwd ?? process.cwd());
  const inspectGrok =
    options.inspectGrok ??
    createInstalledGrokInspector({
      command: options.grokCommand,
      projectCwd,
      env: options.env,
    });
  const config = createGrokConfigServer({
    ...options.configOptions,
    host,
    port: configPort,
    authToken: capability,
    projectCwd,
    inspectGrok,
  });
  let boundConfigPort = configPort;
  let listening = false;

  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", `http://${host}:${port}`);
    response.setHeader("Cache-Control", "no-store");

    if (url.pathname === "/health" && request.method === "GET") {
      return sendJson(response, 200, {
        status: listening ? "ok" : "starting",
        service: GROK_BRIDGE_SERVICE,
        supervisorPort: actualPort(server, port),
        configPort: boundConfigPort,
      });
    }

    if (url.pathname === "/api/session") {
      if (!isAllowedSessionRequest(request)) {
        return sendJson(response, 403, {
          error: "origin_not_allowed",
          message: "Origin is not allowed.",
        });
      }
      applySessionCors(request, response);
      if (request.method === "OPTIONS") {
        response.statusCode = 204;
        response.end();
        return;
      }
      if (request.method === "GET" || request.method === "POST") {
        return sendJson(response, 200, {
          capability,
          service: GROK_BRIDGE_SERVICE,
          configOrigin: `http://${host}:${boundConfigPort}`,
        });
      }
    }

    return sendJson(response, 404, {
      error: "not_found",
      message: "Not found.",
    });
  });

  return {
    host,
    port,
    configPort,
    server,
    async listen() {
      const configAddress = await config.listen();
      boundConfigPort = actualPort(config.server, configAddress.port);
      try {
        await listen(server, port, host);
      } catch (error) {
        await config.close();
        throw error;
      }
      listening = true;
      return {
        host,
        port: actualPort(server, port),
        configPort: boundConfigPort,
      };
    },
    async close() {
      listening = false;
      await Promise.all([closeServer(server), config.close()]);
    },
  };
}

function parsePort(value, label) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new Error(`${label} port is invalid.`);
  }
  return port;
}

function isAllowedSessionRequest(request) {
  const origin =
    typeof request.headers.origin === "string" ? request.headers.origin : "";
  if (origin) return SESSION_BROWSER_ORIGINS.has(origin);
  return (
    request.headers[GROK_BRIDGE_PROXY_HEADER] === "vite" &&
    isLoopbackAddress(request.socket?.remoteAddress)
  );
}

function isLoopbackAddress(value) {
  return value === "127.0.0.1" || value === "::1" || value === "::ffff:127.0.0.1";
}

function applySessionCors(request, response) {
  const origin =
    typeof request.headers.origin === "string" ? request.headers.origin : "";
  if (origin) {
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Vary", "Origin");
  }
  response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Accept, Content-Type");
  response.setHeader("Access-Control-Max-Age", "600");
}

function sendJson(response, status, payload) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(`${JSON.stringify(payload)}\n`);
}

function actualPort(server, fallback) {
  const address = server.address();
  return address && typeof address === "object" ? address.port : fallback;
}

function listen(server, port, host) {
  return new Promise((resolveListen, rejectListen) => {
    const onError = (error) => {
      server.off("listening", onListening);
      rejectListen(error);
    };
    const onListening = () => {
      server.off("error", onError);
      resolveListen();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, host);
  });
}

function closeServer(server) {
  if (!server.listening) return Promise.resolve();
  return new Promise((resolveClose, rejectClose) => {
    server.close((error) => (error ? rejectClose(error) : resolveClose()));
  });
}

async function main() {
  const bridge = createGrokCanvasBridge();
  const close = async () => {
    process.off("SIGINT", close);
    process.off("SIGTERM", close);
    await bridge.close();
  };
  process.on("SIGINT", close);
  process.on("SIGTERM", close);
  const address = await bridge.listen();
  process.stdout.write(
    `${GROK_BRIDGE_SERVICE} listening on ${address.host}:${address.port} with config on ${address.host}:${address.configPort}\n`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(
      `${GROK_BRIDGE_SERVICE} failed: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
