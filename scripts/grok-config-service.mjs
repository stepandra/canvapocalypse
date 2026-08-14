import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import https from "node:https";
import {
  copyFile,
  chmod,
  lstat,
  mkdir,
  readdir,
  readFile,
  rename,
  stat,
  writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const GROK_CONFIG_HOST = "127.0.0.1";
export const GROK_CONFIG_DEFAULT_PORT = 5188;
export const GROK_CONFIG_SERVICE = "grok-config";
export const GROK_CONFIG_SCHEMA_VERSION = 1;

const DEFAULT_PROXY_MODELS_URL = "https://localhost:8317/v1/models";
const MAX_BODY_BYTES = 64 * 1024;
const MAX_WORKFLOW_BODY_BYTES = 512 * 1024;
const MAX_FILE_BYTES = 512 * 1024;
const MAX_AGENTS = 200;
const MAX_PERSONAS = 100;
const MAX_WORKFLOWS = 200;
const MAX_ROLES = 200;
const MAX_SKILLS = 200;
const MAX_MODULES = 100;
const MAX_MODEL_SLOTS = 64;
const MAX_DESCRIPTION_CHARS = 320;
const MAX_PERSONA_INSTRUCTIONS_CHARS = 12_000;
const MAX_HEADING_CHARS = 180;
const MAX_CHANGES = 40;
const WORKFLOW_NAME_RE = /^[A-Za-z0-9_-]+$/;

/**
 * Create a request handler for the Grok Build CLI config bridge.
 * Options support dependency injection for tests (paths, fetch, env).
 */
export function createGrokConfigService(options = {}) {
  const paths = resolveGrokPaths(options);
  const env = options.env ?? process.env;
  const authToken = normalizeBearerToken(
    options.authToken ?? env.GROK_CONFIG_TOKEN,
  );
  const fetchLiveModels =
    options.fetchLiveModels ??
    ((opts) => defaultFetchLiveModels({ ...opts, env }));
  const now = options.now ?? Date.now;
  const writeFileImpl = options.writeFile ?? writeFile;
  const copyFileImpl = options.copyFile ?? copyFile;
  const renameImpl = options.rename ?? rename;
  const mkdirImpl = options.mkdir ?? mkdir;
  const readFileImpl = options.readFile ?? readFile;
  const readdirImpl = options.readdir ?? readdir;
  const statImpl = options.stat ?? stat;
  const lstatImpl = options.lstat ?? lstat;
  const chmodImpl = options.chmod ?? chmod;

  const io = {
    paths,
    env,
    fetchLiveModels,
    now,
    writeFile: writeFileImpl,
    copyFile: copyFileImpl,
    rename: renameImpl,
    mkdir: mkdirImpl,
    readFile: readFileImpl,
    readdir: readdirImpl,
    stat: statImpl,
    lstat: lstatImpl,
    chmod: chmodImpl,
  };

  return async function handleGrokConfigRequest(
    url,
    request,
    response,
    readBody,
    send,
  ) {
    if (!url.pathname.startsWith("/api/grok")) return false;
    response.setHeader("Cache-Control", "no-store");

    try {
      authorizeBearer(request, authToken);

      if (request.method === "GET" && url.pathname === "/api/grok/health") {
        return sendJson(response, send, 200, {
          status: "ok",
          service: GROK_CONFIG_SERVICE,
          schemaVersion: GROK_CONFIG_SCHEMA_VERSION,
        });
      }

      if (request.method === "GET" && url.pathname === "/api/grok/models") {
        const catalog = await loadModelsCatalog(io);
        return sendJson(response, send, 200, catalog);
      }

      if (request.method === "GET" && url.pathname === "/api/grok/agents") {
        const agents = await loadAgents(io);
        return sendJson(response, send, 200, { agents });
      }

      if (request.method === "GET" && url.pathname === "/api/grok/personas") {
        const personas = await loadPersonas(io);
        return sendJson(response, send, 200, { personas });
      }

      if (request.method === "GET" && url.pathname === "/api/grok/skills") {
        const skills = await loadProjectSkills(io);
        return sendJson(response, send, 200, { skills });
      }

      if (request.method === "GET" && url.pathname === "/api/grok/modules") {
        const modules = await loadWorkflowModules(io);
        return sendJson(response, send, 200, { modules });
      }

      if (
        request.method === "GET" &&
        url.pathname.startsWith("/api/grok/modules/")
      ) {
        const id = decodeURIComponent(
          url.pathname.slice("/api/grok/modules/".length),
        );
        const module = await loadWorkflowModuleById(
          io,
          id,
          url.searchParams.get("version"),
        );
        return sendJson(response, send, 200, { module });
      }

      if (
        request.method === "GET" &&
        url.pathname.startsWith("/api/grok/personas/")
      ) {
        const id = decodeURIComponent(
          url.pathname.slice("/api/grok/personas/".length),
        );
        const persona = await loadPersonaById(io, id);
        return sendJson(response, send, 200, { persona });
      }

      if (
        request.method === "GET" &&
        url.pathname === "/api/grok/assignments"
      ) {
        const assignments = await loadAssignments(io);
        return sendJson(response, send, 200, assignments);
      }

      if (
        request.method === "GET" &&
        url.pathname === "/api/grok/config-snapshot"
      ) {
        const snapshot = await loadConfigSnapshot(io);
        return sendJson(response, send, 200, snapshot);
      }

      if (
        request.method === "POST" &&
        url.pathname === "/api/grok/config-sync"
      ) {
        const raw = await readBody(request, MAX_BODY_BYTES);
        const payload = parseJson(raw);
        const receipt = await syncConfigAssignments(io, payload);
        return sendJson(response, send, 200, receipt);
      }

      if (request.method === "POST" && url.pathname === "/api/grok/apply") {
        const raw = await readBody(request, MAX_BODY_BYTES);
        const payload = parseJson(raw);
        const receipt = await applyChanges(io, payload);
        return sendJson(response, send, 200, receipt);
      }

      if (request.method === "GET" && url.pathname === "/api/grok/workflows") {
        const workflows = await loadWorkflows(io);
        return sendJson(response, send, 200, { workflows });
      }

      if (
        request.method === "GET" &&
        url.pathname.startsWith("/api/grok/workflows/")
      ) {
        const name = decodeURIComponent(
          url.pathname.slice("/api/grok/workflows/".length),
        );
        if (!name || name.includes("/")) {
          return sendJson(response, send, 404, {
            error: "not_found",
            message: "Unknown grok-config route.",
          });
        }
        const workflow = await loadWorkflowByName(io, name);
        return sendJson(response, send, 200, workflow);
      }

      if (
        request.method === "POST" &&
        url.pathname === "/api/grok/workflows/save"
      ) {
        const raw = await readBody(request, MAX_WORKFLOW_BODY_BYTES);
        const payload = parseJson(raw);
        const receipt = await saveWorkflow(io, payload);
        return sendJson(response, send, 200, receipt);
      }

      if (
        request.method === "GET" &&
        url.pathname === "/api/grok/workflow-presets"
      ) {
        return sendJson(response, send, 200, {
          presets: listWorkflowPresets(),
        });
      }

      if (request.method === "GET" && url.pathname === "/api/grok/roles") {
        const roles = await loadRoles(io);
        return sendJson(response, send, 200, { roles });
      }

      if (request.method === "GET" && url.pathname === "/api/grok/catalog") {
        const catalog = await buildGrokCatalog(io);
        return sendJson(response, send, 200, catalog);
      }

      return sendJson(response, send, 404, {
        error: "not_found",
        message: "Unknown grok-config route.",
      });
    } catch (error) {
      const status =
        typeof error?.statusCode === "number" ? error.statusCode : 500;
      return sendJson(response, send, status, {
        error: error?.code ?? "grok_config_error",
        message: error instanceof Error ? error.message : String(error),
        ...(error?.details && typeof error.details === "object"
          ? { details: error.details }
          : {}),
      });
    }
  };
}

export async function buildGrokCatalog(options = {}) {
  const io = normalizeIo(options);
  const [models, agents, personas, skills, modules, assignments, workflows, roles] =
    await Promise.all([
      loadModelsCatalog(io),
      loadAgents(io),
      loadPersonas(io),
      loadProjectSkills(io),
      loadWorkflowModules(io),
      loadAssignments(io),
      loadWorkflows(io),
      loadRoles(io),
    ]);
  return {
    service: GROK_CONFIG_SERVICE,
    schemaVersion: GROK_CONFIG_SCHEMA_VERSION,
    checkedAt: new Date(io.now()).toISOString(),
    models,
    agents,
    personas,
    skills,
    modules,
    assignments,
    workflows,
    presets: listWorkflowPresets().map((preset) => preset.id),
    roles,
  };
}

export function resolveGrokPaths(options = {}) {
  const home = resolve(options.homeDir ?? options.home ?? homedir());
  const grokHome = resolve(options.grokHome ?? join(home, ".grok"));
  const projectCwd = resolve(
    options.projectCwd ?? options.cwd ?? process.cwd(),
  );
  return {
    home,
    grokHome,
    projectCwd,
    configPath: resolve(options.configPath ?? join(grokHome, "config.toml")),
    agentsDir: resolve(options.agentsDir ?? join(grokHome, "agents")),
    personasDir: resolve(options.personasDir ?? join(grokHome, "personas")),
    workflowsDir: resolve(
      options.workflowsDir ?? join(grokHome, "workflows"),
    ),
    projectWorkflowsDir: resolve(
      options.projectWorkflowsDir ?? join(projectCwd, ".grok", "workflows"),
    ),
    projectSkillsDir: resolve(
      options.projectSkillsDir ?? join(projectCwd, ".agents", "skills"),
    ),
    projectModulesDir: resolve(
      options.projectModulesDir ??
        join(projectCwd, ".grok", "workflow-modules"),
    ),
    rolesDir: resolve(
      options.rolesDir ?? join(grokHome, "bundled", "roles"),
    ),
  };
}

export function parseWorkflowRhai(source, fileName) {
  const fileId = basename(fileName, ".rhai");
  const meta = extractRhaiMeta(source);
  const name =
    typeof meta?.name === "string" && meta.name.trim()
      ? meta.name.trim()
      : fileId;
  // List surface prefers the first comment description line; fall back to meta.
  const commentDescription = firstRhaiCommentDescription(source);
  const metaDescription =
    typeof meta?.description === "string" && meta.description.trim()
      ? clip(meta.description, MAX_DESCRIPTION_CHARS)
      : null;
  return {
    id: fileId,
    name,
    description: commentDescription ?? metaDescription ?? null,
    meta: meta ?? null,
  };
}

export function listWorkflowPresets() {
  return WORKFLOW_PRESETS.map((preset) => ({ ...preset }));
}

export function parseSimpleToml(source) {
  if (typeof source !== "string") {
    throw httpError(400, "invalid_toml", "TOML source must be text.");
  }
  const root = {};
  const tables = new Map();
  tables.set("", root);
  let currentPath = [];
  let current = root;
  let lineNo = 0;

  for (const rawLine of source.split(/\r?\n/)) {
    lineNo += 1;
    const line = stripTomlComment(rawLine).trim();
    if (!line) continue;

    const table = /^\[([^\]]+)\]$/.exec(line);
    if (table) {
      const path = splitTomlKeyPath(table[1].trim());
      currentPath = path;
      current = ensureTable(root, tables, path);
      continue;
    }

    const arrayTable = /^\[\[([^\]]+)\]\]$/.exec(line);
    if (arrayTable) {
      const path = splitTomlKeyPath(arrayTable[1].trim());
      const arr = ensureArrayTable(root, tables, path);
      const row = {};
      arr.push(row);
      currentPath = path;
      current = row;
      continue;
    }

    const kv = /^([A-Za-z0-9_.-]+|"[^"]+"|'[^']+')\s*=\s*(.+)$/.exec(line);
    if (!kv) {
      // Preserve tolerance for complex multi-line values by skipping them.
      continue;
    }
    const key = unquoteTomlKey(kv[1]);
    const value = parseTomlValue(kv[2].trim());
    if (value === undefined) continue;
    current[key] = value;
  }

  return { root, tables, lineCount: lineNo };
}

export function listModelSlotsFromConfig(source) {
  const slots = [];
  const lines = source.split(/\r?\n/);
  let currentSlot = null;
  let currentFields = null;

  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i];
    const trimmed = stripTomlComment(raw).trim();
    const header = /^\[([^\]]+)\]$/.exec(trimmed);
    if (header) {
      if (currentSlot && currentFields) {
        slots.push(finalizeSlot(currentSlot, currentFields));
      }
      currentSlot = null;
      currentFields = null;
      const path = splitTomlKeyPath(header[1].trim());
      if (path.length === 2 && path[0] === "model") {
        currentSlot = path[1];
        currentFields = {
          slot: path[1],
          headerLine: i + 1,
          modelLine: null,
          fields: {},
        };
      }
      continue;
    }
    if (!currentFields) continue;
    if (/^\[\[/.test(trimmed)) {
      slots.push(finalizeSlot(currentSlot, currentFields));
      currentSlot = null;
      currentFields = null;
      continue;
    }
    const kv = /^\s*([A-Za-z0-9_.-]+|"[^"]+"|'[^']+')\s*=\s*(.+)$/.exec(raw);
    if (!kv) continue;
    const key = unquoteTomlKey(kv[1]);
    const value = parseTomlValue(kv[2].trim());
    if (value === undefined) continue;
    currentFields.fields[key] = value;
    if (key === "model") currentFields.modelLine = i + 1;
  }
  if (currentSlot && currentFields) {
    slots.push(finalizeSlot(currentSlot, currentFields));
  }
  return slots.slice(0, MAX_MODEL_SLOTS);
}

export function rewriteModelSlotLines(source, slotModels) {
  // slotModels: Map<slotName, newModelId>
  if (!(slotModels instanceof Map) || slotModels.size === 0) return source;
  const lines = source.split(/\r?\n/);
  let currentSlot = null;
  const out = lines.map((raw) => {
    const trimmed = stripTomlComment(raw).trim();
    const header = /^\[([^\]]+)\]$/.exec(trimmed);
    if (header) {
      const path = splitTomlKeyPath(header[1].trim());
      currentSlot =
        path.length === 2 && path[0] === "model" ? path[1] : null;
      return raw;
    }
    if (/^\[\[/.test(trimmed)) {
      currentSlot = null;
      return raw;
    }
    if (!currentSlot || !slotModels.has(currentSlot)) return raw;
    const modelLine = /^(\s*model\s*=\s*)(?:"[^"]*"|'[^']*'|[^\s#]+)(.*)$/.exec(
      raw,
    );
    if (!modelLine) return raw;
    const next = slotModels.get(currentSlot);
    return `${modelLine[1]}${formatTomlString(next)}${modelLine[2]}`;
  });
  return out.join("\n");
}

export function parseAgentMarkdown(source, fileName) {
  const id = basename(fileName, ".md");
  const frontmatter = extractYamlFrontmatter(source);
  const body = frontmatter
    ? source.slice(frontmatter.endIndex)
    : source;
  const heading = firstMarkdownHeading(body);
  const fm = frontmatter?.data ?? {};
  const name =
    typeof fm.name === "string" && fm.name.trim() ? fm.name.trim() : id;
  const description =
    typeof fm.description === "string"
      ? clip(fm.description, MAX_DESCRIPTION_CHARS)
      : descriptionFromBody(body);
  const modelRef =
    typeof fm.model === "string" && fm.model.trim()
      ? fm.model.trim()
      : null;
  return {
    id,
    name,
    description: description ?? null,
    heading: heading ?? null,
    modelRef,
    promptMode:
      typeof fm.prompt_mode === "string" ? fm.prompt_mode.trim() : null,
    permissionMode:
      typeof fm.permission_mode === "string"
        ? fm.permission_mode.trim()
        : null,
  };
}

export function parseSkillMarkdown(source, directoryName) {
  const id = String(directoryName ?? "").trim();
  if (!id || !WORKFLOW_NAME_RE.test(id)) {
    throw httpError(
      400,
      "invalid_skill_id",
      "Skill directory id must match [A-Za-z0-9_-]+.",
    );
  }
  const frontmatter = extractYamlFrontmatter(String(source));
  const body = frontmatter ? source.slice(frontmatter.endIndex) : source;
  const fm = frontmatter?.data ?? {};
  const name =
    typeof fm.name === "string" && fm.name.trim() ? fm.name.trim() : id;
  const description =
    typeof fm.description === "string"
      ? clip(fm.description, MAX_DESCRIPTION_CHARS)
      : descriptionFromBody(body);
  return {
    id,
    name,
    description: description ?? null,
    sourceRef: `.agents/skills/${id}/SKILL.md`,
  };
}

export function parseWorkflowModule(source, fileName) {
  let parsed;
  try {
    parsed = JSON.parse(String(source));
  } catch {
    throw httpError(
      422,
      "invalid_module_json",
      `Workflow module "${fileName}" is not valid JSON.`,
    );
  }
  const fileId = basename(fileName, ".json");
  const id = String(parsed?.id ?? fileId).trim();
  const version = String(parsed?.version ?? "").trim();
  if (!WORKFLOW_NAME_RE.test(id) || id !== fileId) {
    throw httpError(
      422,
      "invalid_module_id",
      "Workflow module id must match its [A-Za-z0-9_-]+ filename.",
    );
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(version)) {
    throw httpError(
      422,
      "invalid_module_version",
      `Workflow module "${id}" needs a bounded version.`,
    );
  }
  const nodes = Array.isArray(parsed?.nodes) ? parsed.nodes : [];
  const edges = Array.isArray(parsed?.edges) ? parsed.edges : [];
  if (!nodes.length || nodes.length > 64 || edges.length > 128) {
    throw httpError(
      422,
      "invalid_module_graph",
      `Workflow module "${id}" must contain 1-64 nodes and at most 128 edges.`,
    );
  }
  const allowedRoles = new Set([
    "stage",
    "agent",
    "persona",
    "capability",
    "skill",
    "gate",
    "input",
    "artifact",
    "result",
  ]);
  const normalizedNodes = nodes.map((node, index) => {
    const nodeId = String(node?.id ?? "").trim();
    const role = String(node?.role ?? node?.meta?.am?.role ?? "").trim();
    if (!WORKFLOW_NAME_RE.test(nodeId) || !allowedRoles.has(role)) {
      throw httpError(
        422,
        "invalid_module_node",
        `Workflow module "${id}" has an invalid node at index ${index}.`,
      );
    }
    return {
      id: nodeId,
      role,
      meta: {
        am: {
          ...(node?.meta?.am && typeof node.meta.am === "object"
            ? node.meta.am
            : {}),
          role,
        },
      },
    };
  });
  const nodeIds = new Set(normalizedNodes.map((node) => node.id));
  const normalizedEdges = edges.map((edge, index) => {
    const from = String(edge?.from ?? "").trim();
    const to = String(edge?.to ?? "").trim();
    if (!nodeIds.has(from) || !nodeIds.has(to) || from === to) {
      throw httpError(
        422,
        "invalid_module_edge",
        `Workflow module "${id}" has an invalid edge at index ${index}.`,
      );
    }
    return { from, to };
  });
  const entry = String(parsed?.entry ?? "").trim();
  const exit = String(parsed?.exit ?? "").trim();
  if (!nodeIds.has(entry) || !nodeIds.has(exit)) {
    throw httpError(
      422,
      "invalid_module_boundary",
      `Workflow module "${id}" entry and exit must reference module nodes.`,
    );
  }
  return {
    id,
    version,
    description:
      typeof parsed.description === "string"
        ? clip(parsed.description, MAX_DESCRIPTION_CHARS)
        : null,
    entry,
    exit,
    params: Array.isArray(parsed.params)
      ? parsed.params
          .map((value) => String(value).trim())
          .filter((value) => WORKFLOW_NAME_RE.test(value))
          .slice(0, 32)
      : [],
    nodes: normalizedNodes,
    edges: normalizedEdges,
    sourceRef: `.grok/workflow-modules/${id}.json`,
  };
}

export function rewriteAgentModel(source, modelId) {
  const fm = extractYamlFrontmatter(source);
  if (!fm) {
    throw httpError(
      422,
      "agent_frontmatter_missing",
      "Agent markdown is missing YAML frontmatter; cannot reassign model.",
    );
  }
  const lines = fm.raw.split(/\r?\n/);
  let found = false;
  const next = lines.map((line) => {
    if (/^\s*model\s*:/.test(line)) {
      found = true;
      return `model: ${modelId}`;
    }
    return line;
  });
  if (!found) {
    // Insert after name/description if present, else at end of frontmatter.
    let insertAt = next.length;
    for (let i = 0; i < next.length; i += 1) {
      if (/^\s*(name|description)\s*:/.test(next[i])) insertAt = i + 1;
    }
    next.splice(insertAt, 0, `model: ${modelId}`);
  }
  return `---\n${next.join("\n").replace(/^\n+|\n+$/g, "")}\n---${source.slice(fm.endIndex)}`;
}

export function parsePersonaToml(source, fileName) {
  const id = basename(fileName, ".toml");
  const { root } = parseSimpleToml(source);
  const description =
    typeof root.description === "string"
      ? clip(root.description, MAX_DESCRIPTION_CHARS)
      : null;
  const modelRef =
    typeof root.model === "string" && root.model.trim()
      ? root.model.trim()
      : null;
  const inputs = Array.isArray(root.inputs)
    ? root.inputs.map(summarizeContract).filter(Boolean)
    : [];
  const outputs = Array.isArray(root.outputs)
    ? root.outputs.map(summarizeContract).filter(Boolean)
    : [];
  // parseSimpleToml maps [[inputs]] under root.inputs only if ensureArrayTable works.
  // Our parser stores array tables at path; recover from tables if needed is handled in parseSimpleToml.
  return {
    id,
    description,
    modelRef,
    inputs,
    outputs,
  };
}

export function rewritePersonaModel(source, modelId) {
  const lines = source.split(/\r?\n/);
  let found = false;
  let inOtherTable = false;
  const next = lines.map((raw) => {
    const trimmed = stripTomlComment(raw).trim();
    if (/^\[/.test(trimmed)) {
      inOtherTable = true;
      return raw;
    }
    if (inOtherTable) return raw;
    if (/^\s*model\s*=/.test(raw)) {
      found = true;
      const suffix = /\s*(#.*)?$/.exec(raw)?.[0] ?? "";
      // Keep pure rewrite of the assignment without trailing comment mangling beyond suffix capture.
      const comment = /(#.*)$/.exec(raw)?.[1] ?? "";
      return `model = ${formatTomlString(modelId)}${comment ? ` ${comment}` : ""}`;
    }
    return raw;
  });
  if (!found) {
    // Insert at top of root table.
    let insertAt = 0;
    // Prefer after description if present at root.
    for (let i = 0; i < next.length; i += 1) {
      if (/^\s*description\s*=/.test(next[i])) insertAt = i + 1;
      if (/^\[/.test(stripTomlComment(next[i]).trim())) break;
    }
    next.splice(insertAt, 0, `model = ${formatTomlString(modelId)}`);
  }
  return next.join("\n");
}

// --- internals ---

function normalizeIo(options = {}) {
  if (options.paths && options.readFile) {
    return {
      paths: options.paths,
      env: options.env ?? process.env,
      fetchLiveModels:
        options.fetchLiveModels ??
        ((opts) =>
          defaultFetchLiveModels({
            ...opts,
            env: options.env ?? process.env,
          })),
      now: options.now ?? Date.now,
      writeFile: options.writeFile ?? writeFile,
      copyFile: options.copyFile ?? copyFile,
      rename: options.rename ?? rename,
      mkdir: options.mkdir ?? mkdir,
      readFile: options.readFile ?? readFile,
      readdir: options.readdir ?? readdir,
      stat: options.stat ?? stat,
      lstat: options.lstat ?? lstat,
      chmod: options.chmod ?? chmod,
    };
  }
  const paths = resolveGrokPaths(options);
  const env = options.env ?? process.env;
  return {
    paths,
    env,
    fetchLiveModels:
      options.fetchLiveModels ??
      ((opts) => defaultFetchLiveModels({ ...opts, env })),
    now: options.now ?? Date.now,
    writeFile: options.writeFile ?? writeFile,
    copyFile: options.copyFile ?? copyFile,
    rename: options.rename ?? rename,
    mkdir: options.mkdir ?? mkdir,
    readFile: options.readFile ?? readFile,
    readdir: options.readdir ?? readdir,
    stat: options.stat ?? stat,
    lstat: options.lstat ?? lstat,
    chmod: options.chmod ?? chmod,
  };
}

async function loadModelsCatalog(io) {
  const configText = await readTextFile(io, io.paths.configPath, true);
  const slots = configText ? listModelSlotsFromConfig(configText) : [];
  const live = await io.fetchLiveModels({
    url: io.env.GROK_PROXY_MODELS_URL ?? DEFAULT_PROXY_MODELS_URL,
    apiKey: io.env.CLIPROXY_API_KEY,
  });
  const liveIds = new Set(
    (live.models ?? []).map((m) => m.id).filter(Boolean),
  );
  return {
    checkedAt: new Date(io.now()).toISOString(),
    proxy: {
      ok: live.ok,
      url: live.url,
      error: live.error ?? null,
      modelCount: live.models?.length ?? 0,
    },
    liveModels: live.models ?? [],
    slots: slots.map((slot) => ({
      id: slot.id,
      model: slot.model,
      name: slot.name ?? null,
      description: slot.description
        ? clip(slot.description, MAX_DESCRIPTION_CHARS)
        : null,
      baseUrl: slot.base_url ?? null,
      envKey: slot.env_key ?? null,
      apiBackend: slot.api_backend ?? null,
      contextWindow: slot.context_window ?? null,
      maxCompletionTokens: slot.max_completion_tokens ?? null,
      liveMatch: slot.model ? liveIds.has(slot.model) : false,
    })),
    defaults: parseModelsDefaults(configText),
  };
}

function parseModelsDefaults(source) {
  if (!source) return { default: null, webSearch: null };
  const { root } = parseSimpleToml(source);
  const models = root.models && typeof root.models === "object" ? root.models : {};
  return {
    default: typeof models.default === "string" ? models.default : null,
    webSearch:
      typeof models.web_search === "string" ? models.web_search : null,
  };
}

async function loadAgents(io) {
  const files = await listFiles(io, io.paths.agentsDir, ".md", MAX_AGENTS);
  const agents = [];
  for (const file of files) {
    const text = await readTextFile(io, file.path, false);
    if (text == null) continue;
    agents.push(parseAgentMarkdown(text, file.name));
  }
  agents.sort((a, b) => a.id.localeCompare(b.id));
  return agents;
}

async function loadPersonas(io) {
  const files = await listFiles(
    io,
    io.paths.personasDir,
    ".toml",
    MAX_PERSONAS,
  );
  const personas = [];
  for (const file of files) {
    const text = await readTextFile(io, file.path, false);
    if (text == null) continue;
    // Prefer array-table aware parse
    personas.push(parsePersonaTomlFull(text, file.name));
  }
  personas.sort((a, b) => a.id.localeCompare(b.id));
  return personas;
}

async function loadProjectSkills(io) {
  let entries;
  try {
    entries = await io.readdir(io.paths.projectSkillsDir, {
      withFileTypes: true,
    });
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
  const directories = entries
    .filter(
      (entry) =>
        entry?.isDirectory?.() &&
        !entry.isSymbolicLink?.() &&
        !entry.name.startsWith(".") &&
        WORKFLOW_NAME_RE.test(entry.name),
    )
    .sort((left, right) => left.name.localeCompare(right.name))
    .slice(0, MAX_SKILLS);
  const skills = [];
  for (const directory of directories) {
    const skillPath = join(
      io.paths.projectSkillsDir,
      directory.name,
      "SKILL.md",
    );
    const fileStat = await lstatFile(io, skillPath);
    if (!fileStat?.isFile?.() || fileStat.isSymbolicLink?.()) continue;
    const text = await readTextFile(io, skillPath, true);
    if (text == null) continue;
    skills.push(parseSkillMarkdown(text, directory.name));
  }
  return skills;
}

async function loadWorkflowModules(io) {
  const files = await listFiles(
    io,
    io.paths.projectModulesDir,
    ".json",
    MAX_MODULES,
  );
  const modules = [];
  for (const file of files) {
    const fileStat = await lstatFile(io, file.path);
    if (!fileStat?.isFile?.() || fileStat.isSymbolicLink?.()) continue;
    const text = await readTextFile(io, file.path, true);
    if (text == null) continue;
    const module = parseWorkflowModule(text, file.name);
    modules.push({
      id: module.id,
      version: module.version,
      description: module.description,
      params: module.params,
      nodeCount: module.nodes.length,
      edgeCount: module.edges.length,
      sourceRef: module.sourceRef,
    });
  }
  modules.sort((left, right) => left.id.localeCompare(right.id));
  return modules;
}

async function loadWorkflowModuleById(io, rawId, rawVersion) {
  const id = String(rawId ?? "").trim();
  if (!id || !WORKFLOW_NAME_RE.test(id)) {
    throw httpError(
      400,
      "invalid_module_id",
      "Workflow module id must match [A-Za-z0-9_-]+.",
    );
  }
  const path = join(io.paths.projectModulesDir, `${id}.json`);
  const fileStat = await lstatFile(io, path);
  if (!fileStat?.isFile?.() || fileStat.isSymbolicLink?.()) {
    throw httpError(
      404,
      "module_not_found",
      `Workflow module "${id}" was not found.`,
    );
  }
  const text = await readTextFile(io, path, true);
  if (text == null) {
    throw httpError(
      404,
      "module_not_found",
      `Workflow module "${id}" was not found.`,
    );
  }
  const module = parseWorkflowModule(text, `${id}.json`);
  const version = String(rawVersion ?? "").trim();
  if (version && version !== module.version) {
    throw httpError(
      409,
      "module_version_mismatch",
      `Workflow module "${id}" is ${module.version}, not ${version}.`,
      { requestedVersion: version, currentVersion: module.version },
    );
  }
  return module;
}

async function loadPersonaById(io, rawId) {
  const id = String(rawId ?? "").trim();
  if (!id || !WORKFLOW_NAME_RE.test(id)) {
    throw httpError(
      400,
      "invalid_persona_id",
      "Persona id must match [A-Za-z0-9_-]+.",
    );
  }
  const path = join(io.paths.personasDir, `${id}.toml`);
  const source = await readTextFile(io, path, false);
  if (source == null) {
    throw httpError(404, "persona_not_found", `Persona "${id}" was not found.`);
  }
  return parsePersonaTomlDetail(source, `${id}.toml`);
}

async function loadWorkflows(io) {
  const scopes = [
    { scope: "user", dir: io.paths.workflowsDir },
    { scope: "project", dir: io.paths.projectWorkflowsDir },
  ];
  const workflows = [];
  for (const { scope, dir } of scopes) {
    if (!dir) continue;
    const files = await listFiles(io, dir, ".rhai", MAX_WORKFLOWS);
    for (const file of files) {
      const text = await readTextFile(io, file.path, true);
      if (text == null) continue;
      const parsed = parseWorkflowRhai(text, file.name);
      const fileStat = await statFile(io, file.path);
      workflows.push({
        id: parsed.id,
        name: parsed.name,
        path: file.path,
        scope,
        size: fileStat?.size ?? Buffer.byteLength(text),
        mtime: fileStat?.mtime
          ? new Date(fileStat.mtime).toISOString()
          : null,
        description: parsed.description,
      });
    }
  }
  workflows.sort((a, b) => {
    if (a.scope !== b.scope) return a.scope.localeCompare(b.scope);
    return a.name.localeCompare(b.name);
  });
  return workflows.slice(0, MAX_WORKFLOWS);
}

async function loadWorkflowByName(io, rawName) {
  const name = String(rawName ?? "").trim();
  if (!name || !WORKFLOW_NAME_RE.test(name)) {
    throw httpError(
      400,
      "invalid_workflow_name",
      "Workflow name must match [A-Za-z0-9_-]+.",
    );
  }
  const candidates = [
    {
      scope: "project",
      path: join(io.paths.projectWorkflowsDir, `${name}.rhai`),
    },
    { scope: "user", path: join(io.paths.workflowsDir, `${name}.rhai`) },
  ];
  for (const candidate of candidates) {
    const text = await readTextFile(io, candidate.path, true);
    if (text == null) continue;
    const parsed = parseWorkflowRhai(text, `${name}.rhai`);
    const fileStat = await statFile(io, candidate.path);
    return {
      id: parsed.id,
      name: parsed.name,
      path: candidate.path,
      scope: candidate.scope,
      size: fileStat?.size ?? Buffer.byteLength(text),
      mtime: fileStat?.mtime ? new Date(fileStat.mtime).toISOString() : null,
      description: parsed.description,
      script: text,
      meta: parsed.meta,
    };
  }
  throw httpError(
    404,
    "workflow_not_found",
    `Workflow "${name}" was not found under user or project workflows.`,
  );
}

async function saveWorkflow(io, payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw httpError(400, "invalid_body", "Body must be a JSON object.");
  }
  const name = typeof payload.name === "string" ? payload.name.trim() : "";
  if (!name || !WORKFLOW_NAME_RE.test(name)) {
    throw httpError(
      400,
      "invalid_workflow_name",
      "Workflow name must match [A-Za-z0-9_-]+.",
    );
  }
  if (typeof payload.script !== "string") {
    throw httpError(
      400,
      "invalid_script",
      "Body.script must be a string.",
    );
  }
  if (Buffer.byteLength(payload.script) > MAX_FILE_BYTES) {
    throw httpError(
      413,
      "script_too_large",
      `Workflow script exceeds ${MAX_FILE_BYTES} bytes.`,
    );
  }
  const scope = payload.scope === "project" ? "project" : "user";
  if (payload.scope != null && payload.scope !== "user" && payload.scope !== "project") {
    throw httpError(
      400,
      "invalid_scope",
      'scope must be "user" or "project".',
    );
  }
  const dir =
    scope === "project" ? io.paths.projectWorkflowsDir : io.paths.workflowsDir;
  const path = join(dir, `${name}.rhai`);
  const existing = await readTextFile(io, path, true);
  const overwrite = payload.overwrite === true;
  let backupPath = null;
  if (existing != null && !overwrite) {
    throw httpError(
      409,
      "workflow_exists",
      `Workflow "${name}" already exists; pass overwrite:true to replace it.`,
      { path, scope },
    );
  }
  if (existing != null && overwrite) {
    const timestamp = new Date(io.now()).toISOString().replace(/[:.]/g, "-");
    backupPath = `${path}.bak-canvas-${timestamp}`;
    await io.copyFile(path, backupPath);
  }
  await atomicWrite(io, path, payload.script);
  const bytes = Buffer.byteLength(payload.script);
  return {
    receipt: {
      operation: "workflow-save",
      savedAt: new Date(io.now()).toISOString(),
      path,
      bytes,
      scope,
      name,
      backupPath,
      overwritten: existing != null,
    },
  };
}

async function loadRoles(io) {
  const files = await listFiles(io, io.paths.rolesDir, ".toml", MAX_ROLES);
  const roles = [];
  for (const file of files) {
    const text = await readTextFile(io, file.path, true);
    if (text == null) continue;
    roles.push(parseRoleToml(text, file.name));
  }
  roles.sort((a, b) => a.id.localeCompare(b.id));
  return roles;
}

function parseRoleToml(source, fileName) {
  const id = basename(fileName, ".toml");
  const description = extractTopLevelTomlString(source, "description");
  const model =
    extractTopLevelTomlString(source, "model") ??
    extractTopLevelTomlString(source, "model_ref");
  // Prefer explicit name field; otherwise use filename id.
  const named = extractTopLevelTomlString(source, "name");
  return {
    id,
    name: named && named.trim() ? named.trim() : id,
    description: description ? clip(description, MAX_DESCRIPTION_CHARS) : null,
    model: model && model.trim() ? model.trim() : null,
    path: fileName,
  };
}

function extractRhaiMeta(source) {
  if (typeof source !== "string" || !source.trim()) return null;
  // Match: let meta = #{ ... };
  const match = /let\s+meta\s*=\s*#\{([\s\S]*?)\};/.exec(source);
  if (!match) return null;
  const body = match[1];
  const meta = {};
  const nameMatch = /(?:^|,|\n)\s*name\s*:\s*"([^"]*)"/.exec(body);
  if (nameMatch) meta.name = nameMatch[1];
  const descMatch = /(?:^|,|\n)\s*description\s*:\s*"([^"]*)"/.exec(body);
  if (descMatch) meta.description = descMatch[1];
  // phases may be present; capture only titles as a light summary
  const phaseTitles = [];
  const phaseRe = /title\s*:\s*"([^"]*)"/g;
  let phaseMatch;
  while ((phaseMatch = phaseRe.exec(body))) {
    phaseTitles.push(phaseMatch[1]);
  }
  if (phaseTitles.length) meta.phases = phaseTitles;
  return Object.keys(meta).length ? meta : null;
}

function firstRhaiCommentDescription(source) {
  for (const raw of source.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("//")) {
      const text = line.replace(/^\/\/\s?/, "").trim();
      if (!text) continue;
      // Skip pure separators / meta markers
      if (/^[=*-]{3,}$/.test(text)) continue;
      if (/unverified-skeleton/i.test(text) && text.length < 40) continue;
      return clip(text, MAX_DESCRIPTION_CHARS);
    }
    // Stop at first non-comment, non-blank code line (meta block counts as code)
    break;
  }
  return null;
}

async function statFile(io, path) {
  try {
    const info = await io.stat(path);
    return {
      size: typeof info.size === "number" ? info.size : null,
      mtime: info.mtime ?? info.mtimeMs ?? null,
    };
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    return null;
  }
}

async function lstatFile(io, path) {
  try {
    return await io.lstat(path);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

const WORKFLOW_PRESETS = [
  {
    id: "single",
    title: "Single agent",
    description: "One agent() call for a focused task.",
    stageType: "single",
    script: `// unverified-skeleton — canvas preset; not executed by grok-config
// Single stage: one agent() call (counts against agent_budget, default 128).
let meta = #{
    name: "{{name}}",
    description: "Single-agent workflow skeleton",
};

// TODO: replace prompt / options for your task.
let result = agent(
    "Do the requested work.",
    #{
        label: "worker",
        // capability_mode: "full",
        // role: "implementer",
    },
);

result
`,
  },
  {
    id: "fanout",
    title: "Fan-out (foreach)",
    description: "foreach over items into a parallel() panel.",
    stageType: "foreach",
    script: `// unverified-skeleton — canvas preset; not executed by grok-config
// foreach / fan-out: each parallel slot spends agent_budget.
let meta = #{
    name: "{{name}}",
    description: "Fan-out workflow over a list of items",
};

// TODO: supply items (from args or a prior agent() call).
let items = if args.items != () { args.items } else { ["item-1", "item-2"] };

let jobs = [];
for item in items {
    // Build one job per item; parallel() runs them together.
    jobs.push(#{
        prompt: "Work on item: " + item,
        options: #{ label: "fanout-" + item },
    });
}

// parallel() consumes one agent_budget slot per job.
let results = parallel(jobs);
results
`,
  },
  {
    id: "reduce",
    title: "Reduce (fan-in)",
    description: "Fan-in synthesis after parallel workers.",
    stageType: "reduce",
    script: `// unverified-skeleton — canvas preset; not executed by grok-config
// reduce: synthesize outputs from prior workers (agent_budget for synthesis call).
let meta = #{
    name: "{{name}}",
    description: "Fan-in reduce / synthesis skeleton",
};

// TODO: collect worker outputs (here: placeholder strings).
let worker_outputs = if args.outputs != () { args.outputs } else { ["a", "b"] };

let synthesis = agent(
    "Synthesize the following worker outputs into one result:\\n" + worker_outputs.to_string(),
    #{
        label: "reducer",
        // role: "reviewer",
    },
);

synthesis
`,
  },
  {
    id: "loop",
    title: "Bounded loop",
    description: "Retry / critique loop with an explicit round cap.",
    stageType: "loop",
    script: `// unverified-skeleton — canvas preset; not executed by grok-config
// loop: bounded critique/retry; each agent() spends agent_budget.
let meta = #{
    name: "{{name}}",
    description: "Bounded retry/critique loop skeleton",
};

let max_rounds = 3; // explicit round cap — never unbounded
let draft = if args.draft != () { args.draft } else { "" };
let critique = ();

for round in 0..max_rounds {
    let attempt = agent(
        "Produce or refine the draft (round " + round.to_string() + "). Prior critique: " + critique.to_string(),
        #{ label: "loop-worker-" + round.to_string() },
    );
    draft = attempt;

    critique = agent(
        "Critique the draft and say whether it is done.",
        #{ label: "loop-critic-" + round.to_string() },
    );
    // TODO: break early when critique signals done.
}

draft
`,
  },
  {
    id: "dag",
    title: "DAG chain",
    description: "scout → implementer → reviewer sequential chain.",
    stageType: "dag",
    script: `// unverified-skeleton — canvas preset; not executed by grok-config
// dag: resume-style sequential agent() chain (still one run; no cross-process resume).
// Each agent() spends agent_budget.
let meta = #{
    name: "{{name}}",
    description: "Scout → implementer → reviewer DAG skeleton",
    phases: [
        #{ title: "Scout", detail: "Map the problem space" },
        #{ title: "Implement", detail: "Apply the change" },
        #{ title: "Review", detail: "Check the result" },
    ],
};

phase("Scout");
let scout = agent(
    "Scout the task and list critical files / risks.",
    #{ label: "scout", role: "explore" },
);

phase("Implement");
// Resume-style sequencing: feed prior output into the next agent() in-script.
let implementer = agent(
    "Implement based on scout notes: " + scout.to_string(),
    #{ label: "implementer", role: "implementer" },
);

phase("Review");
let reviewer = agent(
    "Review the implementation result: " + implementer.to_string(),
    #{ label: "reviewer", role: "reviewer" },
);

reviewer
`,
  },
  {
    id: "dynamic",
    title: "Dynamic planner",
    description: "Planner/controller that adjusts via a new run (immutable runs).",
    stageType: "dynamic",
    script: `// unverified-skeleton — canvas preset; not executed by grok-config
// dynamic: planner/controller decides next work; adjust => new run (runs are immutable).
// agent_budget applies to every agent() / parallel() call.
let meta = #{
    name: "{{name}}",
    description: "Dynamic planner/controller skeleton",
};

// Controller plans the next action set (does not mutate a live run graph).
let plan = agent(
    "Plan the next bounded steps for: " + args.to_string(),
    #{ label: "controller" },
);

// TODO: interpret plan and either:
// 1) run a small fixed set of agent()/parallel() calls in this run, or
// 2) emit a revised script and launch a *new* /workflow run (immutable-run model).
let work = agent(
    "Execute the controller plan: " + plan.to_string(),
    #{ label: "worker" },
);

// "adjust" / "enough" are canvas control labels — encode stop conditions here.
work
`,
  },
  {
    id: "mesh",
    title: "Cross-review mesh",
    description: "N agents cross-review each other, then reduce (budget-heavy).",
    stageType: "mesh",
    script: `// unverified-skeleton — canvas preset; not executed by grok-config
// mesh: dense multi-agent cross-review then reduce — expensive on agent_budget.
let meta = #{
    name: "{{name}}",
    description: "N-agent mesh cross-review + reduce skeleton",
};

// Keep N small; mesh can exhaust agent_budget (default 128, max 1024) quickly.
let n = 3;
let seeds = [];
for i in 0..n {
    seeds.push("perspective-" + i.to_string());
}

// Round 1: independent drafts in parallel.
let draft_jobs = [];
for seed in seeds {
    draft_jobs.push(#{
        prompt: "Draft an answer from " + seed,
        options: #{ label: "mesh-draft-" + seed },
    });
}
let drafts = parallel(draft_jobs);

// Round 2: each agent reviews others (N more budget slots if parallelized).
let review_jobs = [];
for seed in seeds {
    review_jobs.push(#{
        prompt: "Cross-review peer drafts: " + drafts.to_string(),
        options: #{ label: "mesh-review-" + seed },
    });
}
let reviews = parallel(review_jobs);

// Reduce / synthesize final answer.
let final = agent(
    "Reduce mesh drafts and reviews into one answer.\\nDrafts: " + drafts.to_string() + "\\nReviews: " + reviews.to_string(),
    #{ label: "mesh-reduce" },
);

final
`,
  },
];

function parsePersonaTomlFull(source, fileName) {
  const id = basename(fileName, ".toml");
  const description = extractTopLevelTomlString(source, "description");
  const modelRef = extractTopLevelTomlString(source, "model");
  const inputs = extractArrayTables(source, "inputs").map(summarizeContract);
  const outputs = extractArrayTables(source, "outputs").map(summarizeContract);
  return {
    id,
    description: description ? clip(description, MAX_DESCRIPTION_CHARS) : null,
    modelRef,
    inputs: inputs.filter(Boolean),
    outputs: outputs.filter(Boolean),
  };
}

export function parsePersonaTomlDetail(source, fileName) {
  return {
    ...parsePersonaTomlFull(source, fileName),
    instructions: clip(
      extractTopLevelTomlMultilineString(source, "instructions") ?? "",
      MAX_PERSONA_INSTRUCTIONS_CHARS,
    ),
  };
}

async function loadAssignments(io) {
  const configText = await readTextFile(io, io.paths.configPath, true);
  const slots = configText ? listModelSlotsFromConfig(configText) : [];
  const slotIds = new Set(slots.map((s) => s.id));
  const slotByModel = new Map();
  for (const slot of slots) {
    if (slot.model) slotByModel.set(slot.model, slot.id);
  }
  const subagentModels = parseSubagentModels(configText);
  const agents = await loadAgents(io);
  const personas = await loadPersonas(io);

  const agentAssignments = agents.map((agent) => {
    const ref = agent.modelRef;
    const fromSubagents = subagentModels[agent.id] ?? null;
    const resolvedRef = fromSubagents ?? ref;
    return resolveAssignment({
      kind: "agent",
      id: agent.id,
      modelRef: ref,
      authoritativeRef: fromSubagents,
      resolvedRef,
      slotIds,
      slotByModel,
      slots,
    });
  });

  const personaAssignments = personas.map((persona) =>
    resolveAssignment({
      kind: "persona",
      id: persona.id,
      modelRef: persona.modelRef,
      authoritativeRef: null,
      resolvedRef: persona.modelRef,
      slotIds,
      slotByModel,
      slots,
    }),
  );

  const slotAssignments = slots.map((slot) => ({
    kind: "model-slot",
    id: slot.id,
    model: slot.model,
    resolvable: Boolean(slot.model),
    unresolved: slot.model ? null : "missing_model_value",
  }));

  return {
    checkedAt: new Date(io.now()).toISOString(),
    modelSlots: slotAssignments,
    agents: agentAssignments,
    personas: personaAssignments,
    subagentModels,
  };
}

export function configRevision(source) {
  return createHash("sha256").update(String(source), "utf8").digest("hex");
}

export function rewriteSubagentModelAssignments(source, assignments) {
  const requested =
    assignments instanceof Map
      ? new Map(assignments)
      : new Map(
          Object.entries(assignments ?? {}).map(([agentId, modelRef]) => [
            String(agentId),
            String(modelRef),
          ]),
        );
  if (!requested.size) return String(source);

  const lines = String(source).split(/\r?\n/);
  let sectionStart = -1;
  let sectionEnd = lines.length;
  for (let index = 0; index < lines.length; index += 1) {
    const trimmed = stripTomlComment(lines[index]).trim();
    const header = /^\[([^\]]+)\]$/.exec(trimmed);
    if (!header) continue;
    const path = splitTomlKeyPath(header[1].trim());
    if (
      path.length === 2 &&
      path[0] === "subagents" &&
      path[1] === "models"
    ) {
      sectionStart = index;
      continue;
    }
    if (sectionStart >= 0) {
      sectionEnd = index;
      break;
    }
  }

  if (sectionStart < 0) {
    const separator =
      lines.length && lines.at(-1) !== "" ? [""] : [];
    return [
      ...lines,
      ...separator,
      "[subagents.models]",
      ...[...requested.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(
          ([agentId, modelRef]) =>
            `${formatTomlKey(agentId)} = ${formatTomlString(modelRef)}`,
        ),
    ].join("\n");
  }

  const consumed = new Set();
  for (let index = sectionStart + 1; index < sectionEnd; index += 1) {
    const raw = lines[index];
    const match =
      /^(\s*)([A-Za-z0-9_.-]+|"[^"]+"|'[^']+')\s*=\s*(.*)$/.exec(raw);
    if (!match) continue;
    const agentId = unquoteTomlKey(match[2]);
    if (!requested.has(agentId)) continue;
    const comment = /(\s+#.*)$/.exec(match[3])?.[1] ?? "";
    lines[index] = `${match[1]}${match[2]} = ${formatTomlString(
      requested.get(agentId),
    )}${comment}`;
    consumed.add(agentId);
  }

  const additions = [...requested.entries()]
    .filter(([agentId]) => !consumed.has(agentId))
    .sort(([left], [right]) => left.localeCompare(right))
    .map(
      ([agentId, modelRef]) =>
        `${formatTomlKey(agentId)} = ${formatTomlString(modelRef)}`,
    );
  lines.splice(sectionEnd, 0, ...additions);
  return lines.join("\n");
}

async function loadConfigSnapshot(io) {
  const configText = await readTextFile(io, io.paths.configPath, false);
  if (configText == null) {
    throw httpError(500, "config_missing", "config.toml is not readable.");
  }
  const parsed = parseSimpleToml(configText).root;
  return {
    schemaVersion: 1,
    revision: configRevision(configText),
    writable: {
      defaultModel:
        typeof parsed.models?.default === "string"
          ? parsed.models.default
          : null,
      subagentModels: parseSubagentModels(configText),
    },
  };
}

async function syncConfigAssignments(io, payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw httpError(400, "invalid_body", "Body must be a JSON object.");
  }
  const expectedRevision =
    typeof payload.expectedRevision === "string"
      ? payload.expectedRevision.trim()
      : "";
  const requestId =
    typeof payload.requestId === "string" ? payload.requestId.trim() : "";
  const dryRun = payload.dryRun === true;
  if (!/^[a-f0-9]{64}$/.test(expectedRevision)) {
    throw httpError(
      400,
      "invalid_revision",
      "expectedRevision must be a SHA-256 revision from config-snapshot.",
    );
  }
  if (!/^[A-Za-z0-9_.:-]{6,120}$/.test(requestId)) {
    throw httpError(
      400,
      "invalid_request_id",
      "requestId must be 6-120 safe characters.",
    );
  }
  if (
    !Array.isArray(payload.assignments) ||
    payload.assignments.length === 0 ||
    payload.assignments.length > MAX_CHANGES
  ) {
    throw httpError(
      400,
      "invalid_assignments",
      `assignments must contain 1-${MAX_CHANGES} explicit agent assignments.`,
    );
  }

  const configText = await readTextFile(io, io.paths.configPath, false);
  if (configText == null) {
    throw httpError(500, "config_missing", "config.toml is not readable.");
  }
  const beforeRevision = configRevision(configText);
  if (beforeRevision !== expectedRevision) {
    throw httpError(
      409,
      "revision_conflict",
      "config.toml changed after the canvas snapshot; refresh before syncing.",
      { currentRevision: beforeRevision },
    );
  }

  const knownAgents = new Set((await loadAgents(io)).map((agent) => agent.id));
  const slots = listModelSlotsFromConfig(configText);
  const knownModelRefs = new Set(
    slots.flatMap((slot) => [slot.id, slot.model]).filter(Boolean),
  );
  const normalized = new Map();
  const errors = [];
  for (let index = 0; index < payload.assignments.length; index += 1) {
    const assignment = payload.assignments[index];
    const agentId =
      typeof assignment?.agentId === "string"
        ? assignment.agentId.trim()
        : "";
    const modelRef =
      typeof assignment?.modelRef === "string"
        ? assignment.modelRef.trim()
        : "";
    if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,119}$/.test(agentId)) {
      errors.push({ index, error: "invalid_agent_id" });
      continue;
    }
    if (!knownAgents.has(agentId)) {
      errors.push({ index, error: "unknown_agent", agentId });
      continue;
    }
    if (!/^[A-Za-z0-9][A-Za-z0-9._:/@+-]{0,199}$/.test(modelRef)) {
      errors.push({ index, error: "invalid_model_ref", agentId });
      continue;
    }
    if (!knownModelRefs.has(modelRef)) {
      errors.push({
        index,
        error: "unknown_model_ref",
        agentId,
        modelRef,
      });
      continue;
    }
    normalized.set(agentId, modelRef);
  }
  if (errors.length) {
    throw httpError(
      422,
      "config_sync_validation_failed",
      "One or more explicit agent assignments failed validation.",
      { errors },
    );
  }

  const beforeAssignments = parseSubagentModels(configText);
  const nextConfig = rewriteSubagentModelAssignments(configText, normalized);
  assertPreservedUnrelatedSections(configText, nextConfig);
  const diff = [...normalized.entries()].flatMap(([agentId, modelRef]) => {
    const before = beforeAssignments[agentId] ?? null;
    if (before === modelRef) return [];
    return [{ agentId, before, after: modelRef }];
  });
  const afterRevision = configRevision(nextConfig);
  if (!dryRun && diff.length) {
    const timestamp = new Date(io.now()).toISOString().replace(/[:.]/g, "-");
    await io.copyFile(
      io.paths.configPath,
      `${io.paths.configPath}.bak-canvas-${timestamp}`,
    );
    await atomicWrite(io, io.paths.configPath, nextConfig);
  }

  return {
    operation: "config-sync",
    requestId,
    dryRun,
    changeCount: diff.length,
    beforeRevision,
    afterRevision,
    diff,
    applies: "next-session",
  };
}

function resolveAssignment({
  kind,
  id,
  modelRef,
  authoritativeRef,
  resolvedRef,
  slotIds,
  slotByModel,
  slots,
}) {
  if (!resolvedRef) {
    return {
      kind,
      id,
      modelRef,
      authoritativeRef,
      resolvedModel: null,
      resolvedSlot: null,
      resolvable: false,
      unresolved: "missing_model_ref",
    };
  }
  // Prefer exact slot id match, then slot whose model equals the ref.
  let resolvedSlot = null;
  if (slotIds.has(resolvedRef)) {
    resolvedSlot = resolvedRef;
  } else if (slotByModel.has(resolvedRef)) {
    resolvedSlot = slotByModel.get(resolvedRef);
  }
  const slot = resolvedSlot
    ? slots.find((s) => s.id === resolvedSlot) ?? null
    : null;
  const resolvedModel = slot?.model ?? resolvedRef;
  const resolvable = Boolean(resolvedSlot || resolvedModel);
  return {
    kind,
    id,
    modelRef,
    authoritativeRef,
    resolvedModel,
    resolvedSlot,
    resolvable,
    unresolved: resolvable ? null : "unresolvable_model_ref",
  };
}

function parseSubagentModels(source) {
  if (!source) return {};
  const result = {};
  const lines = source.split(/\r?\n/);
  let inSection = false;
  for (const raw of lines) {
    const trimmed = stripTomlComment(raw).trim();
    const header = /^\[([^\]]+)\]$/.exec(trimmed);
    if (header) {
      const path = splitTomlKeyPath(header[1].trim());
      inSection =
        path.length === 2 &&
        path[0] === "subagents" &&
        path[1] === "models";
      continue;
    }
    if (!inSection) continue;
    if (/^\[\[/.test(trimmed)) {
      inSection = false;
      continue;
    }
    const kv = /^\s*([A-Za-z0-9_.-]+|"[^"]+"|'[^']+')\s*=\s*(.+)$/.exec(raw);
    if (!kv) continue;
    const key = unquoteTomlKey(kv[1]);
    const value = parseTomlValue(kv[2].trim());
    if (typeof value === "string") result[key] = value;
  }
  return result;
}

async function applyChanges(io, payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw httpError(400, "invalid_body", "Body must be a JSON object.");
  }
  const changes = payload.changes;
  if (!Array.isArray(changes) || changes.length === 0) {
    throw httpError(
      400,
      "invalid_changes",
      "Body.changes must be a non-empty array.",
    );
  }
  if (changes.length > MAX_CHANGES) {
    throw httpError(
      400,
      "too_many_changes",
      `At most ${MAX_CHANGES} changes are allowed per apply.`,
    );
  }

  const live = await io.fetchLiveModels({
    url: io.env.GROK_PROXY_MODELS_URL ?? DEFAULT_PROXY_MODELS_URL,
    apiKey: io.env.CLIPROXY_API_KEY,
  });
  if (!live.ok) {
    throw httpError(
      502,
      "proxy_unavailable",
      live.error ?? "Live model proxy is unavailable.",
      { proxy: { ok: false, url: live.url, error: live.error } },
    );
  }
  const liveIds = new Set((live.models ?? []).map((m) => m.id).filter(Boolean));

  const configText = await readTextFile(io, io.paths.configPath, false);
  if (configText == null) {
    throw httpError(500, "config_missing", "config.toml is not readable.");
  }
  const slots = listModelSlotsFromConfig(configText);
  const slotIds = new Set(slots.map((s) => s.id));

  const agents = await loadAgents(io);
  const agentIds = new Set(agents.map((a) => a.id));
  const personas = await loadPersonas(io);
  const personaIds = new Set(personas.map((p) => p.id));

  const normalized = [];
  const errors = [];
  for (let i = 0; i < changes.length; i += 1) {
    const change = changes[i];
    if (!change || typeof change !== "object") {
      errors.push({ index: i, error: "invalid_change", message: "Change must be an object." });
      continue;
    }
    const target = change.target;
    const id = typeof change.id === "string" ? change.id.trim() : "";
    const model =
      typeof change.model === "string" ? change.model.trim() : "";
    if (!["model-slot", "agent", "persona"].includes(target)) {
      errors.push({
        index: i,
        error: "invalid_target",
        message: "target must be model-slot, agent, or persona.",
      });
      continue;
    }
    if (!id) {
      errors.push({
        index: i,
        error: "invalid_id",
        message: "id is required.",
      });
      continue;
    }
    if (!model) {
      errors.push({
        index: i,
        error: "invalid_model",
        message: "model is required.",
      });
      continue;
    }
    if (!liveIds.has(model)) {
      errors.push({
        index: i,
        error: "unknown_model",
        message: `Model "${model}" is not in the live proxy model list.`,
        id,
        target,
        model,
      });
      continue;
    }
    if (target === "model-slot" && !slotIds.has(id)) {
      errors.push({
        index: i,
        error: "unknown_slot",
        message: `Model slot "${id}" is not present in config.toml.`,
        id,
        target,
        model,
      });
      continue;
    }
    if (target === "agent" && !agentIds.has(id)) {
      errors.push({
        index: i,
        error: "unknown_agent",
        message: `Agent "${id}" was not found under agents/.`,
        id,
        target,
        model,
      });
      continue;
    }
    if (target === "persona" && !personaIds.has(id)) {
      errors.push({
        index: i,
        error: "unknown_persona",
        message: `Persona "${id}" was not found under personas/.`,
        id,
        target,
        model,
      });
      continue;
    }
    normalized.push({ target, id, model, index: i });
  }

  if (errors.length) {
    throw httpError(
      422,
      "apply_validation_failed",
      "One or more changes failed validation.",
      { errors },
    );
  }

  const slotChanges = new Map();
  const agentChanges = new Map();
  const personaChanges = new Map();
  for (const change of normalized) {
    if (change.target === "model-slot") slotChanges.set(change.id, change.model);
    if (change.target === "agent") agentChanges.set(change.id, change.model);
    if (change.target === "persona") personaChanges.set(change.id, change.model);
  }

  const diffs = [];
  const timestamp = new Date(io.now()).toISOString().replace(/[:.]/g, "-");
  let backupPath = null;
  let nextConfig = configText;

  if (slotChanges.size > 0) {
    nextConfig = rewriteModelSlotLines(configText, slotChanges);
    if (nextConfig === configText) {
      // Still allow no-op if values already match, but verify each slot has a model line.
      for (const [slot] of slotChanges) {
        const existing = slots.find((s) => s.id === slot);
        if (!existing?.modelLine) {
          throw httpError(
            422,
            "slot_model_line_missing",
            `Slot "${slot}" has no model = line to rewrite.`,
            { slot },
          );
        }
      }
    }
    // Guard: never rewrite hooks/ui/mcp bytes unexpectedly — compare non-model sections.
    assertPreservedUnrelatedSections(configText, nextConfig);

    backupPath = `${io.paths.configPath}.bak-canvas-${timestamp}`;
    await io.copyFile(io.paths.configPath, backupPath);
    await atomicWrite(io, io.paths.configPath, nextConfig);
    for (const [slot, model] of slotChanges) {
      const before = slots.find((s) => s.id === slot)?.model ?? null;
      diffs.push({
        target: "model-slot",
        id: slot,
        before,
        after: model,
        path: "config.toml",
      });
    }
  }

  for (const [agentId, model] of agentChanges) {
    const path = join(io.paths.agentsDir, `${agentId}.md`);
    const beforeText = await readTextFile(io, path, false);
    if (beforeText == null) {
      throw httpError(500, "agent_unreadable", `Cannot read agent ${agentId}.`);
    }
    const before = parseAgentMarkdown(beforeText, `${agentId}.md`).modelRef;
    const afterText = rewriteAgentModel(beforeText, model);
    await atomicWrite(io, path, afterText);
    diffs.push({
      target: "agent",
      id: agentId,
      before,
      after: model,
      path: `agents/${agentId}.md`,
    });
  }

  for (const [personaId, model] of personaChanges) {
    const path = join(io.paths.personasDir, `${personaId}.toml`);
    const beforeText = await readTextFile(io, path, false);
    if (beforeText == null) {
      throw httpError(
        500,
        "persona_unreadable",
        `Cannot read persona ${personaId}.`,
      );
    }
    const before = parsePersonaTomlFull(beforeText, `${personaId}.toml`).modelRef;
    const afterText = rewritePersonaModel(beforeText, model);
    await atomicWrite(io, path, afterText);
    diffs.push({
      target: "persona",
      id: personaId,
      before,
      after: model,
      path: `personas/${personaId}.toml`,
    });
  }

  return {
    receipt: {
      operation: "apply",
      appliedAt: new Date(io.now()).toISOString(),
      changeCount: normalized.length,
      backupPath,
    },
    diff: diffs,
  };
}

function assertPreservedUnrelatedSections(before, after) {
  // Byte-for-byte equality for non-[model.*] regions is ensured by line-local rewrites,
  // but also refuse if hooks/ui/mcp blocks themselves changed.
  for (const section of ["hooks", "ui", "mcp", "mcp_servers", "permission"]) {
    const b = extractTopLevelSectionBlock(before, section);
    const a = extractTopLevelSectionBlock(after, section);
    if (b !== a) {
      throw httpError(
        500,
        "unrelated_section_mutated",
        `Refusing to write config.toml because section [${section}] would change.`,
      );
    }
  }
}

function extractTopLevelSectionBlock(source, sectionName) {
  const lines = source.split(/\r?\n/);
  const out = [];
  let capturing = false;
  for (const raw of lines) {
    const trimmed = stripTomlComment(raw).trim();
    const header = /^\[([^\]]+)\]$/.exec(trimmed);
    if (header) {
      const path = splitTomlKeyPath(header[1].trim());
      capturing = path[0] === sectionName;
    }
    const arrayHeader = /^\[\[([^\]]+)\]\]$/.exec(trimmed);
    if (arrayHeader) {
      const path = splitTomlKeyPath(arrayHeader[1].trim());
      capturing = path[0] === sectionName;
    }
    if (capturing) out.push(raw);
  }
  return out.join("\n");
}

async function atomicWrite(io, path, content) {
  await io.mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp-${randomBytes(6).toString("hex")}`;
  await io.writeFile(tmp, content, "utf8");
  try {
    const current = await io.stat(path);
    if (current?.mode != null && typeof io.chmod === "function") {
      await io.chmod(tmp, current.mode & 0o777);
    }
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  await io.rename(tmp, path);
}

async function listFiles(io, dir, extension, max) {
  try {
    const names = await io.readdir(dir);
    return names
      .filter((name) => name.endsWith(extension) && !name.startsWith("."))
      .sort()
      .slice(0, max)
      .map((name) => ({ name, path: join(dir, name) }));
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

async function readTextFile(io, path, optional) {
  try {
    const text = await io.readFile(path, "utf8");
    if (Buffer.byteLength(text) > MAX_FILE_BYTES) {
      throw httpError(
        500,
        "file_too_large",
        `File exceeds ${MAX_FILE_BYTES} bytes.`,
      );
    }
    return text;
  } catch (error) {
    if (optional && error?.code === "ENOENT") return null;
    if (error?.statusCode) throw error;
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

export async function defaultFetchLiveModels({
  url = DEFAULT_PROXY_MODELS_URL,
  apiKey,
  timeoutMs = 4_000,
} = {}) {
  const target = typeof url === "string" ? url : DEFAULT_PROXY_MODELS_URL;
  if (!apiKey) {
    return {
      ok: false,
      url: target,
      error: "CLIPROXY_API_KEY is not set.",
      models: [],
    };
  }
  try {
    const body = await httpsGetJson(target, {
      headers: { Authorization: `Bearer ${apiKey}` },
      timeoutMs,
      rejectUnauthorized: false,
    });
    const models = normalizeLiveModels(body);
    return { ok: true, url: target, error: null, models };
  } catch (error) {
    return {
      ok: false,
      url: target,
      error: error instanceof Error ? error.message : String(error),
      models: [],
    };
  }
}

function normalizeLiveModels(body) {
  const list = Array.isArray(body?.data)
    ? body.data
    : Array.isArray(body?.models)
      ? body.models
      : Array.isArray(body)
        ? body
        : [];
  return list
    .map((entry) => {
      if (typeof entry === "string") return { id: entry };
      if (entry && typeof entry === "object" && typeof entry.id === "string") {
        return {
          id: entry.id,
          ...(typeof entry.owned_by === "string"
            ? { ownedBy: entry.owned_by }
            : {}),
          ...(typeof entry.object === "string" ? { object: entry.object } : {}),
        };
      }
      return null;
    })
    .filter(Boolean);
}

function httpsGetJson(url, { headers = {}, timeoutMs = 4_000, rejectUnauthorized = false } = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const parsed = new URL(url);
    const req = https.request(
      {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port || 443,
        path: `${parsed.pathname}${parsed.search}`,
        method: "GET",
        headers: {
          Accept: "application/json",
          ...headers,
        },
        rejectUnauthorized,
      },
      (res) => {
        let raw = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          raw += chunk;
          if (Buffer.byteLength(raw) > MAX_FILE_BYTES) {
            req.destroy(new Error("Proxy models response too large"));
          }
        });
        res.on("end", () => {
          if ((res.statusCode ?? 500) >= 400) {
            rejectPromise(
              new Error(
                `Proxy models request failed with HTTP ${res.statusCode ?? "unknown"}`,
              ),
            );
            return;
          }
          try {
            resolvePromise(JSON.parse(raw || "{}"));
          } catch {
            rejectPromise(new Error("Proxy models response was not JSON"));
          }
        });
      },
    );
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error("Proxy models request timed out"));
    });
    req.on("error", rejectPromise);
    req.end();
  });
}

function finalizeSlot(slotId, fields) {
  return {
    id: slotId,
    model:
      typeof fields.fields.model === "string" ? fields.fields.model : null,
    name: typeof fields.fields.name === "string" ? fields.fields.name : null,
    description:
      typeof fields.fields.description === "string"
        ? fields.fields.description
        : null,
    base_url:
      typeof fields.fields.base_url === "string"
        ? fields.fields.base_url
        : null,
    env_key:
      typeof fields.fields.env_key === "string"
        ? fields.fields.env_key
        : null,
    api_backend:
      typeof fields.fields.api_backend === "string"
        ? fields.fields.api_backend
        : null,
    context_window:
      typeof fields.fields.context_window === "number"
        ? fields.fields.context_window
        : null,
    max_completion_tokens:
      typeof fields.fields.max_completion_tokens === "number"
        ? fields.fields.max_completion_tokens
        : null,
    modelLine: fields.modelLine,
    headerLine: fields.headerLine,
  };
}

function ensureTable(root, tables, path) {
  const key = path.join("\0");
  if (tables.has(key)) return tables.get(key);
  let cursor = root;
  const acc = [];
  for (const part of path) {
    acc.push(part);
    const accKey = acc.join("\0");
    if (!tables.has(accKey)) {
      if (
        cursor[part] == null ||
        typeof cursor[part] !== "object" ||
        Array.isArray(cursor[part])
      ) {
        cursor[part] = {};
      }
      tables.set(accKey, cursor[part]);
    }
    cursor = tables.get(accKey);
  }
  return cursor;
}

function ensureArrayTable(root, tables, path) {
  const parentPath = path.slice(0, -1);
  const leaf = path[path.length - 1];
  const parent = ensureTable(root, tables, parentPath);
  if (!Array.isArray(parent[leaf])) parent[leaf] = [];
  return parent[leaf];
}

function splitTomlKeyPath(raw) {
  const parts = [];
  const re = /"([^"]+)"|'([^']+)'|([A-Za-z0-9_-]+)/g;
  let match;
  while ((match = re.exec(raw))) {
    parts.push(match[1] ?? match[2] ?? match[3]);
  }
  return parts;
}

function unquoteTomlKey(raw) {
  if (
    (raw.startsWith('"') && raw.endsWith('"')) ||
    (raw.startsWith("'") && raw.endsWith("'"))
  ) {
    return raw.slice(1, -1);
  }
  return raw;
}

function stripTomlComment(line) {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === "'" && !inDouble) inSingle = !inSingle;
    else if (ch === '"' && !inSingle) inDouble = !inDouble;
    else if (ch === "#" && !inSingle && !inDouble) return line.slice(0, i);
  }
  return line;
}

function parseTomlValue(raw) {
  if (!raw) return undefined;
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (
    (raw.startsWith('"') && raw.endsWith('"')) ||
    (raw.startsWith("'") && raw.endsWith("'"))
  ) {
    return raw.slice(1, -1);
  }
  // Underscore-separated integers (e.g. 262_144)
  if (/^[+-]?\d[\d_]*$/.test(raw)) {
    return Number(raw.replace(/_/g, ""));
  }
  if (/^[+-]?\d+\.\d+$/.test(raw)) return Number(raw);
  // Multi-line or complex values are ignored by this compact parser.
  if (raw.startsWith("[") || raw.startsWith("{") || raw.startsWith('"""')) {
    return undefined;
  }
  return raw;
}

function formatTomlString(value) {
  return `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function formatTomlKey(value) {
  const key = String(value);
  return /^[A-Za-z0-9_-]+$/.test(key)
    ? key
    : `"${key.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function extractYamlFrontmatter(source) {
  if (!source.startsWith("---")) return null;
  const end = source.indexOf("\n---", 3);
  if (end === -1) return null;
  const raw = source.slice(4, end).replace(/^\r?\n/, "");
  const endIndex = end + 4;
  // Skip optional newline after closing fence
  const data = {};
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    // Skip nested list items under keys we don't need deeply
    if (/^\s+-/.test(line)) continue;
    const match = /^([A-Za-z0-9_]+)\s*:\s*(.*)$/.exec(line);
    if (!match) continue;
    const key = match[1];
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (value === "" || value === "|" || value === ">") continue;
    data[key] = value;
  }
  return { raw, data, endIndex: source[endIndex] === "\n" ? endIndex + 1 : endIndex };
}

function firstMarkdownHeading(source) {
  for (const line of source.split(/\r?\n/)) {
    const match = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
    if (match) return clip(match[2], MAX_HEADING_CHARS);
  }
  return null;
}

function descriptionFromBody(source) {
  for (const line of source.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("#")) continue;
    if (trimmed.startsWith("```")) continue;
    return clip(trimmed, MAX_DESCRIPTION_CHARS);
  }
  return null;
}

function extractTopLevelTomlString(source, key) {
  for (const raw of source.split(/\r?\n/)) {
    const trimmed = stripTomlComment(raw).trim();
    if (/^\[/.test(trimmed)) break;
    const match = new RegExp(
      `^${key}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`,
    ).exec(trimmed);
    if (match) return match[1] ?? match[2] ?? null;
  }
  return null;
}

function extractTopLevelTomlMultilineString(source, key) {
  const escaped = String(key).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const tripleDouble = new RegExp(
    `^\\s*${escaped}\\s*=\\s*"""([\\s\\S]*?)"""`,
    "m",
  ).exec(source);
  if (tripleDouble) return tripleDouble[1].replace(/^\r?\n/, "").trimEnd();
  const tripleSingle = new RegExp(
    `^\\s*${escaped}\\s*=\\s*'''([\\s\\S]*?)'''`,
    "m",
  ).exec(source);
  if (tripleSingle) return tripleSingle[1].replace(/^\r?\n/, "").trimEnd();
  return extractTopLevelTomlString(source, key);
}

function extractArrayTables(source, name) {
  const rows = [];
  const lines = source.split(/\r?\n/);
  let current = null;
  for (const raw of lines) {
    const trimmed = stripTomlComment(raw).trim();
    const arrayHeader = /^\[\[([^\]]+)\]\]$/.exec(trimmed);
    if (arrayHeader) {
      if (current) rows.push(current);
      const path = splitTomlKeyPath(arrayHeader[1].trim());
      current = path.length === 1 && path[0] === name ? {} : null;
      continue;
    }
    const header = /^\[([^\]]+)\]$/.exec(trimmed);
    if (header) {
      if (current) rows.push(current);
      current = null;
      continue;
    }
    if (!current) continue;
    const kv = /^([A-Za-z0-9_.-]+)\s*=\s*(.+)$/.exec(trimmed);
    if (!kv) continue;
    const value = parseTomlValue(kv[2].trim());
    if (value !== undefined) current[kv[1]] = value;
  }
  if (current) rows.push(current);
  return rows;
}

function summarizeContract(row) {
  if (!row || typeof row !== "object") return null;
  return {
    name: typeof row.name === "string" ? row.name : null,
    ioType: typeof row.io_type === "string" ? row.io_type : null,
    required: typeof row.required === "boolean" ? row.required : null,
    description:
      typeof row.description === "string"
        ? clip(row.description, MAX_DESCRIPTION_CHARS)
        : null,
  };
}

function authorizeBearer(request, expectedToken) {
  if (!expectedToken) {
    throw httpError(
      500,
      "auth_token_missing",
      "GROK_CONFIG_TOKEN is not configured.",
    );
  }
  const header =
    request.headers?.authorization ?? request.headers?.Authorization ?? "";
  if (typeof header !== "string" || !header.startsWith("Bearer ")) {
    throw httpError(
      401,
      "authorization_required",
      "Authorization Bearer token is required.",
    );
  }
  const provided = header.slice("Bearer ".length).trim();
  const expected = Buffer.from(expectedToken);
  const actual = Buffer.from(provided);
  if (
    expected.length === 0 ||
    expected.length !== actual.length ||
    !timingSafeEqual(expected, actual)
  ) {
    throw httpError(
      401,
      "authorization_invalid",
      "Authorization Bearer token is invalid.",
    );
  }
}

function normalizeBearerToken(value) {
  if (value == null || value === "") return null;
  const token = String(value).trim();
  if (token.length < 16) {
    throw new Error("GROK_CONFIG_TOKEN must be at least 16 characters.");
  }
  return token;
}

function parseJson(raw) {
  if (!raw || !String(raw).trim()) {
    throw httpError(400, "invalid_json", "JSON body is required.");
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw httpError(400, "invalid_json", "Body must be valid JSON.");
  }
}

function sendJson(response, send, status, payload) {
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  send(response, status, JSON.stringify(payload));
  return true;
}

function httpError(statusCode, code, message, details) {
  return Object.assign(new Error(message), {
    statusCode,
    code,
    ...(details ? { details } : {}),
  });
}

function clip(value, max) {
  const text = String(value).replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1))}…`;
}

function readBody(request, maxBytes = MAX_BODY_BYTES) {
  return new Promise((resolvePromise, rejectPromise) => {
    let body = "";
    let tooLarge = false;
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      if (tooLarge) return;
      body += chunk;
      if (Buffer.byteLength(body) > maxBytes) {
        tooLarge = true;
        body = "";
      }
    });
    request.on("end", () => {
      if (tooLarge) {
        rejectPromise(
          httpError(413, "request_too_large", "Request body is too large."),
        );
        return;
      }
      resolvePromise(body);
    });
    request.on("error", rejectPromise);
  });
}

function send(response, status, body) {
  response.statusCode = status;
  response.end(body);
}

export function createGrokConfigServer(options = {}) {
  const host = options.host ?? GROK_CONFIG_HOST;
  if (host !== GROK_CONFIG_HOST) {
    throw new Error("Grok config service must bind to 127.0.0.1 only.");
  }
  const port = Number(options.port ?? process.env.GROK_CONFIG_PORT ?? GROK_CONFIG_DEFAULT_PORT);
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new Error("Grok config service port is invalid.");
  }
  const env = options.env ?? process.env;
  let authToken = options.authToken ?? env.GROK_CONFIG_TOKEN;
  if (!authToken) {
    authToken = `gk_${randomBytes(24).toString("base64url")}`;
  }
  const handle = createGrokConfigService({
    ...options,
    env: { ...env, GROK_CONFIG_TOKEN: authToken },
    authToken,
  });
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", `http://${host}:${port}`);
    const requestOrigin =
      typeof request.headers.origin === "string"
        ? request.headers.origin
        : "*";
    response.setHeader("Access-Control-Allow-Origin", requestOrigin);
    response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    response.setHeader(
      "Access-Control-Allow-Headers",
      "Authorization, Content-Type",
    );
    response.setHeader("Access-Control-Max-Age", "600");
    if (requestOrigin !== "*") {
      response.setHeader("Vary", "Origin");
    }
    if (request.method === "OPTIONS") {
      response.statusCode = 204;
      response.end();
      return;
    }
    try {
      const handled = await handle(url, request, response, readBody, send);
      if (!handled) {
        sendJson(response, send, 404, {
          error: "not_found",
          message: "Not found.",
        });
      }
    } catch (error) {
      const status =
        typeof error?.statusCode === "number" ? error.statusCode : 500;
      sendJson(response, send, status, {
        error: error?.code ?? "grok_config_error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });
  return {
    host,
    port,
    authToken,
    server,
    async listen() {
      await new Promise((resolveListen) => {
        server.listen(port, host, resolveListen);
      });
      return { host, port, authToken };
    },
    async close() {
      await new Promise((resolveClose, rejectClose) => {
        server.close((error) => (error ? rejectClose(error) : resolveClose()));
      });
    },
  };
}

async function main(argv = process.argv.slice(2)) {
  if (argv.includes("--dump")) {
    const catalog = await buildGrokCatalog({
      env: process.env,
      homeDir: process.env.GROK_HOME
        ? dirname(process.env.GROK_HOME)
        : undefined,
      grokHome: process.env.GROK_HOME,
    });
    process.stdout.write(`${JSON.stringify(catalog)}\n`);
    return;
  }
  if (argv.includes("--help") || argv.includes("-h")) {
    process.stdout.write(
      [
        "Usage:",
        "  node scripts/grok-config-service.mjs            # start loopback server",
        "  node scripts/grok-config-service.mjs --dump     # print merged catalog JSON",
        "",
        "Env:",
        "  GROK_CONFIG_PORT   default 5188",
        "  GROK_CONFIG_TOKEN  bearer token (auto-generated if unset)",
        "  CLIPROXY_API_KEY   proxy auth for https://localhost:8317/v1/models",
        "  GROK_HOME          optional override for ~/.grok",
        "",
      ].join("\n"),
    );
    return;
  }

  const service = createGrokConfigServer();
  const address = await service.listen();
  process.stdout.write(
    JSON.stringify({
      status: "listening",
      service: GROK_CONFIG_SERVICE,
      host: address.host,
      port: address.port,
      tokenHint: `${address.authToken.slice(0, 6)}…`,
      routes: [
        "GET /api/grok/health",
        "GET /api/grok/models",
        "GET /api/grok/agents",
        "GET /api/grok/personas",
        "GET /api/grok/personas/:id",
        "GET /api/grok/assignments",
        "GET /api/grok/config-snapshot",
        "POST /api/grok/config-sync",
        "GET /api/grok/workflows",
        "GET /api/grok/workflows/:name",
        "POST /api/grok/workflows/save",
        "GET /api/grok/workflow-presets",
        "GET /api/grok/roles",
        "GET /api/grok/skills",
        "GET /api/grok/modules",
        "GET /api/grok/modules/:id",
        "GET /api/grok/catalog",
        "POST /api/grok/apply",
      ],
    }) + "\n",
  );
  // Never print the bearer value. Desktop integrations receive it through
  // their local bridge config, and service logs may be retained or shared.
  process.stderr.write(
    `grok-config bearer configured (${address.authToken.slice(0, 6)}…)\n`,
  );
}

const isDirectRun = (() => {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return import.meta.url === pathToFileURL(resolve(entry)).href;
  } catch {
    return false;
  }
})();

if (isDirectRun) {
  main().catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? error.stack ?? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
