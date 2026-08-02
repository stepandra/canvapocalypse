import assert from "node:assert/strict";
import { mkdtemp, mkdir, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  createDesignSystemService,
  projectDesignSystem,
} from "./design-system-service.mjs";

const TEST_RESIDENT_CAPABILITY = `hr_${"D".repeat(43)}`;

test("projects DESIGN.md into a bounded semantic contract", () => {
  const projection = projectDesignSystem(`# Design System: AutoRecruit
**Project ID:** autorecruit-ui

## 1. Visual Theme & Atmosphere
Dense, calm operational workspace with a single cyan action accent.

## 2. Color Palette & Roles
- **Operator Cyan (#17B8D4):** Primary operator action.
- **Quiet Graphite (#20242A):** Main text and boundaries.

## 3. Typography Rules
- **Interface:** Font family is Inter, weight 500 for controls.

## 4. Component Stylings
- **Buttons:** Compact, squared controls with visible focus state.
- **Cards:** Reserved for interactive objects, not generic layout.

## 5. Layout Principles
- Use an 8 px baseline grid.
- Keep the canvas visually dominant.

## Internal notes
SECRET_INTERNAL_NOTE_MUST_NOT_REACH_AGENT`);

  assert.equal(projection.projectId, "autorecruit-ui");
  assert.match(projection.theme, /Dense, calm/);
  assert.deepEqual(
    projection.palette.map(({ hex }) => hex),
    ["#17B8D4", "#20242A"],
  );
  assert.equal(projection.typography[0].role, "Interface");
  assert.equal(projection.components[0].name, "Buttons");
  assert.match(projection.layoutPrinciples[0], /8 px baseline/);
  assert.doesNotMatch(
    JSON.stringify(projection),
    /SECRET_INTERNAL_NOTE_MUST_NOT_REACH_AGENT/,
  );
  assert(JSON.stringify(projection).length <= 12_000);
});

test("registry returns opaque refs and revision-guards bounded snapshots", async () => {
  const root = await mkdtemp(join(tmpdir(), "canvapocalypse-design-system-"));
  const nested = join(root, "design");
  await mkdir(nested, { recursive: true });
  await mkdir(join(root, "node_modules", "ignored"), { recursive: true });
  await writeFile(
    join(nested, "DESIGN.md"),
    `# Design System: Candidate Cockpit
**Project ID:** cockpit

## Visual Theme & Atmosphere
Quiet and operational.

## Color Palette & Roles
- Teal (#0F766E): Verified action.

## Typography Rules
- Interface: Clear sans-serif hierarchy.

## Component Stylings
- Button: Compact and direct.

## Layout Principles
- Keep one dominant workspace.`,
  );
  await writeFile(
    join(root, "node_modules", "ignored", "DESIGN.md"),
    "# Design System: Hidden dependency",
  );
  const outside = await mkdtemp(
    join(tmpdir(), "canvapocalypse-design-system-outside-"),
  );
  await writeFile(
    join(outside, "DESIGN.md"),
    "# Design System: Escaped secret",
  );
  await symlink(outside, join(root, "linked-outside"));

  const service = createDesignSystemService({
    cwd: root,
    roots: [root],
    residentCapability: TEST_RESIDENT_CAPABILITY,
  });
  const request = (url, headers = {}) =>
    invoke(service, url, {
      method: "GET",
      headers: {
        "x-tldraw-html-capability": TEST_RESIDENT_CAPABILITY,
        ...headers,
      },
    });

  const listingResponse = await request("http://bridge/design-systems");
  assert.equal(listingResponse.status, 200);
  assert.equal(listingResponse.body.documents.length, 1);
  const [document] = listingResponse.body.documents;
  assert.match(document.documentRef, /^ds_[A-Za-z0-9_-]{16,64}$/);
  assert.match(document.revision, /^sha256:[a-f0-9]{64}$/);
  assert.equal(document.title, "Candidate Cockpit");
  assert.equal(document.projectId, "cockpit");
  assert.doesNotMatch(
    JSON.stringify(listingResponse.body),
    /node_modules|linked-outside|Escaped secret|\/tmp\//,
  );

  const snapshotResponse = await request(
    `http://bridge/design-systems/${document.documentRef}/snapshot?expectedRevision=${encodeURIComponent(document.revision)}`,
  );
  assert.equal(snapshotResponse.status, 200);
  assert.equal(snapshotResponse.body.documentRef, document.documentRef);
  assert.equal(snapshotResponse.body.projection.projectId, "cockpit");
  assert.equal(snapshotResponse.body.projection.palette[0].hex, "#0F766E");
  assert.equal("source" in snapshotResponse.body, false);
  assert.equal("realPath" in snapshotResponse.body, false);

  await writeFile(
    join(nested, "DESIGN.md"),
    "# Design System: Candidate Cockpit\n\n## Visual Theme & Atmosphere\nChanged.",
  );
  const staleResponse = await request(
    `http://bridge/design-systems/${document.documentRef}/snapshot?expectedRevision=${encodeURIComponent(document.revision)}`,
  );
  assert.equal(staleResponse.status, 409);
  assert.equal(staleResponse.body.error, "design_system_revision_changed");

  const latestResponse = await request(
    `http://bridge/design-systems/${document.documentRef}/snapshot`,
  );
  assert.equal(latestResponse.status, 200);
  assert.notEqual(latestResponse.body.revision, document.revision);

  const unauthorized = await invoke(
    service,
    "http://bridge/design-systems",
    { method: "GET", headers: {} },
  );
  assert.equal(unauthorized.status, 401);
});

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
