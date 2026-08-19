import assert from "node:assert/strict";
import test from "node:test";
import {
  GROK_BRIDGE_PROXY_HEADER,
  createGrokCanvasBridge,
  createInstalledGrokInspector,
} from "./grok-canvas-bridge.mjs";

test("installed Grok inspector requests bounded JSON diagnostics", async () => {
  const calls = [];
  const inspect = createInstalledGrokInspector({
    projectCwd: process.cwd(),
    execFile: async (command, args, options) => {
      calls.push({ command, args, options });
      return {
        stdout: JSON.stringify({
          agents: [{ name: "general-purpose" }],
          skills: [{ name: "canvas-skill" }],
        }),
      };
    },
  });

  const result = await inspect();
  assert.equal(result.agents[0].name, "general-purpose");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, "grok");
  assert.deepEqual(calls[0].args, ["inspect", "--json"]);
  assert.equal(calls[0].options.env.GROK_FOLDER_TRUST, "0");
  assert.equal(calls[0].options.timeout, 15_000);
});

test("resident bridge couples bounded session authority to config auth", async () => {
  const bridge = createGrokCanvasBridge({
    port: 0,
    configPort: 0,
    capability: "gk_test_bridge_capability_not_secret",
    inspectGrok: async () => ({
      agents: [{ name: "general-purpose", source: { type: "builtin" } }],
      skills: [],
    }),
    configOptions: {
      fetchLiveModels: async () => ({ ok: false, error: "offline", models: [] }),
    },
  });
  const address = await bridge.listen();
  const supervisor = `http://${address.host}:${address.port}`;
  const config = `http://${address.host}:${address.configPort}`;

  try {
    const health = await fetch(`${supervisor}/health`);
    assert.equal(health.status, 200);
    assert.equal((await health.json()).service, "grok-canvas-bridge");

    const forbidden = await fetch(`${supervisor}/api/session`, {
      headers: { Origin: "https://untrusted.example" },
    });
    assert.equal(forbidden.status, 403);

    const preflight = await fetch(`${supervisor}/api/session`, {
      method: "OPTIONS",
      headers: {
        Origin: "tldraw-app://app",
        "Access-Control-Request-Method": "GET",
      },
    });
    assert.equal(preflight.status, 204);
    assert.equal(
      preflight.headers.get("access-control-allow-origin"),
      "tldraw-app://app",
    );

    const session = await fetch(`${supervisor}/api/session`, {
      headers: { Origin: "http://127.0.0.1:5173" },
    });
    assert.equal(session.status, 200);
    const sessionPayload = await session.json();
    assert.equal(sessionPayload.capability, "gk_test_bridge_capability_not_secret");

    const unauthorizedCatalog = await fetch(`${config}/api/grok/catalog`);
    assert.equal(unauthorizedCatalog.status, 401);
    const catalog = await fetch(`${config}/api/grok/catalog`, {
      headers: { Authorization: `Bearer ${sessionPayload.capability}` },
    });
    assert.equal(catalog.status, 200);
    assert.deepEqual(
      (await catalog.json()).agents.map((agent) => agent.id),
      ["general-purpose"],
    );

    const proxiedSession = await fetch(`${supervisor}/api/session`, {
      headers: { [GROK_BRIDGE_PROXY_HEADER]: "vite" },
    });
    assert.equal(proxiedSession.status, 200);
  } finally {
    await bridge.close();
  }
});
