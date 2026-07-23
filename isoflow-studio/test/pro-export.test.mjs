import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { convertProExport } from '../scripts/lib/pro-export.mjs';

const exports = [
  {
    path: 'fixtures/pro-exports/isoflow-export-2026-07-16T11_13_09.544Z.json',
    title: 'AutoRecruit — Ideal setup',
    firstView: 'vi_contours'
  },
  {
    path: 'fixtures/pro-exports/isoflow-export-2026-07-15T00_11_23.458Z.json',
    title: 'Eval Lab — as-is vs to-be (rev 2026-07-13)',
    firstView: 'v1-asis'
  }
];

for (const fixture of exports) {
  test(`converts ${fixture.title} into a self-consistent editable CE model`, async () => {
    const source = JSON.parse(await readFile(fixture.path, 'utf8'));
    const model = convertProExport(source);

    assert.equal(model.title, fixture.title);
    assert.equal(model.view, fixture.firstView);
    assert.equal(model.version, '1.1');
    assert.equal(model.fitToView, true);
    assert.ok(model.views.length > 0);
    assert.ok(model.items.length > 0);
    assert.ok(model.icons.length > 0);
    assert.ok(
      model.icons.every((icon) => icon.url.startsWith('/isoflow-icons/')),
      'exportable models must use same-origin icon URLs'
    );

    const modelItemIds = new Set(model.items.map((item) => item.id));
    assert.equal(modelItemIds.size, model.items.length);

    for (const view of model.views) {
      const viewItemIds = new Set(view.items.map((item) => item.id));
      assert.equal(viewItemIds.size, view.items.length);
      for (const item of view.items) {
        assert.ok(modelItemIds.has(item.id));
        assert.ok(item.labelHeight >= 120, `${view.id}/${item.id} label is too low`);
      }
      for (const textBox of view.textBoxes) {
        assert.ok(textBox.fontSize <= 0.2, `${view.id}/${textBox.id} text is too large`);
        assert.ok(['X', 'Y'].includes(textBox.orientation));
      }
      for (const connector of view.connectors) {
        for (const anchor of connector.anchors) {
          assert.ok(viewItemIds.has(anchor.ref.item));
        }
      }
    }
  });
}

test('rejects a view item that references a missing Pro component', () => {
  assert.throws(
    () => convertProExport({
      project: { title: 'Broken' },
      icons: [],
      physicalTopology: {
        components: [],
        views: [{ id: 'view', name: 'View', items: [{ id: 'node', component: 'missing', tile: { x: 0, y: 0 } }] }]
      }
    }),
    /missing component/i
  );
});
