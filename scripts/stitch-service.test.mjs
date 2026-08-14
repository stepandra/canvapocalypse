import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  createStitchService,
  downloadStitchHtml,
} from "./stitch-service.mjs";

const TEST_CAPABILITY = `hr_${"S".repeat(43)}`;
const TEST_REVISION_A = `sha256:${"a".repeat(64)}`;
const TEST_REVISION_B = `sha256:${"b".repeat(64)}`;

test("Stitch service keeps provider authority server-side and returns compact managed artifacts", async () => {
  const root = await mkdtemp(join(tmpdir(), "canvapocalypse-stitch-"));
  const calls = {
    generated: 0,
    edited: 0,
    imported: [],
    prompts: [],
  };
  const generatedScreen = fakeScreen("google-screen-generated", "Candidate UI");
  const editedScreen = fakeScreen("google-screen-edited", "Candidate UI refined");
  const fakeProject = {
    projectId: "google-project-123",
    data: { title: "AutoRecruit UI" },
    async screens() {
      return [generatedScreen];
    },
    async generate(prompt, deviceType) {
      calls.generated += 1;
      calls.prompts.push({ prompt, deviceType });
      return generatedScreen;
    },
    screen(providerId) {
      assert.equal(providerId, "google-screen-generated");
      return {
        async edit(prompt, deviceType) {
          calls.edited += 1;
          calls.prompts.push({ prompt, deviceType });
          return editedScreen;
        },
      };
    },
  };
  const sdk = {
    async projects() {
      return [fakeProject];
    },
    async createProject(title) {
      return {
        projectId: "google-created-project",
        data: { title },
      };
    },
    project(providerId) {
      assert.equal(providerId, "google-project-123");
      return fakeProject;
    },
  };
  let importCount = 0;
  const service = createStitchService({
    cwd: root,
    env: { STITCH_API_KEY: "test-secret-that-must-not-leak" },
    residentCapability: TEST_CAPABILITY,
    createSdkSession: () => ({ sdk }),
    fetch: async (url) => {
      assert.equal(new URL(url).hostname, "stitch.googleapis.com");
      return new Response("<main><h1>Generated UI</h1></main>", {
        headers: { "content-type": "text/html" },
      });
    },
    importHtml: async ({ name, content }) => {
      calls.imported.push({ name, content });
      importCount += 1;
      return {
        documentRef: `hd_${String(importCount).padStart(20, "x")}`,
        name,
        revision: importCount === 1 ? TEST_REVISION_A : TEST_REVISION_B,
        truncated: false,
      };
    },
  });

  const unauthorized = await invoke(service, "http://bridge/stitch/status", {
    method: "GET",
    headers: {},
  });
  assert.equal(unauthorized.status, 401);

  const request = (url, init = {}) =>
    invoke(service, url, {
      method: init.method ?? "GET",
      headers: {
        "x-tldraw-html-capability": TEST_CAPABILITY,
        ...(init.headers ?? {}),
      },
      body: init.body,
    });

  const status = await request("http://bridge/stitch/status");
  assert.deepEqual(status.body, {
    configured: true,
    authMode: "api-key",
    provider: "google-stitch",
    surface: "native-tldraw",
  });

  const projectsResponse = await request("http://bridge/stitch/projects");
  assert.equal(projectsResponse.status, 200);
  const [project] = projectsResponse.body.projects;
  assert.match(project.projectRef, /^stp_[A-Za-z0-9_-]{22,64}$/);
  assert.equal(project.title, "AutoRecruit UI");

  const generateBody = {
    prompt: "Create a compact candidate screen",
    deviceType: "DESKTOP",
    idempotencyKey: "stitch:test:generate-1",
    designSystem: {
      theme: "Quiet operational workspace",
      components: [
        { name: "Button", summary: "Compact with visible focus state" },
      ],
    },
  };
  const generated = await request(
    `http://bridge/stitch/projects/${project.projectRef}/screens`,
    {
      method: "POST",
      body: JSON.stringify(generateBody),
    },
  );
  assert.equal(generated.status, 201);
  assert.equal(generated.body.receipt.operation, "generate");
  assert.match(generated.body.screen.screenRef, /^sts_[A-Za-z0-9_-]{22,64}$/);
  assert.equal(generated.body.document.documentRef, "hd_xxxxxxxxxxxxxxxxxxx1");
  assert.equal(generated.body.document.revision, TEST_REVISION_A);
  assert.match(calls.prompts[0].prompt, /Quiet operational workspace/);
  assert.equal(calls.prompts[0].deviceType, "DESKTOP");
  assert.equal(calls.generated, 1);
  assert.equal(calls.imported.length, 1);
  assert.equal(calls.imported[0].content, "<main><h1>Generated UI</h1></main>");

  const serialized = JSON.stringify(generated.body);
  for (const forbidden of [
    "test-secret-that-must-not-leak",
    "google-project-123",
    "google-screen-generated",
    "downloadUrl",
    "<main>",
  ]) {
    assert.doesNotMatch(serialized, new RegExp(forbidden));
  }

  const replay = await request(
    `http://bridge/stitch/projects/${project.projectRef}/screens`,
    {
      method: "POST",
      body: JSON.stringify(generateBody),
    },
  );
  assert.equal(replay.status, 201);
  assert.deepEqual(replay.body, generated.body);
  assert.equal(calls.generated, 1);
  assert.equal(calls.imported.length, 1);

  const conflict = await request(
    `http://bridge/stitch/projects/${project.projectRef}/screens`,
    {
      method: "POST",
      body: JSON.stringify({ ...generateBody, prompt: "Different request" }),
    },
  );
  assert.equal(conflict.status, 409);
  assert.equal(conflict.body.error, "stitch_idempotency_conflict");

  const stale = await request(
    `http://bridge/stitch/screens/${generated.body.screen.screenRef}/edits`,
    {
      method: "POST",
      body: JSON.stringify({
        prompt: "Refine the selected screen",
        deviceType: "DESKTOP",
        idempotencyKey: "stitch:test:edit-stale",
        expectedRevision: `sha256:${"c".repeat(64)}`,
      }),
    },
  );
  assert.equal(stale.status, 409);
  assert.equal(stale.body.error, "stitch_revision_changed");
  assert.equal(calls.edited, 0);

  const edited = await request(
    `http://bridge/stitch/screens/${generated.body.screen.screenRef}/edits`,
    {
      method: "POST",
      body: JSON.stringify({
        prompt: "Refine the selected screen",
        deviceType: "TABLET",
        idempotencyKey: "stitch:test:edit-1",
        expectedRevision: TEST_REVISION_A,
      }),
    },
  );
  assert.equal(edited.status, 201);
  assert.equal(edited.body.receipt.operation, "edit");
  assert.equal(edited.body.document.revision, TEST_REVISION_B);
  assert.equal(calls.edited, 1);
});

test("Stitch HTML download rejects non-Google and oversized responses", async () => {
  await assert.rejects(
    downloadStitchHtml("http://stitch.googleapis.com/file", async () => {
      throw new Error("must not fetch");
    }),
    (error) => error.code === "stitch_download_url_forbidden",
  );
  await assert.rejects(
    downloadStitchHtml("https://example.invalid/file", async () => {
      throw new Error("must not fetch");
    }),
    (error) => error.code === "stitch_download_url_forbidden",
  );
  await assert.rejects(
    downloadStitchHtml(
      "https://stitch.googleapis.com/file",
      async () =>
        new Response("too large", {
          headers: { "content-length": String(4 * 1024 * 1024 + 1) },
        }),
    ),
    (error) => error.code === "stitch_html_too_large",
  );
});

function fakeScreen(screenId, title) {
  return {
    screenId,
    data: { title },
    async getHtml() {
      return "https://stitch.googleapis.com/download/screen.html";
    },
  };
}

async function invoke(service, input, request) {
  const response = {
    headers: {},
    setHeader(name, value) {
      this.headers[String(name).toLowerCase()] = value;
    },
  };
  let sent;
  const handled = await service(
    new URL(input),
    request,
    response,
    async () => request.body ?? "",
    (_response, status, body) => {
      sent = {
        status,
        body: body ? JSON.parse(body) : undefined,
        headers: response.headers,
      };
      return sent;
    },
  );
  assert.notEqual(handled, false);
  return sent;
}
