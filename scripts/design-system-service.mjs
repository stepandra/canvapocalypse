import { createHash, timingSafeEqual } from "node:crypto";
import { delimiter, resolve } from "node:path";
import { lstat, readdir, readFile, realpath, stat } from "node:fs/promises";

const RESIDENT_CAPABILITY_HEADER = "x-tldraw-html-capability";
const DESIGN_SYSTEM_FILENAME = "DESIGN.md";
const MAX_DOCUMENTS = 100;
const MAX_SCAN_ENTRIES = 12_000;
const MAX_FILE_BYTES = 512 * 1024;
const MAX_PROJECTION_CHARS = 12_000;
const MAX_SECTION_ITEMS = 24;
const MAX_ITEM_CHARS = 480;
const MAX_TITLE_CHARS = 180;
const MAX_PROJECT_ID_CHARS = 180;
const DOCUMENT_REF_PATTERN = /^ds_[A-Za-z0-9_-]{16,64}$/;
const REVISION_PATTERN = /^sha256:[a-f0-9]{64}$/;

const SKIPPED_DIRECTORIES = new Set([
  ".git",
  ".pnpm-store",
  ".tldraw-backups",
  ".tldraw-html-mockups",
  ".wrangler",
  "artifacts",
  "build",
  "coverage",
  "dist",
  "node_modules",
]);

export function createDesignSystemService(options = {}) {
  const cwd = resolve(options.cwd ?? process.cwd());
  const residentCapability = normalizeResidentCapability(
    options.residentCapability,
  );
  const configuredRoots =
    options.roots ??
    [
      cwd,
      ...parseConfiguredRoots(
        options.rootsEnv ?? process.env.TLDRAW_DESIGN_SYSTEM_ROOTS,
        cwd,
      ),
    ];
  let rootsPromise;

  const getRoots = () => {
    rootsPromise ??= resolveRoots(configuredRoots);
    return rootsPromise;
  };

  return async function handleDesignSystemRequest(
    url,
    request,
    response,
    send,
  ) {
    if (!url.pathname.startsWith("/design-systems")) return false;
    response.setHeader("Cache-Control", "no-store");

    try {
      authorizeResidentCapability(request, residentCapability);
      if (request.method !== "GET") {
        return sendJson(response, send, 405, {
          error: "method_not_allowed",
          message: "Design System registry is read-only.",
        });
      }

      const roots = await getRoots();
      if (url.pathname === "/design-systems") {
        const registry = await scanDesignSystems(roots);
        return sendJson(response, send, 200, {
          documents: registry.entries.map(publicDocumentSummary),
          truncated: registry.truncated,
          limits: {
            maxDocuments: MAX_DOCUMENTS,
            maxFileBytes: MAX_FILE_BYTES,
            maxProjectionChars: MAX_PROJECTION_CHARS,
          },
        });
      }

      const route = matchSnapshotRoute(url.pathname);
      if (!route) return false;
      const registry = await scanDesignSystems(roots);
      const entry = registry.entries.find(
        (candidate) => candidate.documentRef === route.documentRef,
      );
      if (!entry) {
        return sendJson(response, send, 404, {
          error: "design_system_not_found",
          message: "The requested Design System reference is unavailable.",
        });
      }

      const expectedRevision = url.searchParams.get("expectedRevision");
      if (expectedRevision != null) {
        if (!REVISION_PATTERN.test(expectedRevision)) {
          return sendJson(response, send, 400, {
            error: "invalid_expected_revision",
            message: "expectedRevision must be a sha256 revision.",
          });
        }
        if (expectedRevision !== entry.revision) {
          return sendJson(response, send, 409, {
            error: "design_system_revision_changed",
            message: "DESIGN.md changed after the canvas node was created.",
            currentRevision: entry.revision,
          });
        }
      }

      const source = await readBoundedDesignSystem(entry.realPath);
      const projection = projectDesignSystem(source);
      return sendJson(response, send, 200, {
        ...publicDocumentSummary(entry),
        projection,
      });
    } catch (error) {
      const status =
        typeof error?.statusCode === "number" ? error.statusCode : 500;
      return sendJson(response, send, status, {
        error: error?.code ?? "design_system_error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };
}

export function projectDesignSystem(source) {
  if (typeof source !== "string") {
    throw httpError(
      400,
      "invalid_design_system",
      "DESIGN.md source must be text.",
    );
  }
  const sections = new Map();
  let currentSection = "root";
  let title;
  let projectId;

  for (const rawLine of source.split(/\r?\n/)) {
    const heading = /^(#{1,6})\s+(.+?)\s*$/.exec(rawLine);
    if (heading) {
      const level = heading[1].length;
      const label = compactMarkdownText(heading[2], MAX_TITLE_CHARS);
      if (level === 1 && !title) {
        title = normalizeDesignSystemTitle(label);
      }
      if (level === 2) currentSection = classifySection(label);
      continue;
    }

    const projectMatch =
      /^\s*(?:[-*]\s*)?(?:\*\*)?Project\s+ID(?:\*\*)?\s*:\s*(.+?)\s*$/i.exec(
        rawLine,
      );
    if (projectMatch && !projectId) {
      projectId = compactMarkdownText(
        projectMatch[1],
        MAX_PROJECT_ID_CHARS,
      );
    }

    const text = compactMarkdownText(rawLine, MAX_ITEM_CHARS);
    if (!text) continue;
    const items = sections.get(currentSection) ?? [];
    if (items.length < MAX_SECTION_ITEMS) items.push(text);
    sections.set(currentSection, items);
  }

  const atmosphere = compactSectionItems(sections.get("atmosphere"));
  const typography = parseNamedSummaries(
    sections.get("typography"),
    "Typography",
  ).map(({ name, summary }) => ({
    role: name,
    ...(inferFontFamily(summary) ? { family: inferFontFamily(summary) } : {}),
    ...(inferFontWeight(summary) ? { weight: inferFontWeight(summary) } : {}),
    summary,
  }));
  const components = parseNamedSummaries(
    sections.get("components"),
    "Component",
  );
  const layoutPrinciples = compactSectionItems(sections.get("layout"));
  const palette = parsePalette(sections.get("palette"));

  const projection = {
    ...(projectId ? { projectId } : {}),
    ...(atmosphere[0] ? { theme: atmosphere[0] } : {}),
    ...(atmosphere.length ? { atmosphere } : {}),
    palette,
    typography,
    components,
    layoutPrinciples,
    truncated: false,
  };

  if (JSON.stringify(projection).length > MAX_PROJECTION_CHARS) {
    projection.truncated = true;
    trimProjectionToBudget(projection);
  }
  return projection;
}

async function scanDesignSystems(roots) {
  const entries = [];
  let scanned = 0;
  let truncated = false;

  for (const root of roots) {
    const pending = [root.realPath];
    while (pending.length && entries.length < MAX_DOCUMENTS) {
      const directory = pending.pop();
      let children;
      try {
        children = await readdir(directory, { withFileTypes: true });
      } catch {
        continue;
      }
      children.sort((a, b) => a.name.localeCompare(b.name));

      for (const child of children) {
        scanned += 1;
        if (scanned > MAX_SCAN_ENTRIES) {
          truncated = true;
          break;
        }
        if (child.isSymbolicLink()) continue;
        const candidate = resolve(directory, child.name);
        if (child.isDirectory()) {
          if (!SKIPPED_DIRECTORIES.has(child.name)) pending.push(candidate);
          continue;
        }
        if (!child.isFile() || child.name !== DESIGN_SYSTEM_FILENAME) continue;

        const entry = await inspectDesignSystem(candidate);
        if (entry) entries.push(entry);
        if (entries.length >= MAX_DOCUMENTS) {
          truncated = true;
          break;
        }
      }
      if (scanned > MAX_SCAN_ENTRIES) break;
    }
    if (scanned > MAX_SCAN_ENTRIES || entries.length >= MAX_DOCUMENTS) break;
  }

  entries.sort((a, b) => {
    const byTitle = a.title.localeCompare(b.title);
    return byTitle || a.documentRef.localeCompare(b.documentRef);
  });
  return { entries, truncated };
}

async function inspectDesignSystem(path) {
  try {
    const info = await lstat(path);
    if (!info.isFile() || info.size > MAX_FILE_BYTES) return null;
    const canonicalPath = await realpath(path);
    const canonicalInfo = await stat(canonicalPath);
    if (!canonicalInfo.isFile() || canonicalInfo.size > MAX_FILE_BYTES) {
      return null;
    }
    const source = await readBoundedDesignSystem(canonicalPath);
    const title =
      source
        .split(/\r?\n/)
        .map((line) => /^#\s+(.+?)\s*$/.exec(line)?.[1])
        .find(Boolean) ?? "Design System";
    const projectId = extractProjectId(source);
    return {
      documentRef: createDocumentRef(canonicalPath),
      revision: createRevision(source),
      title: normalizeDesignSystemTitle(
        compactMarkdownText(title, MAX_TITLE_CHARS),
      ),
      ...(projectId ? { projectId } : {}),
      bytes: Buffer.byteLength(source),
      status: "current",
      truncated: false,
      realPath: canonicalPath,
    };
  } catch {
    return null;
  }
}

async function readBoundedDesignSystem(path) {
  const info = await stat(path);
  if (!info.isFile() || info.size > MAX_FILE_BYTES) {
    throw httpError(
      413,
      "design_system_too_large",
      `DESIGN.md must be at most ${MAX_FILE_BYTES} bytes.`,
    );
  }
  return readFile(path, "utf8");
}

function publicDocumentSummary(entry) {
  return {
    documentRef: entry.documentRef,
    title: entry.title,
    revision: entry.revision,
    status: entry.status,
    ...(entry.projectId ? { projectId: entry.projectId } : {}),
    bytes: entry.bytes,
    truncated: entry.truncated,
  };
}

function parsePalette(lines = []) {
  const colors = [];
  for (const line of lines) {
    const match = /#([0-9a-f]{6}|[0-9a-f]{3})\b/i.exec(line);
    if (!match) continue;
    const hex = `#${match[1].toUpperCase()}`;
    const before = line.slice(0, match.index).replace(/[(:\s-]+$/g, "");
    const after = line
      .slice(match.index + match[0].length)
      .replace(/^[)\s:—-]+/, "");
    const name = compactMarkdownText(before, 80) || "Color";
    const role = compactMarkdownText(after, 240) || name;
    if (colors.some((color) => color.hex === hex && color.role === role)) continue;
    colors.push({ role, hex, name });
    if (colors.length >= 16) break;
  }
  return colors;
}

function parseNamedSummaries(lines = [], fallbackName) {
  const items = [];
  for (const line of lines) {
    const cleaned = line.replace(/^[-*]\s+/, "").trim();
    const match = /^([^:]{1,80}):\s*(.+)$/.exec(cleaned);
    const name = compactMarkdownText(match?.[1] ?? fallbackName, 80);
    const summary = compactMarkdownText(match?.[2] ?? cleaned, MAX_ITEM_CHARS);
    if (!summary) continue;
    items.push({ name: name || fallbackName, summary });
    if (items.length >= 16) break;
  }
  return items;
}

function compactSectionItems(lines = []) {
  return lines
    .map((line) => compactMarkdownText(line, MAX_ITEM_CHARS))
    .filter(Boolean)
    .slice(0, 16);
}

function compactMarkdownText(value, maxLength) {
  if (typeof value !== "string") return "";
  return value
    .replace(/^\s*[-*+]\s+/, "")
    .replace(/!\[[^\]]*]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
    .replace(/[*_`~]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function normalizeDesignSystemTitle(value) {
  const title = String(value || "Design System")
    .replace(/^Design\s+System\s*:\s*/i, "")
    .trim();
  return title || "Design System";
}

function classifySection(label) {
  const normalized = label.toLowerCase();
  if (/atmosphere|visual theme|mood/.test(normalized)) return "atmosphere";
  if (/color|palette/.test(normalized)) return "palette";
  if (/typography|type scale|font/.test(normalized)) return "typography";
  if (/component|control|element/.test(normalized)) return "components";
  if (/layout|spacing|grid/.test(normalized)) return "layout";
  return "other";
}

function extractProjectId(source) {
  const match =
    /^(?:[-*]\s*)?(?:\*\*)?Project\s+ID(?:\*\*)?\s*:\s*(.+?)\s*$/im.exec(
      source,
    );
  return match
    ? compactMarkdownText(match[1], MAX_PROJECT_ID_CHARS)
    : undefined;
}

function inferFontFamily(summary) {
  const match =
    /(?:font(?:\s+family)?|typeface)\s*(?:is|:)?\s*["']?([A-Za-z][A-Za-z0-9 .-]{1,48})/i.exec(
      summary,
    );
  return match ? compactMarkdownText(match[1], 64) : undefined;
}

function inferFontWeight(summary) {
  const match = /\b(?:weight\s*)?(100|200|300|400|500|600|700|800|900)\b/i.exec(
    summary,
  );
  return match?.[1];
}

function trimProjectionToBudget(projection) {
  const arrays = [
    projection.layoutPrinciples,
    projection.components,
    projection.typography,
    projection.palette,
    projection.atmosphere ?? [],
  ];
  let guard = 0;
  while (
    JSON.stringify(projection).length > MAX_PROJECTION_CHARS &&
    guard < 200
  ) {
    const candidate = arrays
      .filter((array) => array.length)
      .sort((a, b) => b.length - a.length)[0];
    if (!candidate) break;
    candidate.pop();
    guard += 1;
  }
}

function createDocumentRef(path) {
  return `ds_${createHash("sha256").update(path).digest("base64url").slice(0, 32)}`;
}

function createRevision(source) {
  return `sha256:${createHash("sha256").update(source).digest("hex")}`;
}

function parseConfiguredRoots(value, cwd) {
  if (typeof value !== "string" || !value.trim()) return [];
  return value
    .split(delimiter)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => resolve(cwd, item));
}

async function resolveRoots(values) {
  const roots = [];
  const seen = new Set();
  for (const value of values) {
    try {
      const canonical = await realpath(resolve(value));
      const info = await stat(canonical);
      if (!info.isDirectory() || seen.has(canonical)) continue;
      seen.add(canonical);
      roots.push({ realPath: canonical });
    } catch {
      // A missing configured root grants no authority.
    }
  }
  return roots;
}

function matchSnapshotRoute(pathname) {
  const match =
    /^\/design-systems\/(ds_[A-Za-z0-9_-]{16,64})\/snapshot\/?$/.exec(
      pathname,
    );
  if (!match || !DOCUMENT_REF_PATTERN.test(match[1])) return null;
  return { documentRef: match[1] };
}

function normalizeResidentCapability(value) {
  if (
    typeof value !== "string" ||
    !/^hr_[A-Za-z0-9_-]{43,128}$/.test(value)
  ) {
    throw new Error("Design System resident capability is required.");
  }
  return value;
}

function authorizeResidentCapability(request, expected) {
  const actual = request.headers?.[RESIDENT_CAPABILITY_HEADER];
  if (
    typeof actual !== "string" ||
    actual.length !== expected.length ||
    !timingSafeEqual(Buffer.from(actual), Buffer.from(expected))
  ) {
    throw httpError(
      401,
      "resident_capability_required",
      "Resident capability is required.",
    );
  }
}

function sendJson(response, send, status, payload) {
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  return send(response, status, JSON.stringify(payload));
}

function httpError(statusCode, code, message) {
  return Object.assign(new Error(message), { statusCode, code });
}
