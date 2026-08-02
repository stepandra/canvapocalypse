import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildContourProject } from './lib/contour-project.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const contourSource = JSON.parse(await readFile(
  path.join(root, 'fixtures/pro-exports/isoflow-export-2026-07-16T11_13_09.544Z.json'),
  'utf8'
));
const contourProject = buildContourProject(contourSource);

await mkdir(path.join(root, 'public/sessions'), { recursive: true });
await writeFile(
  path.join(root, 'public/sessions/autorecruit-contours.pro.json'),
  JSON.stringify(contourProject, null, 2)
);

console.log(`Built ${contourProject.physicalTopology.views.length} Isoflow contour views.`);
