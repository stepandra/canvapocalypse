import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import {
  chmod,
  mkdir,
  readFile,
  rename,
  unlink,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { Stitch, StitchToolClient } from "@google/stitch-sdk";

const RESIDENT_CAPABILITY_HEADER = "x-tldraw-html-capability";
const PROJECT_REF_PATTERN = /^stp_[A-Za-z0-9_-]{22,64}$/;
const SCREEN_REF_PATTERN = /^sts_[A-Za-z0-9_-]{22,64}$/;
const REVISION_PATTERN = /^sha256:[a-f0-9]{64}$/i;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;
const DEVICE_TYPES = new Set(["MOBILE", "DESKTOP", "TABLET", "AGNOSTIC"]);
const MAX_PROJECTS = 100;
const MAX_SCREENS = 100;
const MAX_TITLE_CHARS = 160;
const MAX_PROMPT_CHARS = 12_000;
const MAX_DESIGN_CONTEXT_CHARS = 8_000;
const MAX_HTML_BYTES = 4 * 1024 * 1024;
const MAX_REDIRECTS = 4;
const DEFAULT_TIMEOUT_MS = 300_000;
const ALLOWED_DOWNLOAD_HOSTS = new Set([
  "stitch.googleapis.com",
  "storage.googleapis.com",
]);

export function createStitchService(options = {}) {
  const cwd = resolve(options.cwd ?? process.cwd());
  const env = options.env ?? process.env;
  const residentCapability = normalizeResidentCapability(
    options.residentCapability,
  );
  const importHtml = options.importHtml;
  if (typeof importHtml !== "function") {
    throw new Error("Stitch service requires a managed Local HTML importer.");
  }
  const referenceStore =
    options.referenceStore ?? createStitchReferenceStore({ cwd });
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const operations = new Map();
  let sdkSessionPromise;

  const getSdkSession = async () => {
    sdkSessionPromise ??= Promise.resolve(
      options.createSdkSession
        ? options.createSdkSession()
        : createDefaultSdkSession(env),
    );
    return sdkSessionPromise;
  };

  return async function handleStitchRequest(
    url,
    request,
    response,
    readBody,
    send,
  ) {
    if (!url.pathname.startsWith("/stitch")) return false;
    response.setHeader("Cache-Control", "no-store");

    try {
      authorizeResidentCapability(request, residentCapability);

      if (request.method === "GET" && url.pathname === "/stitch/status") {
        return sendJson(response, send, 200, {
          configured: stitchAuthMode(env) !== "missing",
          authMode: stitchAuthMode(env),
          provider: "google-stitch",
          surface: "native-tldraw",
        });
      }

      const { sdk } = await getSdkSession();

      if (request.method === "GET" && url.pathname === "/stitch/projects") {
        const projects = (await sdk.projects()).slice(0, MAX_PROJECTS);
        const summaries = [];
        for (const project of projects) {
          summaries.push(
            await referenceStore.rememberProject({
              providerId: normalizeProviderId(project.projectId ?? project.id),
              title: projectTitle(project),
            }),
          );
        }
        return sendJson(response, send, 200, {
          projects: summaries,
          truncated: projects.length >= MAX_PROJECTS,
        });
      }

      if (request.method === "POST" && url.pathname === "/stitch/projects") {
        const payload = parseJson(await readBody(request));
        const title = boundedText(
          payload?.title,
          "title",
          MAX_TITLE_CHARS,
        );
        const idempotencyKey = normalizeIdempotencyKey(
          payload?.idempotencyKey,
        );
        const result = await executeIdempotent({
          operations,
          idempotencyKey,
          fingerprintInput: { operation: "create-project", title },
          execute: async () => {
            const project = await sdk.createProject(title);
            const summary = await referenceStore.rememberProject({
              providerId: normalizeProviderId(project.projectId ?? project.id),
              title: projectTitle(project, title),
            });
            return {
              receipt: createReceipt("create-project", idempotencyKey),
              project: summary,
            };
          },
        });
        return sendJson(response, send, 201, result);
      }

      const projectScreensRoute = matchProjectScreensRoute(url.pathname);
      if (projectScreensRoute && request.method === "GET") {
        const projectRecord = await referenceStore.requireProject(
          projectScreensRoute.projectRef,
        );
        const project = sdk.project(projectRecord.providerId);
        const screens = (await project.screens()).slice(0, MAX_SCREENS);
        const summaries = [];
        for (const screen of screens) {
          summaries.push(
            await referenceStore.rememberScreen({
              providerId: normalizeProviderId(screen.screenId ?? screen.id),
              projectRef: projectScreensRoute.projectRef,
              title: screenTitle(screen),
            }),
          );
        }
        return sendJson(response, send, 200, {
          project: publicProject(projectRecord),
          screens: summaries,
          truncated: screens.length >= MAX_SCREENS,
        });
      }

      if (projectScreensRoute && request.method === "POST") {
        const projectRecord = await referenceStore.requireProject(
          projectScreensRoute.projectRef,
        );
        const payload = parseJson(await readBody(request));
        const requestContract = normalizeScreenRequest(payload);
        const result = await executeIdempotent({
          operations,
          idempotencyKey: requestContract.idempotencyKey,
          fingerprintInput: {
            operation: "generate",
            projectRef: projectScreensRoute.projectRef,
            ...requestContract,
          },
          execute: async () => {
            const project = sdk.project(projectRecord.providerId);
            const screen = await project.generate(
              buildStitchPrompt(
                requestContract.prompt,
                requestContract.designSystem,
              ),
              requestContract.deviceType,
            );
            const artifact = await importScreenArtifact({
              screen,
              operation: "generate",
              projectRef: projectScreensRoute.projectRef,
              referenceStore,
              importHtml,
              fetchImpl,
            });
            return {
              receipt: createReceipt(
                "generate",
                requestContract.idempotencyKey,
              ),
              project: publicProject(projectRecord),
              ...artifact,
            };
          },
        });
        return sendJson(response, send, 201, result);
      }

      const editRoute = matchScreenEditRoute(url.pathname);
      if (editRoute && request.method === "POST") {
        const screenRecord = await referenceStore.requireScreen(
          editRoute.screenRef,
        );
        const projectRecord = await referenceStore.requireProject(
          screenRecord.projectRef,
        );
        const payload = parseJson(await readBody(request));
        const requestContract = normalizeScreenRequest(payload, {
          expectedRevision: true,
        });
        if (
          screenRecord.localRevision &&
          requestContract.expectedRevision !== screenRecord.localRevision
        ) {
          throw httpError(
            409,
            "stitch_revision_changed",
            "The managed Stitch artifact changed before this edit.",
          );
        }
        const result = await executeIdempotent({
          operations,
          idempotencyKey: requestContract.idempotencyKey,
          fingerprintInput: {
            operation: "edit",
            screenRef: editRoute.screenRef,
            ...requestContract,
          },
          execute: async () => {
            const project = sdk.project(projectRecord.providerId);
            const sourceScreen = project.screen(screenRecord.providerId);
            const screen = await sourceScreen.edit(
              buildStitchPrompt(
                requestContract.prompt,
                requestContract.designSystem,
              ),
              requestContract.deviceType,
            );
            const artifact = await importScreenArtifact({
              screen,
              operation: "edit",
              projectRef: screenRecord.projectRef,
              existingScreenRef: editRoute.screenRef,
              referenceStore,
              importHtml,
              fetchImpl,
            });
            return {
              receipt: createReceipt("edit", requestContract.idempotencyKey),
              project: publicProject(projectRecord),
              ...artifact,
            };
          },
        });
        return sendJson(response, send, 201, result);
      }

      return sendJson(response, send, 404, {
        error: "not_found",
        message: "The Stitch workbench route does not exist.",
      });
    } catch (error) {
      const normalized = normalizeStitchError(error);
      return sendJson(response, send, normalized.status, {
        error: normalized.code,
        message: normalized.message,
      });
    }
  };
}

async function importScreenArtifact({
  screen,
  operation,
  projectRef,
  existingScreenRef,
  referenceStore,
  importHtml,
  fetchImpl,
}) {
  const providerId = normalizeProviderId(screen.screenId ?? screen.id);
  const title = screenTitle(screen);
  const downloadUrl = await screen.getHtml();
  const html = await downloadStitchHtml(downloadUrl, fetchImpl);
  const importedDocument = await importHtml({
    name: `${slugify(title || operation)}.html`,
    content: html,
  });
  const document = {
    documentRef: importedDocument.documentRef,
    title: boundedStoredTitle(importedDocument.name, title),
    revision: importedDocument.revision,
    truncated: false,
  };
  const screenSummary = await referenceStore.rememberScreen({
    providerId,
    projectRef,
    title,
    screenRef: existingScreenRef,
    documentRef: document.documentRef,
    localRevision: document.revision,
  });
  return {
    screen: screenSummary,
    document,
  };
}

async function executeIdempotent({
  operations,
  idempotencyKey,
  fingerprintInput,
  execute,
}) {
  const fingerprint = createHash("sha256")
    .update(JSON.stringify(fingerprintInput))
    .digest("hex");
  const prior = operations.get(idempotencyKey);
  if (prior) {
    if (prior.fingerprint !== fingerprint) {
      throw httpError(
        409,
        "stitch_idempotency_conflict",
        "The idempotency key belongs to a different Stitch operation.",
      );
    }
    return await prior.promise;
  }

  const operation = { fingerprint };
  operation.promise = Promise.resolve()
    .then(execute)
    .then((result) => {
      operation.result = result;
      return result;
    });
  operations.set(idempotencyKey, operation);
  try {
    return await operation.promise;
  } catch (error) {
    if (operations.get(idempotencyKey) === operation) {
      operations.delete(idempotencyKey);
    }
    throw error;
  }
}

function createDefaultSdkSession(env) {
  const apiKey = optionalText(env.STITCH_API_KEY);
  const accessToken = optionalText(env.STITCH_ACCESS_TOKEN);
  const projectId = optionalText(env.GOOGLE_CLOUD_PROJECT);
  if (!apiKey && !(accessToken && projectId)) {
    throw httpError(
      503,
      "stitch_not_configured",
      "Configure STITCH_API_KEY or Stitch OAuth in the bridge environment.",
    );
  }
  const client = new StitchToolClient({
    ...(apiKey ? { apiKey } : {}),
    ...(accessToken ? { accessToken } : {}),
    ...(projectId ? { projectId } : {}),
    timeout: DEFAULT_TIMEOUT_MS,
  });
  return { sdk: new Stitch(client), close: () => client.close() };
}

function stitchAuthMode(env) {
  if (optionalText(env.STITCH_API_KEY)) return "api-key";
  if (
    optionalText(env.STITCH_ACCESS_TOKEN) &&
    optionalText(env.GOOGLE_CLOUD_PROJECT)
  ) {
    return "oauth";
  }
  return "missing";
}

function normalizeScreenRequest(payload, options = {}) {
  const prompt = boundedText(payload?.prompt, "prompt", MAX_PROMPT_CHARS);
  const deviceType =
    typeof payload?.deviceType === "string" &&
    DEVICE_TYPES.has(payload.deviceType)
      ? payload.deviceType
      : "DESKTOP";
  const idempotencyKey = normalizeIdempotencyKey(payload?.idempotencyKey);
  const designSystem = normalizeDesignSystemContext(payload?.designSystem);
  let expectedRevision;
  if (options.expectedRevision) {
    if (
      typeof payload?.expectedRevision !== "string" ||
      !REVISION_PATTERN.test(payload.expectedRevision)
    ) {
      throw httpError(
        400,
        "invalid_expected_revision",
        "A sha256 expectedRevision is required for Stitch edits.",
      );
    }
    expectedRevision = payload.expectedRevision;
  }
  return {
    prompt,
    deviceType,
    idempotencyKey,
    ...(designSystem ? { designSystem } : {}),
    ...(expectedRevision ? { expectedRevision } : {}),
  };
}

function normalizeDesignSystemContext(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const result = {
    ...(compactOptional(value.projectId, 120)
      ? { projectId: compactOptional(value.projectId, 120) }
      : {}),
    ...(compactOptional(value.theme, 240)
      ? { theme: compactOptional(value.theme, 240) }
      : {}),
    atmosphere: compactTextArray(value.atmosphere, 8, 180),
    palette: Array.isArray(value.palette)
      ? value.palette.slice(0, 16).flatMap((item) => {
          if (!item || typeof item !== "object" || Array.isArray(item)) {
            return [];
          }
          const role = compactOptional(item.role, 80);
          const hex =
            typeof item.hex === "string" &&
            /^#[0-9a-f]{3,8}$/i.test(item.hex.trim())
              ? item.hex.trim().toUpperCase()
              : "";
          return role && hex ? [{ role, hex }] : [];
        })
      : [],
    typography: compactNamedItems(value.typography, 12),
    components: compactNamedItems(value.components, 20),
    layoutPrinciples: compactTextArray(value.layoutPrinciples, 12, 180),
  };
  const serialized = JSON.stringify(result);
  if (serialized.length > MAX_DESIGN_CONTEXT_CHARS) {
    throw httpError(
      413,
      "stitch_design_context_too_large",
      "The selected Design System projection exceeds the Stitch context budget.",
    );
  }
  return serialized ===
    '{"atmosphere":[],"palette":[],"typography":[],"components":[],"layoutPrinciples":[]}'
    ? null
    : result;
}

function compactNamedItems(value, maxItems) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, maxItems).flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const name = compactOptional(item.name ?? item.role, 80);
    const summary = compactOptional(item.summary, 240);
    return name && summary ? [{ name, summary }] : [];
  });
}

function compactTextArray(value, maxItems, maxChars) {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, maxItems)
    .map((item) => compactOptional(item, maxChars))
    .filter(Boolean);
}

function buildStitchPrompt(prompt, designSystem) {
  if (!designSystem) return prompt;
  return [
    prompt,
    "Apply the explicitly selected design system constraints below. Treat them as compact semantic guidance, not page content:",
    JSON.stringify(designSystem),
  ].join("\n\n");
}

export async function downloadStitchHtml(downloadUrl, fetchImpl = globalThis.fetch) {
  let current = validateDownloadUrl(downloadUrl);
  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    const response = await fetchImpl(current, {
      method: "GET",
      redirect: "manual",
      headers: { accept: "text/html,application/xhtml+xml" },
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers?.get?.("location");
      if (!location || redirect === MAX_REDIRECTS) {
        throw httpError(
          502,
          "stitch_download_failed",
          "Stitch returned an invalid HTML download redirect.",
        );
      }
      current = validateDownloadUrl(new URL(location, current).toString());
      continue;
    }
    if (!response.ok) {
      throw httpError(
        502,
        "stitch_download_failed",
        "Stitch HTML download failed.",
      );
    }
    const declaredLength = Number(response.headers?.get?.("content-length"));
    if (
      Number.isFinite(declaredLength) &&
      declaredLength > MAX_HTML_BYTES
    ) {
      throw httpError(
        413,
        "stitch_html_too_large",
        "The generated Stitch HTML exceeds the 4 MiB limit.",
      );
    }
    return readBoundedResponseText(response, MAX_HTML_BYTES);
  }
  throw httpError(
    502,
    "stitch_download_failed",
    "Stitch HTML download exceeded the redirect limit.",
  );
}

async function readBoundedResponseText(response, maxBytes) {
  if (response.body?.getReader) {
    const reader = response.body.getReader();
    const chunks = [];
    let byteLength = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = Buffer.from(value);
      byteLength += chunk.byteLength;
      if (byteLength > maxBytes) {
        await reader.cancel();
        throw httpError(
          413,
          "stitch_html_too_large",
          "The generated Stitch HTML exceeds the 4 MiB limit.",
        );
      }
      chunks.push(chunk);
    }
    return Buffer.concat(chunks).toString("utf8");
  }
  const text = await response.text();
  if (Buffer.byteLength(text, "utf8") > maxBytes) {
    throw httpError(
      413,
      "stitch_html_too_large",
      "The generated Stitch HTML exceeds the 4 MiB limit.",
    );
  }
  return text;
}

function validateDownloadUrl(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw httpError(
      502,
      "stitch_download_url_invalid",
      "Stitch returned an invalid HTML download URL.",
    );
  }
  const host = parsed.hostname.toLowerCase();
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    !(
      ALLOWED_DOWNLOAD_HOSTS.has(host) ||
      host.endsWith(".googleusercontent.com") ||
      host.endsWith(".googleapis.com")
    )
  ) {
    throw httpError(
      502,
      "stitch_download_url_forbidden",
      "Stitch returned a non-allowlisted HTML download URL.",
    );
  }
  return parsed;
}

function createStitchReferenceStore({ cwd }) {
  const path = join(
    cwd,
    ".tldraw-html-mockups",
    "stitch-provider-v1.json",
  );
  let statePromise;
  let writeChain = Promise.resolve();

  const load = async () => {
    if (!statePromise) {
      statePromise = readFile(path, "utf8")
        .then((source) => normalizeReferenceState(JSON.parse(source)))
        .catch((error) => {
          if (error?.code === "ENOENT") return emptyReferenceState();
          throw error;
        });
    }
    return statePromise;
  };

  const mutate = async (callback) => {
    let result;
    writeChain = writeChain.then(async () => {
      const state = await load();
      result = callback(state);
      await persistReferenceState(path, state);
    });
    await writeChain;
    return result;
  };

  return {
    async rememberProject({ providerId, title }) {
      return mutate((state) => {
        const existing = Object.entries(state.projects).find(
          ([, value]) => value.providerId === providerId,
        );
        const projectRef = existing?.[0] ?? createOpaqueRef("stp");
        state.projects[projectRef] = {
          providerId,
          title: boundedStoredTitle(title, "Stitch project"),
        };
        return publicProject({
          projectRef,
          ...state.projects[projectRef],
        });
      });
    },
    async rememberScreen({
      providerId,
      projectRef,
      title,
      screenRef,
      documentRef,
      localRevision,
    }) {
      return mutate((state) => {
        const existing =
          screenRef && state.screens[screenRef]?.providerId === providerId
            ? [screenRef, state.screens[screenRef]]
            : Object.entries(state.screens).find(
                ([, value]) =>
                  value.providerId === providerId &&
                  value.projectRef === projectRef,
              );
        const resolvedRef = existing?.[0] ?? createOpaqueRef("sts");
        state.screens[resolvedRef] = {
          ...existing?.[1],
          providerId,
          projectRef,
          title: boundedStoredTitle(title, "Stitch screen"),
          ...(documentRef ? { documentRef } : {}),
          ...(localRevision ? { localRevision } : {}),
        };
        return publicScreen({
          screenRef: resolvedRef,
          ...state.screens[resolvedRef],
        });
      });
    },
    async requireProject(projectRef) {
      if (!PROJECT_REF_PATTERN.test(projectRef)) {
        throw httpError(
          400,
          "invalid_stitch_project_ref",
          "The Stitch project reference is invalid.",
        );
      }
      const record = (await load()).projects[projectRef];
      if (!record) {
        throw httpError(
          404,
          "stitch_project_not_found",
          "The Stitch project reference is unavailable.",
        );
      }
      return { projectRef, ...record };
    },
    async requireScreen(screenRef) {
      if (!SCREEN_REF_PATTERN.test(screenRef)) {
        throw httpError(
          400,
          "invalid_stitch_screen_ref",
          "The Stitch screen reference is invalid.",
        );
      }
      const record = (await load()).screens[screenRef];
      if (!record) {
        throw httpError(
          404,
          "stitch_screen_not_found",
          "The Stitch screen reference is unavailable.",
        );
      }
      return { screenRef, ...record };
    },
  };
}

function normalizeReferenceState(value) {
  if (
    !value ||
    typeof value !== "object" ||
    value.version !== 1 ||
    !value.projects ||
    !value.screens
  ) {
    return emptyReferenceState();
  }
  return value;
}

function emptyReferenceState() {
  return { version: 1, projects: {}, screens: {} };
}

async function persistReferenceState(path, state) {
  const directory = dirname(path);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const temporary = join(
    directory,
    `.${basename(path)}.${randomBytes(8).toString("hex")}.tmp`,
  );
  await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, {
    flag: "wx",
    mode: 0o600,
  });
  try {
    await rename(temporary, path);
    await chmod(path, 0o600);
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
}

function publicProject(record) {
  return {
    projectRef: record.projectRef,
    title: boundedStoredTitle(record.title, "Stitch project"),
  };
}

function publicScreen(record) {
  return {
    screenRef: record.screenRef,
    projectRef: record.projectRef,
    title: boundedStoredTitle(record.title, "Stitch screen"),
    ...(record.documentRef ? { documentRef: record.documentRef } : {}),
    ...(record.localRevision
      ? { localRevision: record.localRevision }
      : {}),
  };
}

function projectTitle(project, fallback = "Stitch project") {
  return boundedStoredTitle(
    project?.data?.title ??
      project?.data?.displayName ??
      project?.data?.name ??
      fallback,
    fallback,
  );
}

function screenTitle(screen) {
  return boundedStoredTitle(
    screen?.data?.title ??
      screen?.data?.displayName ??
      screen?.data?.name ??
      `Stitch screen ${String(screen?.id ?? "").slice(-8)}`,
    "Stitch screen",
  );
}

function normalizeProviderId(value) {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > 500
  ) {
    throw httpError(
      502,
      "stitch_provider_response_invalid",
      "Stitch returned an invalid resource identifier.",
    );
  }
  return value.trim();
}

function matchProjectScreensRoute(pathname) {
  const match =
    /^\/stitch\/projects\/(stp_[A-Za-z0-9_-]{22,64})\/screens\/?$/.exec(
      pathname,
    );
  return match ? { projectRef: match[1] } : null;
}

function matchScreenEditRoute(pathname) {
  const match =
    /^\/stitch\/screens\/(sts_[A-Za-z0-9_-]{22,64})\/edits\/?$/.exec(
      pathname,
    );
  return match ? { screenRef: match[1] } : null;
}

function normalizeIdempotencyKey(value) {
  if (
    typeof value !== "string" ||
    !IDEMPOTENCY_KEY_PATTERN.test(value)
  ) {
    throw httpError(
      400,
      "invalid_idempotency_key",
      "A bounded idempotencyKey is required.",
    );
  }
  return value;
}

function createReceipt(operation, idempotencyKey) {
  return {
    receiptId: `str_${createHash("sha256")
      .update(`${operation}:${idempotencyKey}`)
      .digest("base64url")
      .slice(0, 22)}`,
    status: "succeeded",
    operation,
  };
}

function createOpaqueRef(prefix) {
  return `${prefix}_${randomBytes(18).toString("base64url")}`;
}

function boundedText(value, label, maxChars) {
  if (typeof value !== "string") {
    throw httpError(400, `invalid_${label}`, `${label} must be text.`);
  }
  const result = value.replace(/\s+/g, " ").trim();
  if (!result || result.length > maxChars) {
    throw httpError(
      400,
      `invalid_${label}`,
      `${label} must contain 1-${maxChars} characters.`,
    );
  }
  return result;
}

function compactOptional(value, maxChars) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, maxChars);
}

function optionalText(value) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function boundedStoredTitle(value, fallback) {
  return compactOptional(value, MAX_TITLE_CHARS) || fallback;
}

function slugify(value) {
  return (
    compactOptional(value, 96)
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "stitch-screen"
  );
}

function parseJson(source) {
  try {
    return JSON.parse(source);
  } catch {
    throw httpError(400, "invalid_json", "Request body must be JSON.");
  }
}

function normalizeResidentCapability(value) {
  if (
    typeof value !== "string" ||
    !/^hr_[A-Za-z0-9_-]{43,128}$/.test(value)
  ) {
    throw new Error("Stitch resident capability is required.");
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

function normalizeStitchError(error) {
  if (
    typeof error?.statusCode === "number" &&
    typeof error?.code === "string"
  ) {
    return {
      status: error.statusCode,
      code: error.code,
      message: error.message,
    };
  }
  const code = typeof error?.code === "string" ? error.code : "";
  if (code === "AUTH_FAILED" || code === "PERMISSION_DENIED") {
    return {
      status: 502,
      code: "stitch_auth_failed",
      message: "The Stitch bridge could not authenticate.",
    };
  }
  if (code === "RATE_LIMITED") {
    return {
      status: 429,
      code: "stitch_rate_limited",
      message: "Stitch rate limited this operation.",
    };
  }
  if (code === "NOT_FOUND") {
    return {
      status: 404,
      code: "stitch_resource_not_found",
      message: "The requested Stitch resource is unavailable.",
    };
  }
  return {
    status: 502,
    code: "stitch_provider_error",
    message: "The Stitch provider operation failed.",
  };
}

function sendJson(response, send, status, payload) {
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  const body = JSON.stringify(payload);
  send(response, status, body);
  return true;
}

function httpError(statusCode, code, message) {
  return Object.assign(new Error(message), { statusCode, code });
}
