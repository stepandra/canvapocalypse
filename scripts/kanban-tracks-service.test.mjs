import assert from "node:assert/strict";
import test from "node:test";
import {
  createKanbanTracksService,
  normalizeKanbanRuntimeOrigin,
} from "./kanban-tracks-service.mjs";

test("Kanban Tracks service accepts only loopback runtimes", () => {
  assert.equal(
    normalizeKanbanRuntimeOrigin("http://127.0.0.1:3499/"),
    "http://127.0.0.1:3499",
  );
  for (const denied of [
    "https://127.0.0.1:3499",
    "http://example.com:3499",
    "http://user:secret@127.0.0.1:3499",
  ]) {
    assert.throws(() => normalizeKanbanRuntimeOrigin(denied));
  }
});

test("Kanban Tracks service proxies project and projection reads without mutation routes", async () => {
  const requests = [];
  const residentCapability = `hr_${"K".repeat(43)}`;
  const service = createKanbanTracksService({
    residentCapability,
    fetchFn: async (url) => {
      requests.push(String(url));
      return new Response(
        JSON.stringify(
          String(url).includes("/projects")
            ? {
                schema: "kanban-track-projects/v1",
                currentProjectRef: "project-a",
                projects: [],
              }
            : {
                schema: "kanban-tracks-projection/v1",
                projectRef: "project-a",
                revision: 1,
                generatedAt: 1,
                tracks: [],
                unassigned: {
                  counts: {
                    backlog: 0,
                    inProgress: 0,
                    review: 0,
                    accepted: 0,
                  },
                  tasks: [],
                },
                crossTrackDependencies: [],
              },
        ),
        { status: 200 },
      );
    },
  });
  const response = {
    headers: {},
    setHeader(name, value) {
      this.headers[name] = value;
    },
  };
  const sent = [];
  const send = (_response, status, body) => {
    sent.push({ status, body });
  };

  const projects = await service(
    new URL(
      "http://bridge/kanban/tracks/projects?runtimeOrigin=http://127.0.0.1:3499",
    ),
    {
      method: "GET",
      headers: { "x-tldraw-html-capability": residentCapability },
    },
    response,
    send,
  );
  const projection = await service(
    new URL(
      "http://bridge/kanban/tracks/projection?runtimeOrigin=http://127.0.0.1:3499&projectRef=project-a",
    ),
    {
      method: "GET",
      headers: { "x-tldraw-html-capability": residentCapability },
    },
    response,
    send,
  );
  const mutation = await service(
    new URL("http://bridge/kanban/tracks/projection"),
    {
      method: "POST",
      headers: { "x-tldraw-html-capability": residentCapability },
    },
    response,
    send,
  );

  assert.equal(projects, true);
  assert.equal(projection, true);
  assert.equal(mutation, false);
  assert.deepEqual(
    sent.map(({ status }) => status),
    [200, 200],
  );
  assert.deepEqual(requests, [
    "http://127.0.0.1:3499/api/tracks/projects",
    "http://127.0.0.1:3499/api/tracks/projection?projectRef=project-a",
  ]);
});

test("Kanban Tracks service rejects reads without the resident capability", async () => {
  const service = createKanbanTracksService({
    residentCapability: `hr_${"K".repeat(43)}`,
    fetchFn: async () => {
      throw new Error("upstream must not be reached");
    },
  });
  const response = { setHeader() {} };
  const sent = [];
  const result = await service(
    new URL("http://bridge/kanban/tracks/projects"),
    { method: "GET", headers: {} },
    response,
    (_response, status, body) => sent.push({ status, body }),
  );
  assert.equal(result, true);
  assert.equal(sent[0]?.status, 401);
});
