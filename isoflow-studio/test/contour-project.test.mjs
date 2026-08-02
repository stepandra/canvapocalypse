import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildContourProject } from '../scripts/lib/contour-project.mjs';

const source = JSON.parse(await readFile(
  'fixtures/pro-exports/isoflow-export-2026-07-16T11_13_09.544Z.json',
  'utf8'
));
const originalTitle = source.project.title;
const output = buildContourProject(source);

const expectedViews = [
  'vi_contours_reworked',
  'vi_fleet_reworked',
  'vi_issuers_reworked',
  'vi_must_trust',
  'vi_must_network',
  'vi_must_deployment'
];

test('builds a separate reworked project without mutating the source export', () => {
  assert.equal(source.project.title, originalTitle);
  assert.equal(output.project.title, 'AutoRecruit — colored contours + MUST');
  assert.deepEqual(output.physicalTopology.views.map((view) => view.id), expectedViews);
});

test('assigns an explicit valid trust color to every contour', () => {
  const colorIds = new Set(output.physicalTopology.colors.map((color) => color.id));
  assert.ok(colorIds.size >= 8);
  for (const view of output.physicalTopology.views) {
    assert.ok(view.rectangles.length > 0, `${view.id} has no contours`);
    for (const rectangle of view.rectangles) {
      assert.ok(rectangle.color, `${view.id}/${rectangle.id} has no color`);
      assert.ok(colorIds.has(rectangle.color), `${rectangle.color} is not in the palette`);
    }
  }
});

test('exports an editable contour legend backed by the same color palette', () => {
  const colorIds = new Set(output.physicalTopology.colors.map((color) => color.id));
  assert.deepEqual(
    output.physicalTopology.legend.map((entry) => entry.id),
    ['owned', 'policy', 'management', 'vendor', 'exposed', 'semitrusted', 'hostile'],
  );
  for (const entry of output.physicalTopology.legend) {
    assert.ok(entry.label);
    assert.ok(colorIds.has(entry.colorId), `${entry.id} references a missing color`);
  }
});

test('splits local and content-exposed inference into distinct contours', () => {
  const view = output.physicalTopology.views.find((candidate) => candidate.id === 'vi_contours_reworked');
  const rectangleIds = new Set(view.rectangles.map((rectangle) => rectangle.id));
  assert.ok(rectangleIds.has('rc_llm_local'));
  assert.ok(rectangleIds.has('rc_llm_external'));
  assert.ok(!rectangleIds.has('rc_llm'));
});

test('adds concrete MUST deployment capacity and two independent relay servers', () => {
  const names = new Set(output.physicalTopology.components.map((component) => component.name));
  for (const required of [
    'Control server A — matrix-os + Hermes brain',
    'Control server B — workers + Viewer bridge',
    'Postgres primary',
    'Postgres PITR + immutable backup',
    'Iroh relay A — separate provider / ASN',
    'Iroh relay B — separate provider / ASN',
    'Owned Hands host A — Proxmox',
    'Owned Hands host B — Proxmox'
  ]) assert.ok(names.has(required), `missing ${required}`);
});

test('keeps all view references and connectors self-consistent', () => {
  const components = new Set(output.physicalTopology.components.map((component) => component.id));
  for (const view of output.physicalTopology.views) {
    const items = new Set(view.items.map((item) => item.id));
    assert.equal(items.size, view.items.length, `${view.id} has duplicate item IDs`);
    for (const item of view.items) {
      assert.ok(components.has(item.component));
      assert.ok(item.labelHeight >= 120, `${view.id}/${item.id} label is too low`);
    }
    for (const textBox of view.textBoxes) {
      assert.ok(textBox.fontSize <= 0.2, `${view.id}/${textBox.id} text is too large`);
      assert.ok(['X', 'Y'].includes(textBox.orientation), `${view.id}/${textBox.id} has no perspective`);
    }
    for (const connector of view.connectors) {
      assert.equal(connector.anchors.length, 2);
      for (const anchor of connector.anchors) assert.ok(items.has(anchor.ref.item));
    }
  }
});

test('places owned local inference inside the trusted core on deployment view', () => {
  const view = output.physicalTopology.views.find((candidate) => candidate.id === 'vi_must_deployment');
  const macbox = view.items.find((item) => item.component === 'c_macbox');
  const core = view.rectangles.find((rectangle) => rectangle.id === 'md_r_core');
  assert.ok(macbox);
  assert.ok(macbox.tile.x >= core.from.x && macbox.tile.x <= core.to.x);
  assert.ok(macbox.tile.y >= core.from.y && macbox.tile.y <= core.to.y);
  assert.ok(!view.rectangles.some((rectangle) => rectangle.id === 'md_r_local_inf'));
});

test('links the new views from a design document', () => {
  const document = output.documents.list.find((candidate) => candidate.id === 'doc_contours_must');
  assert.ok(document);
  const refs = document.data.content
    .filter((node) => node.type === 'itemReference')
    .map((node) => node.attrs.refId);
  assert.deepEqual(refs, expectedViews);
});
