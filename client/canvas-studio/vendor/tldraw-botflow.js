// ../botflow-tldraw/src/tldraw-botflow.js
import { createBindingId, createShapeId, PageRecordType, renderPlaintextFromRichText, toRichText } from "tldraw";

// ../botflow-tldraw/src/botflow-core.js
var IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_-]*$/;
function diagnostic(code, line, message, severity = "error") {
  return { code, line, message, severity };
}
function unquote(value) {
  const text = value.trim();
  if (text.startsWith('"') && text.endsWith('"')) return text.slice(1, -1);
  return text;
}
function parseHeader(line, keyword) {
  const match = line.trim().match(new RegExp(`^${keyword}\\s+([A-Za-z_][A-Za-z0-9_-]*)(?:\\s+"([^"]*)")?\\s*$`));
  return match ? { id: match[1], title: match[2] || match[1] } : null;
}
function parseButtonRow(text, lineNumber, diagnostics) {
  const rows = [];
  const matches = [...text.matchAll(/\[([^\]]*)\]/g)];
  if (!matches.length) {
    diagnostics.push(diagnostic("MALFORMED_BUTTON", lineNumber, "Expected [Label -> target]."));
    return rows;
  }
  const remainder = text.replace(/\[[^\]]*\]/g, "").trim();
  if (remainder) {
    diagnostics.push(diagnostic("MALFORMED_BUTTON", lineNumber, `Unexpected text outside buttons: ${remainder}`));
  }
  for (const match of matches) {
    const body = match[1].trim();
    const arrow = body.lastIndexOf("->");
    if (arrow < 1) {
      diagnostics.push(diagnostic("MALFORMED_BUTTON", lineNumber, `Malformed button: [${body}]`));
      continue;
    }
    const label = body.slice(0, arrow).trim();
    const target = body.slice(arrow + 2).trim();
    if (!label || !IDENTIFIER.test(target)) {
      diagnostics.push(diagnostic("MALFORMED_BUTTON", lineNumber, `Malformed button: [${body}]`));
      continue;
    }
    rows.push({ label, target, line: lineNumber });
  }
  return rows;
}
function parseBotflow(source) {
  const diagnostics = [];
  const lines = String(source ?? "").replace(/\r\n?/g, "\n").split("\n");
  let flow = { id: "botflow", title: "Botflow", screens: [] };
  let current = null;
  let block = null;
  const screenIds = /* @__PURE__ */ new Set();
  const validationScreens = [];
  const addItem = (item) => {
    if (!current) {
      diagnostics.push(diagnostic("ITEM_OUTSIDE_SCREEN", item.line, "Content must be inside a screen."));
      return;
    }
    current.items.push(item);
  };
  for (let index = 0; index < lines.length; index += 1) {
    const lineNumber = index + 1;
    const raw = lines[index];
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("//")) continue;
    if (trimmed.startsWith("flow ")) {
      const header = parseHeader(trimmed, "flow");
      if (!header) diagnostics.push(diagnostic("MALFORMED_FLOW", lineNumber, 'Expected: flow id "Title"'));
      else flow = { ...flow, ...header };
      current = null;
      block = null;
      continue;
    }
    if (trimmed.startsWith("screen ")) {
      const header = parseHeader(trimmed, "screen");
      if (!header) {
        diagnostics.push(diagnostic("MALFORMED_SCREEN", lineNumber, 'Expected: screen id "Title"'));
        current = null;
      } else {
        const duplicate = screenIds.has(header.id);
        if (duplicate) diagnostics.push(diagnostic("DUPLICATE_SCREEN", lineNumber, `Duplicate screen id: ${header.id}`));
        else screenIds.add(header.id);
        current = { ...header, line: lineNumber, items: [] };
        validationScreens.push(current);
        if (!duplicate) flow.screens.push(current);
      }
      block = null;
      continue;
    }
    if (!current) {
      diagnostics.push(diagnostic("UNKNOWN_STATEMENT", lineNumber, `Unknown statement: ${trimmed}`));
      continue;
    }
    if (/^(buttons|list|card):$/.test(trimmed)) {
      block = trimmed.slice(0, -1);
      if (block === "buttons") addItem({ kind: "buttons", rows: [], line: lineNumber });
      else if (block === "list") addItem({ kind: "list", entries: [], line: lineNumber });
      else addItem({ kind: "card", fields: {}, line: lineNumber });
      continue;
    }
    if (block === "buttons" && trimmed.startsWith("[")) {
      const buttons = current.items.at(-1);
      const row = parseButtonRow(trimmed, lineNumber, diagnostics);
      if (row.length) buttons.rows.push(row);
      continue;
    }
    if (block === "list" && trimmed.startsWith("- ")) {
      const entryText = trimmed.slice(2).trim();
      const arrow = entryText.lastIndexOf("->");
      const label = (arrow >= 0 ? entryText.slice(0, arrow) : entryText).trim();
      const target = arrow >= 0 ? entryText.slice(arrow + 2).trim() : null;
      if (!label || target && !IDENTIFIER.test(target)) diagnostics.push(diagnostic("MALFORMED_LIST_ITEM", lineNumber, `Malformed list item: ${entryText}`));
      else current.items.at(-1).entries.push({ label, ...target ? { target } : {}, line: lineNumber });
      continue;
    }
    if (block === "card" && /^[^:\s][^:]*\s*:/.test(trimmed)) {
      const colon = trimmed.indexOf(":");
      const key = trimmed.slice(0, colon).trim();
      const value = unquote(trimmed.slice(colon + 1));
      current.items.at(-1).fields[key] = value;
      continue;
    }
    block = null;
    let match;
    if (match = trimmed.match(/^(bot|user)>\s*(.*)$/)) {
      addItem({ kind: match[1], text: match[2], line: lineNumber });
    } else if (match = trimmed.match(/^status(?:\[([A-Za-z_-]+)\])?>\s*(.*)$/)) {
      addItem({ kind: "status", variant: match[1] || "info", text: match[2], line: lineNumber });
    } else if (match = trimmed.match(/^input\s*:\s*([A-Za-z_-]+)(?:\s+"([^"]*)")?\s*$/)) {
      addItem({ kind: "input", inputType: match[1], placeholder: match[2] || "", line: lineNumber });
    } else if (match = trimmed.match(/^(then|error)\s*->\s*([A-Za-z_][A-Za-z0-9_-]*)\s*$/)) {
      addItem({ kind: match[1], target: match[2], line: lineNumber });
    } else {
      diagnostics.push(diagnostic("UNKNOWN_STATEMENT", lineNumber, `Unknown statement: ${trimmed}`));
    }
  }
  const ids = new Set(flow.screens.map((screen) => screen.id));
  for (const edge of collectEdges({ ...flow, screens: validationScreens })) {
    if (!ids.has(edge.to)) diagnostics.push(diagnostic("UNRESOLVED_TARGET", edge.line, `Unknown target screen: ${edge.to}`));
  }
  return { flow, diagnostics };
}
function collectEdges(flow) {
  const edges = [];
  for (const screen of flow?.screens ?? []) {
    for (const [itemIndex, item] of (screen.items ?? []).entries()) {
      if (item.kind === "buttons") {
        item.rows.forEach((row, rowIndex) => row.forEach((button, columnIndex) => edges.push({
          id: stableKey(flow.id, screen.id, "button", itemIndex, rowIndex, columnIndex, button.target),
          from: screen.id,
          to: button.target,
          label: button.label,
          kind: "button",
          itemIndex,
          row: rowIndex,
          column: columnIndex,
          line: button.line
        })));
      } else if (item.kind === "list") {
        item.entries.forEach((entry, entryIndex) => {
          if (entry.target) edges.push({
            id: stableKey(flow.id, screen.id, "list", itemIndex, entryIndex, entry.target),
            from: screen.id,
            to: entry.target,
            label: entry.label,
            kind: "list",
            itemIndex,
            entryIndex,
            line: entry.line
          });
        });
      } else if (item.kind === "then" || item.kind === "error") {
        edges.push({
          id: stableKey(flow.id, screen.id, item.kind, item.target),
          from: screen.id,
          to: item.target,
          label: item.kind,
          kind: item.kind,
          line: item.line
        });
      }
    }
  }
  return edges;
}
function stableKey(...parts) {
  const input = parts.map((part) => String(part)).join("");
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  const readable = parts.map((part) => String(part).toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")).filter(Boolean).join("-").slice(0, 52);
  return `${readable || "item"}-${(hash >>> 0).toString(36)}`;
}

// ../botflow-tldraw/src/botflow-layout.js
var SCREEN_WIDTH = 380;
var INNER_X = 16;
var INNER_WIDTH = SCREEN_WIDTH - INNER_X * 2;
var HEADER_HEIGHT = 88;
var SCREEN_HEIGHT = 720;
var CONTENT_TOP = HEADER_HEIGHT + 16;
var HOME_BAR = 22;
var KEYBOARD_HEIGHT = 168;
var GAP = 12;
var BUBBLE_RADIUS = 16;
function textHeight(text, base = 36, charsPerLine = 28) {
  const lines = Math.max(1, String(text ?? "").split("\n").reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / charsPerLine)), 0));
  return base + Math.max(0, lines - 1) * 18;
}
function planScreen(screen) {
  const body = [];
  const actionRows = [];
  const addBody = (part) => body.push({ ...part, zone: "body" });
  const hasInput = (screen.items ?? []).some((item) => item.kind === "input");
  const contentBottom = SCREEN_HEIGHT - HOME_BAR - (hasInput ? KEYBOARD_HEIGHT + GAP : 16);
  screen.items.forEach((item, itemIndex) => {
    if (item.kind === "bot" || item.kind === "user") {
      const w = Math.min(INNER_WIDTH, Math.max(168, 48 + String(item.text ?? "").length * 7.2));
      addBody({
        kind: item.kind,
        itemIndex,
        geo: "rectangle",
        x: item.kind === "user" ? SCREEN_WIDTH - INNER_X - w : INNER_X,
        w,
        h: textHeight(item.text, 40, 26),
        text: item.text
      });
    } else if (item.kind === "status") {
      addBody({ kind: "status", itemIndex, variant: item.variant, geo: "rectangle", x: INNER_X, w: INNER_WIDTH, h: textHeight(item.text, 40, 34), text: item.text });
    } else if (item.kind === "list") {
      item.entries.forEach((entry, entryIndex) => addBody({
        kind: "list-entry",
        itemIndex,
        entryIndex,
        geo: "rectangle",
        x: INNER_X,
        w: INNER_WIDTH,
        h: 46,
        text: entry.label,
        target: entry.target
      }));
    } else if (item.kind === "card") {
      const lines = Object.entries(item.fields).map(([key, value]) => `${key}: ${value}`);
      addBody({ kind: "card", itemIndex, geo: "rectangle", x: INNER_X, w: INNER_WIDTH, h: Math.max(86, 36 + lines.length * 24), text: lines.join("\n") });
    } else if (item.kind === "buttons") {
      item.rows.forEach((row, rowIndex) => {
        const buttonGap = GAP;
        const w = (INNER_WIDTH - buttonGap * (row.length - 1)) / row.length;
        actionRows.push(row.map((button, columnIndex) => ({
          kind: "button",
          zone: "actions",
          itemIndex,
          row: rowIndex,
          column: columnIndex,
          geo: "rectangle",
          x: INNER_X + columnIndex * (w + buttonGap),
          w,
          h: 44,
          text: button.label,
          target: button.target
        })));
      });
    } else if (item.kind === "input") {
      actionRows.push([{
        kind: "input",
        zone: "actions",
        itemIndex,
        geo: "ellipse",
        x: INNER_X,
        w: INNER_WIDTH,
        h: 44,
        text: item.placeholder || `\u0412\u0432\u0435\u0434\u0438\u0442\u0435 ${item.inputType}`
      }]);
    }
  });
  const actionHeight = actionRows.reduce((sum, row) => sum + row[0].h, 0) + GAP * Math.max(0, actionRows.length - 1);
  const actionStart = contentBottom - actionHeight;
  let actionY = actionStart;
  const actions = actionRows.flatMap((row) => {
    const positioned = row.map((part) => ({ ...part, y: actionY }));
    actionY += row[0].h + GAP;
    return positioned;
  });
  if (hasInput) {
    actions.push({
      kind: "keyboard",
      zone: "chrome",
      itemIndex: "keyboard",
      geo: "rectangle",
      x: 0,
      y: SCREEN_HEIGHT - HOME_BAR - KEYBOARD_HEIGHT,
      w: SCREEN_WIDTH,
      h: KEYBOARD_HEIGHT,
      text: "1 2 3 4 5 6 7 8 9 0\n\u0439 \u0446 \u0443 \u043A \u0435 \u043D \u0433 \u0448 \u0449 \u0437\n\u0444 \u044B \u0432 \u0430 \u043F \u0440 \u043E \u043B \u0434\n\u21E7 \u044F \u0447 \u0441 \u043C \u0438 \u0442 \u044C \u232B\n123     \u043F\u0440\u043E\u0431\u0435\u043B     \u21B5"
    });
  }
  const bodyLimit = actionRows.length ? actionStart - GAP : contentBottom;
  const visibleBody = [];
  let y = CONTENT_TOP;
  for (let index = 0; index < body.length; index += 1) {
    const part = body[index];
    const hasMore = index < body.length - 1;
    const markerSpace = hasMore ? 40 : 0;
    if (y + part.h + markerSpace > bodyLimit) break;
    visibleBody.push({ ...part, y });
    y += part.h + GAP;
  }
  const hiddenCount = body.length - visibleBody.length;
  if (hiddenCount) visibleBody.push({
    kind: "overflow",
    zone: "body",
    itemIndex: "overflow",
    geo: "rectangle",
    x: INNER_X,
    y,
    w: INNER_WIDTH,
    h: 32,
    text: `\u2026 \u0435\u0449\u0451 ${hiddenCount} \u0431\u043B\u043E\u043A\u043E\u0432`
  });
  return {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    parts: [...visibleBody, ...actions],
    headerHeight: HEADER_HEIGHT,
    footerHeight: HOME_BAR,
    overflow: hiddenCount > 0,
    hiddenCount,
    keyboard: hasInput,
    radius: BUBBLE_RADIUS,
    gap: GAP
  };
}

// ../botflow-tldraw/src/botflow-journey.js
var RETURN_LABEL = /назад|отменить|на главн|изменить|повтор|уточнить|ещё вопрос|к отчёту|к алертам|к автоматизац|открыть сервис|к сервисам|проверить сейчас|ещё пресет|back|cancel|home|edit|retry|again/i;
var CROSS_LABEL = /алерт из|график|метод|примеры/i;
function graph(flow) {
  const screens = flow?.screens ?? [];
  const ids = new Set(screens.map(({ id }) => id));
  const edges = collectEdges(flow).filter(({ from, to }) => ids.has(from) && ids.has(to));
  const outgoing = new Map(screens.map(({ id }) => [id, []]));
  for (const edge of edges) outgoing.get(edge.from).push(edge);
  return { screens, edges, outgoing, start: screens[0]?.id };
}
function isReturn(edge) {
  return edge.kind !== "error" && RETURN_LABEL.test(edge.label ?? "");
}
function isCross(edge) {
  return edge.kind !== "error" && CROSS_LABEL.test(edge.label ?? "");
}
function longestPath(outgoing, from, blocked, siblingHops) {
  let best = [from];
  for (const edge of outgoing.get(from) ?? []) {
    if (edge.kind === "error" || isReturn(edge) || isCross(edge) || blocked.has(edge.to)) continue;
    if (siblingHops.has(edge.to)) continue;
    const next = longestPath(outgoing, edge.to, new Set(blocked).add(from), siblingHops);
    if (1 + next.length > best.length) best = [from, ...next];
  }
  return best;
}
function classifyJourney(flow) {
  const { screens, edges, outgoing, start } = graph(flow);
  if (!start) return { happyPath: [], sideJourneys: [], errorOf: {}, edges: [] };
  const startTargets = [];
  const seenTarget = /* @__PURE__ */ new Set();
  for (const edge of outgoing.get(start) ?? []) {
    if (edge.kind === "error" || isReturn(edge) || seenTarget.has(edge.to)) continue;
    seenTarget.add(edge.to);
    startTargets.push({ edge, path: [edge.to] });
  }
  const siblingHops = new Set(startTargets.map(({ edge }) => edge.to));
  for (const target of startTargets) {
    const hops = new Set(siblingHops);
    hops.delete(target.edge.to);
    target.path = longestPath(outgoing, target.edge.to, /* @__PURE__ */ new Set([start]), hops);
  }
  startTargets.sort((a, b) => b.path.length - a.path.length || a.edge.to.localeCompare(b.edge.to));
  const happyPath = startTargets[0] ? [start, ...startTargets[0].path] : [start];
  const happy = new Set(happyPath);
  const sideJourneys = startTargets.slice(1).filter(({ edge }) => !happy.has(edge.to)).map(({ edge, path }) => ({ id: edge.to, from: start, path: [start, ...path] }));
  const errorOf = {};
  for (const edge of edges) {
    if (edge.kind === "error" && !errorOf[edge.to]) errorOf[edge.to] = edge.from;
  }
  const sideIds = new Set(sideJourneys.map(({ id }) => id));
  const classified = edges.map((edge) => {
    let role = "forward";
    if (edge.kind === "error") role = "error";
    else if (isReturn(edge)) role = "return";
    else if (isCross(edge)) role = "cross";
    else if (edge.from === start && sideIds.has(edge.to)) role = "side";
    else if (happy.has(edge.from) && happy.has(edge.to)) role = "forward";
    else if (happy.has(edge.from) !== happy.has(edge.to)) role = "cross";
    else role = "side";
    return { ...edge, role };
  });
  return { happyPath, sideJourneys, errorOf, edges: classified, start };
}
function layoutJourney(flow, options = {}) {
  const screens = flow?.screens ?? [];
  if (!screens.length) return {};
  const originX = options.originX ?? 80;
  const originY = options.originY ?? 160;
  const columnGap = Math.max(0, options.columnGap ?? 80);
  const rowGap = Math.max(0, options.rowGap ?? 80);
  const { happyPath, sideJourneys, errorOf } = classifyJourney(flow);
  const byId = new Map(screens.map((screen) => [screen.id, screen]));
  const size = (id) => planScreen(byId.get(id) ?? { items: [] });
  const stride = (id) => size(id).width + columnGap;
  const positions = {};
  happyPath.forEach((id, index) => {
    const x = originX + happyPath.slice(0, index).reduce((sum, prev) => sum + stride(prev), 0);
    positions[id] = { x, y: originY, lane: "happy", step: index };
  });
  for (const [errorId, owner] of Object.entries(errorOf)) {
    const parent = positions[owner];
    if (!parent) continue;
    positions[errorId] = { x: parent.x, y: parent.y + size(owner).height + rowGap, lane: "error", owner };
  }
  let sideX = originX;
  const sideY = originY + Math.max(...happyPath.map((id) => size(id).height), 720) + rowGap;
  for (const side of sideJourneys) {
    const branch = side.path.filter((id) => id !== side.from && !positions[id]);
    let y = sideY;
    for (const id of branch) {
      positions[id] = { x: sideX, y, lane: "side" };
      y += size(id).height + rowGap;
    }
    if (branch.length) sideX += Math.max(...branch.map((id) => stride(id)));
  }
  let orphanX = originX + happyPath.reduce((sum, id) => sum + stride(id), 0);
  for (const { id } of screens) {
    if (positions[id]) continue;
    positions[id] = { x: orphanX, y: sideY, lane: "orphan" };
    orphanX += stride(id);
  }
  return positions;
}
function journeyView(flow) {
  const { edges, happyPath, sideJourneys, errorOf } = classifyJourney(flow);
  const seen = /* @__PURE__ */ new Set();
  const arrows = [];
  for (const edge of edges) {
    if (edge.role === "return" || edge.role === "cross") continue;
    const key = `${edge.from}->${edge.to}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const twins = edges.filter((candidate) => candidate.from === edge.from && candidate.to === edge.to && candidate.role === edge.role);
    arrows.push({
      id: edge.id,
      from: edge.from,
      to: edge.to,
      role: edge.role,
      label: edge.role === "error" ? "\u043E\u0448\u0438\u0431\u043A\u0430" : twins.length === 1 ? edge.kind === "then" ? "" : edge.label : ""
    });
  }
  return { arrows, happyPath, sideJourneys, errorOf };
}

// ../botflow-tldraw/examples/support.botflow?raw
var support_default = 'flow support "\u0411\u043E\u0442 \u043F\u043E\u0434\u0434\u0435\u0440\u0436\u043A\u0438"\n\nscreen start "\u0413\u043B\u0430\u0432\u043D\u0430\u044F"\n  user> /start\n  bot> \u041F\u0440\u0438\u0432\u0435\u0442! \u0427\u0442\u043E \u0445\u043E\u0442\u0438\u0442\u0435 \u0441\u0434\u0435\u043B\u0430\u0442\u044C?\n  buttons:\n    [\u0421\u043E\u0437\u0434\u0430\u0442\u044C \u0437\u0430\u044F\u0432\u043A\u0443 -> category] [\u041C\u043E\u0438 \u0437\u0430\u044F\u0432\u043A\u0438 -> requests]\n    [\u041F\u043E\u0437\u0432\u0430\u0442\u044C \u043E\u043F\u0435\u0440\u0430\u0442\u043E\u0440\u0430 -> support]\n\nscreen category "\u041A\u0430\u0442\u0435\u0433\u043E\u0440\u0438\u044F"\n  bot> \u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u043A\u0430\u0442\u0435\u0433\u043E\u0440\u0438\u044E \u0437\u0430\u044F\u0432\u043A\u0438\n  list:\n    - \u0422\u0435\u0445\u043D\u0438\u0447\u0435\u0441\u043A\u0430\u044F \u043F\u0440\u043E\u0431\u043B\u0435\u043C\u0430 -> description\n    - \u0412\u043E\u043F\u0440\u043E\u0441 \u043F\u043E \u043E\u043F\u043B\u0430\u0442\u0435 -> description\n    - \u0414\u0440\u0443\u0433\u043E\u0435 -> description\n  buttons:\n    [\u2190 \u041D\u0430\u0437\u0430\u0434 -> start]\n\nscreen description "\u041E\u043F\u0438\u0441\u0430\u043D\u0438\u0435"\n  bot> \u041E\u043F\u0438\u0448\u0438\u0442\u0435 \u043F\u0440\u043E\u0431\u043B\u0435\u043C\u0443 \u043E\u0434\u043D\u0438\u043C \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0435\u043C\n  input: text "\u0421\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0435\u2026"\n  then -> confirmation\n\nscreen confirmation "\u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u0438\u0435"\n  bot> \u0412\u0441\u0451 \u0432\u0435\u0440\u043D\u043E?\n  card:\n    \u041A\u0430\u0442\u0435\u0433\u043E\u0440\u0438\u044F: \u0422\u0435\u0445\u043D\u0438\u0447\u0435\u0441\u043A\u0430\u044F \u043F\u0440\u043E\u0431\u043B\u0435\u043C\u0430\n    \u041E\u043F\u0438\u0441\u0430\u043D\u0438\u0435: \u041D\u0435 \u0432\u043A\u043B\u044E\u0447\u0430\u0435\u0442\u0441\u044F \u0443\u0441\u0442\u0440\u043E\u0439\u0441\u0442\u0432\u043E\n  buttons:\n    [\u041E\u0442\u043F\u0440\u0430\u0432\u0438\u0442\u044C -> sending]\n    [\u0418\u0437\u043C\u0435\u043D\u0438\u0442\u044C -> description] [\u041E\u0442\u043C\u0435\u043D\u0438\u0442\u044C -> start]\n\nscreen sending "\u041E\u0442\u043F\u0440\u0430\u0432\u043A\u0430"\n  status[loading]> \u041E\u0442\u043F\u0440\u0430\u0432\u043B\u044F\u044E \u0437\u0430\u044F\u0432\u043A\u0443\u2026\n  then -> success\n  error -> send_error\n\nscreen send_error "\u041E\u0448\u0438\u0431\u043A\u0430"\n  status[error]> \u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043E\u0442\u043F\u0440\u0430\u0432\u0438\u0442\u044C \u0437\u0430\u044F\u0432\u043A\u0443\n  buttons:\n    [\u041F\u043E\u0432\u0442\u043E\u0440\u0438\u0442\u044C -> sending]\n    [\u041E\u0442\u043C\u0435\u043D\u0438\u0442\u044C -> start]\n\nscreen success "\u0413\u043E\u0442\u043E\u0432\u043E"\n  status[success]> \u0417\u0430\u044F\u0432\u043A\u0430 \u0441\u043E\u0437\u0434\u0430\u043D\u0430\n  bot> \u041D\u043E\u043C\u0435\u0440 \u0437\u0430\u044F\u0432\u043A\u0438: #142\n  buttons:\n    [\u041C\u043E\u0438 \u0437\u0430\u044F\u0432\u043A\u0438 -> requests] [\u041D\u0430 \u0433\u043B\u0430\u0432\u043D\u0443\u044E -> start]\n\nscreen requests "\u041C\u043E\u0438 \u0437\u0430\u044F\u0432\u043A\u0438"\n  status[info]> \u0410\u043A\u0442\u0438\u0432\u043D\u044B\u0445 \u0437\u0430\u044F\u0432\u043E\u043A \u043F\u043E\u043A\u0430 \u043D\u0435\u0442\n  buttons:\n    [\u041D\u0430 \u0433\u043B\u0430\u0432\u043D\u0443\u044E -> start]\n\nscreen support "\u041E\u043F\u0435\u0440\u0430\u0442\u043E\u0440"\n  status[loading]> \u0421\u043E\u0435\u0434\u0438\u043D\u044F\u044E \u0441 \u043E\u043F\u0435\u0440\u0430\u0442\u043E\u0440\u043E\u043C\u2026\n  bot> \u041E\u0431\u044B\u0447\u043D\u043E \u043E\u0442\u0432\u0435\u0447\u0430\u0435\u043C \u0432 \u0442\u0435\u0447\u0435\u043D\u0438\u0435 5 \u043C\u0438\u043D\u0443\u0442\n  buttons:\n    [\u041E\u0442\u043C\u0435\u043D\u0438\u0442\u044C -> start]\n';

// ../botflow-tldraw/examples/lovi.botflow?raw
var lovi_default = 'flow lovi "Lovi"\n\nscreen start "Lovi"\n  user> /start\n  bot> \u041F\u0440\u0438\u0432\u0435\u0442. \u042F Lovi \u2014 \u0438\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u0442\u0435\u043B\u044C\u0441\u043A\u0430\u044F \u043B\u0430\u0431\u043E\u0440\u0430\u0442\u043E\u0440\u0438\u044F \u0432 Telegram. \u0421\u043F\u0440\u043E\u0441\u0438 \u043E\u0431\u044B\u0447\u043D\u044B\u043C \u044F\u0437\u044B\u043A\u043E\u043C \u0438\u043B\u0438 \u0432\u044B\u0431\u0435\u0440\u0438 \u0437\u0430\u0434\u0430\u0447\u0443.\n  buttons:\n    [\u041D\u043E\u0432\u043E\u0435 \u0438\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u043D\u0438\u0435 -> ask]\n    [\u041C\u043E\u0438 \u0437\u0430\u043F\u0443\u0441\u043A\u0438 -> runs] [\u0410\u043B\u0435\u0440\u0442\u044B -> alerts]\n    [\u0410\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0437\u0430\u0446\u0438\u0438 -> automations]\n\nscreen ask "\u0412\u043E\u043F\u0440\u043E\u0441"\n  bot> \u0427\u0442\u043E \u043F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C? \u0420\u044B\u043D\u043E\u043A, \u0433\u0438\u043F\u043E\u0442\u0435\u0437\u0443, \u043E\u043D\u0447\u0435\u0439\u043D \u0438\u043B\u0438 \u0431\u044D\u043A\u0442\u0435\u0441\u0442.\n  input: text "\u041D\u0430\u043F\u0440\u0438\u043C\u0435\u0440: \u0441\u0430\u043C\u044B\u0435 \u0430\u043A\u0442\u0438\u0432\u043D\u044B\u0435 \u0440\u044B\u043D\u043A\u0438 Polymarket \u0437\u0430 \u0441\u0443\u0442\u043A\u0438\u2026"\n  then -> plan\n  buttons:\n    [\u041F\u0440\u0438\u043C\u0435\u0440\u044B -> examples] [\u2190 \u041D\u0430\u0437\u0430\u0434 -> start]\n\nscreen examples "\u041F\u0440\u0438\u043C\u0435\u0440\u044B"\n  bot> \u0412\u044B\u0431\u0435\u0440\u0438 \u0433\u043E\u0442\u043E\u0432\u044B\u0439 \u0441\u0446\u0435\u043D\u0430\u0440\u0438\u0439 \u2014 \u044F \u043F\u043E\u0434\u0441\u0442\u0430\u0432\u043B\u044E \u0444\u043E\u0440\u043C\u0443\u043B\u0438\u0440\u043E\u0432\u043A\u0443.\n  list:\n    - \u0410\u043A\u0442\u0438\u0432\u043D\u044B\u0435 \u0440\u044B\u043D\u043A\u0438 Polymarket -> ask\n    - \u0413\u0438\u043F\u043E\u0442\u0435\u0437\u0430 Hyperliquid \u2192 Polymarket -> ask\n    - Pump.fun: \u043F\u043E\u043A\u0443\u043F\u043A\u0438 + \u043A\u043E\u0448\u0435\u043B\u044C\u043A\u0438 + \u043B\u0438\u043A\u0432\u0438\u0434\u043D\u043E\u0441\u0442\u044C -> ask\n    - \u0420\u0430\u0441\u0445\u043E\u0436\u0434\u0435\u043D\u0438\u0435 HL / pools.trade / Polymarket -> ask\n    - \u0411\u044D\u043A\u0442\u0435\u0441\u0442: +200% DEX \u0438 \u043D\u0430\u043A\u043E\u043F\u043B\u0435\u043D\u0438\u0435 \u043A\u0438\u0442\u043E\u0432 -> ask\n  buttons:\n    [\u0421\u0432\u043E\u0439 \u0432\u043E\u043F\u0440\u043E\u0441 -> ask] [\u041D\u0430 \u0433\u043B\u0430\u0432\u043D\u0443\u044E -> start]\n\nscreen plan "\u041F\u043B\u0430\u043D"\n  bot> \u0421\u043E\u0431\u0440\u0430\u043B \u0431\u0435\u0437\u043E\u043F\u0430\u0441\u043D\u044B\u0439 \u043F\u043B\u0430\u043D. \u0414\u0430\u043D\u043D\u044B\u0435 \u0442\u043E\u043B\u044C\u043A\u043E \u0447\u0435\u0440\u0435\u0437 broker, \u0431\u0435\u0437 \u043F\u0440\u044F\u043C\u043E\u0433\u043E ClickHouse.\n  card:\n    \u0412\u043E\u043F\u0440\u043E\u0441: \u0410\u043A\u0442\u0438\u0432\u043D\u044B\u0435 \u0440\u044B\u043D\u043A\u0438 Polymarket \u0437\u0430 24\u0447\n    \u0418\u0441\u0442\u043E\u0447\u043D\u0438\u043A\u0438: Polymarket\n    \u041C\u0435\u0442\u043E\u0434: \u0442\u043E\u043F \u043F\u043E \u043E\u0431\u044A\u0451\u043C\u0443 + \u0394 \u0432\u0435\u0440\u043E\u044F\u0442\u043D\u043E\u0441\u0442\u0438\n    \u0411\u044E\u0434\u0436\u0435\u0442: 1 \u0441\u0440\u0435\u0437 \xB7 \u043A\u043E\u0440\u043E\u0442\u043A\u0438\u0439 \u043E\u0442\u0447\u0451\u0442\n  buttons:\n    [\u0417\u0430\u043F\u0443\u0441\u0442\u0438\u0442\u044C -> running]\n    [\u0423\u0442\u043E\u0447\u043D\u0438\u0442\u044C -> ask] [\u041E\u0442\u043C\u0435\u043D\u0438\u0442\u044C -> start]\n\nscreen running "\u0421\u0447\u0438\u0442\u0430\u044E"\n  status[loading]> ml-intern \u0441\u0442\u0440\u043E\u0438\u0442 \u044D\u043A\u0441\u043F\u0435\u0440\u0438\u043C\u0435\u043D\u0442 \u0438 \u0437\u0430\u043F\u0440\u0430\u0448\u0438\u0432\u0430\u0435\u0442 \u0441\u0440\u0435\u0437\u044B\n  then -> report\n  error -> failed\n\nscreen report "\u041E\u0442\u0447\u0451\u0442"\n  status[success]> \u0420\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442 \u0433\u043E\u0442\u043E\u0432 \xB7 \u0432\u043E\u0441\u043F\u0440\u043E\u0438\u0437\u0432\u043E\u0434\u0438\u043C\u044B\u0439 \u0430\u0440\u0442\u0435\u0444\u0430\u043A\u0442\n  card:\n    \u0422\u043E\u043F: Will BTC hit 100k by Friday\n    \u041E\u0431\u044A\u0451\u043C 24\u0447: $48.2M \xB7 +126%\n    \u0394 \u0432\u0435\u0440\u043E\u044F\u0442\u043D\u043E\u0441\u0442\u0438: 0.41 \u2192 0.63\n    \u0410\u0440\u0442\u0435\u0444\u0430\u043A\u0442: run_1842.parquet\n  buttons:\n    [\u0413\u0440\u0430\u0444\u0438\u043A -> chart] [\u041C\u0435\u0442\u043E\u0434 -> method]\n    [\u0410\u043B\u0435\u0440\u0442 \u0438\u0437 \u044D\u0442\u043E\u0433\u043E -> alert_new] [\u0415\u0449\u0451 \u0432\u043E\u043F\u0440\u043E\u0441 -> ask]\n    [\u041D\u0430 \u0433\u043B\u0430\u0432\u043D\u0443\u044E -> start]\n\nscreen chart "\u0413\u0440\u0430\u0444\u0438\u043A"\n  bot> \u041E\u0431\u044A\u0451\u043C \u0438 \u0432\u0435\u0440\u043E\u044F\u0442\u043D\u043E\u0441\u0442\u044C \u0437\u0430 24\u0447. \u041F\u0438\u043A \u0441\u043E\u0432\u043F\u0430\u043B \u0441 \u043F\u0440\u0438\u0442\u043E\u043A\u043E\u043C \u043D\u0430 HL.\n  status[info]> chart_1842.png \xB7 24 \u0442\u043E\u0447\u043A\u0438\n  buttons:\n    [\u041A \u043E\u0442\u0447\u0451\u0442\u0443 -> report] [\u041D\u0430 \u0433\u043B\u0430\u0432\u043D\u0443\u044E -> start]\n\nscreen method "\u041C\u0435\u0442\u043E\u0434"\n  bot> \u041F\u043B\u0430\u043D \u0434\u0435\u0442\u0435\u0440\u043C\u0438\u043D\u0438\u0440\u043E\u0432\u0430\u043D\u043D\u044B\u0439. \u0410\u0433\u0435\u043D\u0442 \u043D\u0435 \u0432\u0438\u0434\u0435\u043B credentials \u0438 \u0441\u044B\u0440\u043E\u0439 ClickHouse.\n  card:\n    \u0421\u0440\u0435\u0437\u044B: polymarket.markets_24h\n    \u041A\u043E\u0434: isolated sandbox\n    Envelope: ResultEnvelope v1\n    \u0411\u044E\u0434\u0436\u0435\u0442 LLM: 2 \u0432\u044B\u0437\u043E\u0432\u0430\n  buttons:\n    [\u041A \u043E\u0442\u0447\u0451\u0442\u0443 -> report] [\u041F\u043E\u0432\u0442\u043E\u0440\u0438\u0442\u044C -> running]\n\nscreen failed "\u041E\u0448\u0438\u0431\u043A\u0430"\n  status[error]> \u041D\u0435 \u0445\u0432\u0430\u0442\u0438\u043B\u043E \u0441\u0440\u0435\u0437\u0430 \u0438\u043B\u0438 \u0431\u044E\u0434\u0436\u0435\u0442 \u0438\u0441\u0447\u0435\u0440\u043F\u0430\u043D\n  bot> \u041C\u043E\u0433\u0443 \u0441\u0443\u0437\u0438\u0442\u044C \u043E\u043A\u043D\u043E, \u0441\u043C\u0435\u043D\u0438\u0442\u044C \u0438\u0441\u0442\u043E\u0447\u043D\u0438\u043A \u0438\u043B\u0438 \u043F\u043E\u0432\u0442\u043E\u0440\u0438\u0442\u044C \u0442\u043E\u0442 \u0436\u0435 \u043F\u043B\u0430\u043D.\n  buttons:\n    [\u041F\u043E\u0432\u0442\u043E\u0440\u0438\u0442\u044C -> running]\n    [\u0423\u0442\u043E\u0447\u043D\u0438\u0442\u044C -> ask] [\u041E\u0442\u043C\u0435\u043D\u0438\u0442\u044C -> start]\n\nscreen runs "\u0417\u0430\u043F\u0443\u0441\u043A\u0438"\n  bot> \u041F\u043E\u0441\u043B\u0435\u0434\u043D\u0438\u0435 \u044D\u043A\u0441\u043F\u0435\u0440\u0438\u043C\u0435\u043D\u0442\u044B. \u041E\u0442\u043A\u0440\u043E\u0439 \u043B\u044E\u0431\u043E\u0439 \u2014 \u0442\u0430\u043C \u043C\u0435\u0442\u0440\u0438\u043A\u0438 \u0438 \u0430\u0440\u0442\u0435\u0444\u0430\u043A\u0442.\n  list:\n    - #1842 Polymarket 24h \xB7 \u0433\u043E\u0442\u043E\u0432 -> report\n    - #1839 HL lead / PM odds \xB7 \u043E\u0448\u0438\u0431\u043A\u0430 -> failed\n    - #1831 Pump.fun inflow \xB7 \u0441\u0447\u0438\u0442\u0430\u0435\u0442 -> running\n  buttons:\n    [\u041D\u043E\u0432\u043E\u0435 \u0438\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u043D\u0438\u0435 -> ask] [\u041D\u0430 \u0433\u043B\u0430\u0432\u043D\u0443\u044E -> start]\n\nscreen alerts "\u0410\u043B\u0435\u0440\u0442\u044B"\n  bot> \u0421\u043B\u0435\u0436\u0443 \u0437\u0430 \u0440\u044B\u043D\u043A\u0430\u043C\u0438, \u043F\u043E\u043A\u0430 \u0442\u044B \u043D\u0435 \u0432 \u0447\u0430\u0442\u0435.\n  list:\n    - Solana: >5 \u0442\u0440\u0430\u043D\u0441\u0444\u0435\u0440\u043E\u0432 $100k + \u043F\u0430\u0434\u0435\u043D\u0438\u0435 LP -> alert_new\n    - \u041D\u043E\u0432\u044B\u0435 \u043F\u0443\u043B\u044B Robinhood Chain \xB7 \u0430\u043D\u043E\u043C\u0430\u043B\u0438\u044F \u043E\u0431\u044A\u0451\u043C\u0430 -> alert_new\n  buttons:\n    [\u041D\u043E\u0432\u044B\u0439 \u0430\u043B\u0435\u0440\u0442 -> alert_new] [\u041D\u0430 \u0433\u043B\u0430\u0432\u043D\u0443\u044E -> start]\n\nscreen alert_new "\u041D\u043E\u0432\u044B\u0439 \u0430\u043B\u0435\u0440\u0442"\n  bot> \u0423\u0441\u043B\u043E\u0432\u0438\u0435 \u043E\u0431\u044B\u0447\u043D\u044B\u043C \u044F\u0437\u044B\u043A\u043E\u043C. \u042F \u043F\u0440\u0435\u0432\u0440\u0430\u0449\u0443 \u0435\u0433\u043E \u0432 \u043F\u0440\u043E\u0432\u0435\u0440\u044F\u0435\u043C\u043E\u0435 \u043F\u0440\u0430\u0432\u0438\u043B\u043E.\n  input: text "\u0415\u0441\u043B\u0438 \u043D\u0430 Solana >5 \u0442\u0440\u0430\u043D\u0441\u0444\u0435\u0440\u043E\u0432 $100k \u0438 LP \u043F\u0430\u0434\u0430\u0435\u0442\u2026"\n  then -> alert_saved\n  buttons:\n    [\u041E\u0442\u043C\u0435\u043D\u0438\u0442\u044C -> alerts]\n\nscreen alert_saved "\u0410\u043B\u0435\u0440\u0442 \u0432\u043A\u043B\u044E\u0447\u0451\u043D"\n  status[success]> \u041F\u0440\u0430\u0432\u0438\u043B\u043E \u0430\u043A\u0442\u0438\u0432\u043D\u043E \xB7 \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0430 \u043A\u0430\u0436\u0434\u044B\u0435 5 \u043C\u0438\u043D\u0443\u0442\n  card:\n    \u0418\u0441\u0442\u043E\u0447\u043D\u0438\u043A: Solana\n    \u0423\u0441\u043B\u043E\u0432\u0438\u0435: >5 \u0442\u0440\u0430\u043D\u0441\u0444\u0435\u0440\u043E\u0432 $100k \u0438 \u043F\u0430\u0434\u0435\u043D\u0438\u0435 LP\n    \u041A\u0430\u043D\u0430\u043B: \u044D\u0442\u043E\u0442 \u0447\u0430\u0442\n  buttons:\n    [\u041A \u0430\u043B\u0435\u0440\u0442\u0430\u043C -> alerts] [\u041D\u0430 \u0433\u043B\u0430\u0432\u043D\u0443\u044E -> start]\n\nscreen automations "\u0410\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0437\u0430\u0446\u0438\u0438"\n  bot> \u0420\u0430\u0441\u043F\u0438\u0441\u0430\u043D\u0438\u0435 \u0438\u043B\u0438 \u043F\u0435\u0440\u0441\u043E\u043D\u0430\u043B\u044C\u043D\u044B\u0439 \u0431\u043E\u0442 \u043F\u043E \u0441\u0435\u043A\u0442\u043E\u0440\u0443. \u041F\u0440\u0438\u0448\u043B\u044E \u0442\u043E\u043B\u044C\u043A\u043E \u0437\u043D\u0430\u0447\u0438\u043C\u044B\u0435 \u0441\u0438\u0433\u043D\u0430\u043B\u044B.\n  buttons:\n    [\u0423\u0442\u0440\u0435\u043D\u043D\u0438\u0439 \u0434\u0430\u0439\u0434\u0436\u0435\u0441\u0442 -> digest]\n    [\u0421\u0432\u043E\u0439 \u0431\u043E\u0442 -> custom_bot]\n    [\u041D\u0430 \u0433\u043B\u0430\u0432\u043D\u0443\u044E -> start]\n\nscreen digest "\u0414\u0430\u0439\u0434\u0436\u0435\u0441\u0442"\n  bot> \u041A\u0430\u0436\u0434\u043E\u0435 \u0443\u0442\u0440\u043E \u0441\u0432\u0435\u0440\u044E Polymarket, Hyperliquid \u0438 Solana. \u0422\u0440\u0438 \u0433\u0438\u043F\u043E\u0442\u0435\u0437\u044B \u0441 \u0434\u0430\u043D\u043D\u044B\u043C\u0438.\n  card:\n    \u041A\u043E\u0433\u0434\u0430: 09:00 UTC\n    \u0418\u0441\u0442\u043E\u0447\u043D\u0438\u043A\u0438: PM \xB7 HL \xB7 Solana\n    \u0412\u044B\u0445\u043E\u0434: 3 \u0433\u0438\u043F\u043E\u0442\u0435\u0437\u044B + \u0430\u0440\u0442\u0435\u0444\u0430\u043A\u0442\u044B\n  buttons:\n    [\u0412\u043A\u043B\u044E\u0447\u0438\u0442\u044C -> digest_on] [\u041D\u0430\u0437\u0430\u0434 -> automations]\n\nscreen digest_on "\u0414\u0430\u0439\u0434\u0436\u0435\u0441\u0442 \u0432\u043A\u043B\u044E\u0447\u0451\u043D"\n  status[success]> \u0423\u0442\u0440\u0435\u043D\u043D\u0438\u0439 \u043F\u0440\u043E\u0433\u043E\u043D \u043F\u043E\u0441\u0442\u0430\u0432\u043B\u0435\u043D \u0432 \u043E\u0447\u0435\u0440\u0435\u0434\u044C\n  buttons:\n    [\u041A \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0437\u0430\u0446\u0438\u044F\u043C -> automations] [\u041D\u0430 \u0433\u043B\u0430\u0432\u043D\u0443\u044E -> start]\n\nscreen custom_bot "\u0421\u0432\u043E\u0439 \u0431\u043E\u0442"\n  bot> \u041A\u0430\u043A\u043E\u0439 \u0441\u0435\u043A\u0442\u043E\u0440 \u0438 \u043A\u0430\u043A\u0438\u0435 \u0443\u0441\u043B\u043E\u0432\u0438\u044F \u0441\u0447\u0438\u0442\u0430\u0442\u044C \u0437\u043D\u0430\u0447\u0438\u043C\u044B\u043C\u0438?\n  input: text "\u0421\u0435\u043A\u0442\u043E\u0440: AI-\u0442\u043E\u043A\u0435\u043D\u044B. \u0421\u0438\u0433\u043D\u0430\u043B \u0442\u043E\u043B\u044C\u043A\u043E \u043F\u0440\u0438 p < 0.05\u2026"\n  then -> custom_saved\n  buttons:\n    [\u041E\u0442\u043C\u0435\u043D\u0438\u0442\u044C -> automations]\n\nscreen custom_saved "\u0411\u043E\u0442 \u0441\u043E\u0437\u0434\u0430\u043D"\n  status[success]> \u041F\u0435\u0440\u0441\u043E\u043D\u0430\u043B\u044C\u043D\u044B\u0439 \u0438\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u0442\u0435\u043B\u044C \u0441\u043B\u0435\u0434\u0438\u0442 \u0437\u0430 \u0441\u0435\u043A\u0442\u043E\u0440\u043E\u043C\n  card:\n    \u0421\u0435\u043A\u0442\u043E\u0440: AI-\u0442\u043E\u043A\u0435\u043D\u044B\n    \u0424\u0438\u043B\u044C\u0442\u0440: \u0441\u0442\u0430\u0442\u0438\u0441\u0442\u0438\u0447\u0435\u0441\u043A\u0438 \u0437\u043D\u0430\u0447\u0438\u043C\u044B\u0435 \u0441\u0438\u0433\u043D\u0430\u043B\u044B\n    \u041A\u0430\u043D\u0430\u043B: \u044D\u0442\u043E\u0442 \u0447\u0430\u0442\n  buttons:\n    [\u041A \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0437\u0430\u0446\u0438\u044F\u043C -> automations] [\u041D\u0430 \u0433\u043B\u0430\u0432\u043D\u0443\u044E -> start]\n';

// ../botflow-tldraw/examples/lovi-beta.botflow?raw
var lovi_beta_default = 'flow lovi_beta "Lovi beta"\n\nscreen home "Home"\n  user> /start\n  bot> Lovi. \u0412\u044B\u0431\u0435\u0440\u0438 \u043F\u0440\u0435\u0441\u0435\u0442 \u0438\u043B\u0438 \u043E\u043F\u0438\u0448\u0438 \u0433\u0438\u043F\u043E\u0442\u0435\u0437\u0443. Sandbox \u043D\u0435 \u043F\u043E\u0434\u043D\u0438\u043C\u0430\u0435\u0442\u0441\u044F, \u043F\u043E\u043A\u0430 \u0442\u044B \u043D\u0435 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0448\u044C \u043F\u043B\u0430\u043D.\n  buttons:\n    [\u041D\u043E\u0432\u043E\u0435 \u0438\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u043D\u0438\u0435 -> composer]\n    [\u041A\u0430\u0442\u0430\u043B\u043E\u0433 \u043F\u0440\u0435\u0441\u0435\u0442\u043E\u0432 -> catalog]\n    [\u0421\u0435\u0440\u0432\u0438\u0441\u044B \u0438 \u0430\u043B\u0435\u0440\u0442\u044B -> services]\n\nscreen composer "Composer"\n  bot> \u041E\u0434\u0438\u043D \u0432\u043E\u043F\u0440\u043E\u0441. \u0418\u0441\u0442\u043E\u0447\u043D\u0438\u043A\u0438 \u0432\u044B\u0431\u0435\u0440\u0443\u0442\u0441\u044F \u043A\u0430\u043A data scope, \u043D\u0435 \u043A\u0430\u043A \u043E\u0442\u0434\u0435\u043B\u044C\u043D\u044B\u0435 \u0431\u043E\u0442\u044B.\n  input: text "\u041D\u0430\u043F\u0440\u0438\u043C\u0435\u0440: \u043A\u0442\u043E \u043B\u0438\u0434\u0438\u0440\u0443\u0435\u0442 \u2014 HL \u0438\u043B\u0438 Polymarket \u043F\u043E BTC\u2026"\n  then -> plan\n  buttons:\n    [\u041F\u0440\u0435\u0441\u0435\u0442\u044B -> catalog] [\u2190 \u041D\u0430\u0437\u0430\u0434 -> home]\n\nscreen catalog "Catalog"\n  bot> \u0412\u0435\u0440\u0441\u0438\u043E\u043D\u0438\u0440\u043E\u0432\u0430\u043D\u043D\u044B\u0435 \u0441\u0446\u0435\u043D\u0430\u0440\u0438\u0438. 5 \u043D\u0430 \u0441\u0442\u0440\u0430\u043D\u0438\u0446\u0443, \u0434\u0430\u043B\u044C\u0448\u0435 \u0442\u043E\u0442 \u0436\u0435 \u044D\u043A\u0440\u0430\u043D.\n  list:\n    - Polymarket movers v3 -> params\n    - Hyperliquid anomaly v2 -> params\n    - Pump.fun momentum v1 -> params\n    - Cross-market lead/lag v2 -> params\n    - Threshold alert v4 -> params\n  buttons:\n    [\u0421\u0432\u043E\u044F \u0433\u0438\u043F\u043E\u0442\u0435\u0437\u0430 -> composer] [\u041D\u0430 \u0433\u043B\u0430\u0432\u043D\u0443\u044E -> home]\n\nscreen params "Params"\n  bot> Polymarket movers v3. \u041C\u0435\u043D\u044F\u044E\u0442\u0441\u044F \u0442\u043E\u043B\u044C\u043A\u043E \u043F\u0430\u0440\u0430\u043C\u0435\u0442\u0440\u044B, \u043D\u0435 \u044D\u043A\u0440\u0430\u043D\u044B.\n  card:\n    \u0420\u044B\u043D\u043A\u0438: \u0434\u043E 20\n    \u041E\u043A\u043D\u043E: 24\u0447\n    \u0418\u0441\u0442\u043E\u0447\u043D\u0438\u043A\u0438: 1 \u0438\u0437 3\n    \u041F\u0440\u043E\u0444\u0438\u043B\u044C: Light \xB7 5 \u043C\u0438\u043D\n  buttons:\n    [\u0414\u0430\u043B\u044C\u0448\u0435 -> plan]\n    [\u0414\u0440\u0443\u0433\u043E\u0439 \u043F\u0440\u0435\u0441\u0435\u0442 -> catalog] [\u041E\u0442\u043C\u0435\u043D\u0438\u0442\u044C -> home]\n\nscreen plan "Plan"\n  bot> \u041D\u043E\u0440\u043C\u0430\u043B\u0438\u0437\u043E\u0432\u0430\u043D\u043D\u044B\u0439 JobSpec. Cache hit \u043D\u0435 \u0441\u043E\u0437\u0434\u0430\u0451\u0442 sandbox.\n  card:\n    Preset: movers@v3\n    Scope: Polymarket \xB7 20 \u0440\u044B\u043D\u043A\u043E\u0432\n    Query: rankings 24h\n    Compute: Light 1vCPU/1GB\n    Cache: time bucket 5 \u043C\u0438\u043D\n  buttons:\n    [\u041A \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0435 -> review]\n    [\u0423\u0442\u043E\u0447\u043D\u0438\u0442\u044C -> composer] [\u041E\u0442\u043C\u0435\u043D\u0438\u0442\u044C -> home]\n\nscreen review "Review"\n  bot> \u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0434\u0438 \u043B\u0438\u043C\u0438\u0442\u044B. \u041F\u043E\u0441\u043B\u0435 \u0441\u0442\u0430\u0440\u0442\u0430 \u0441\u043B\u043E\u0442 \u043E\u0441\u0432\u043E\u0431\u043E\u0434\u0438\u0442\u0441\u044F \u043D\u0435 \u043F\u043E\u0437\u0436\u0435 5 \u0441\u0435\u043A\u0443\u043D\u0434 \u043E\u0442\u043C\u0435\u043D\u044B.\n  card:\n    \u041E\u0447\u0435\u0440\u0435\u0434\u044C: 0/3 waiting\n    Running: 0/1 \u043D\u0430 \u0442\u0435\u0431\u044F \xB7 2 sandbox \u043D\u0430 \u0432\u0441\u0435\u0445\n    LLM: \u22648 \u0432\u044B\u0437\u043E\u0432\u043E\u0432 \xB7 $0.50\n    \u0420\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442: \u22643500 \u0437\u043D\u0430\u043A\u043E\u0432 \xB7 1 \u0433\u0440\u0430\u0444\u0438\u043A\n  buttons:\n    [\u0417\u0430\u043F\u0443\u0441\u0442\u0438\u0442\u044C -> progress]\n    [\u041D\u0430\u0437\u0430\u0434 -> plan] [\u041E\u0442\u043C\u0435\u043D\u0438\u0442\u044C -> home]\n\nscreen progress "Progress"\n  status[loading]> \u0421\u0447\u0438\u0442\u0430\u044E. \u041E\u0434\u043D\u043E \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0435, \u043E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u0435 \u043D\u0435 \u0447\u0430\u0449\u0435 2 \u0441\u0435\u043A.\n  card:\n    \u042D\u0442\u0430\u043F: dataset \u2192 analysis\n    \u0421\u043B\u043E\u0442: Standard 2vCPU / 15 \u043C\u0438\u043D\n    Cache: miss \xB7 single-flight\n  then -> result\n  error -> capacity\n  buttons:\n    [\u041E\u0442\u043C\u0435\u043D\u0438\u0442\u044C -> home]\n\nscreen capacity "Progress"\n  status[error]> \u0421\u043B\u043E\u0442 \u0437\u0430\u043D\u044F\u0442. Heavy \u0443\u0436\u0435 \u0438\u0434\u0451\u0442, \u0442\u044B \u0432 \u043E\u0447\u0435\u0440\u0435\u0434\u0438 1/3.\n  card:\n    \u0422\u0432\u043E\u0438 running: 0/1\n    Global sandbox: 2/2\n    \u041E\u0436\u0438\u0434\u0430\u043D\u0438\u0435: durable queue\n  buttons:\n    [\u0416\u0434\u0430\u0442\u044C -> progress]\n    [\u041E\u0442\u043C\u0435\u043D\u0438\u0442\u044C -> home] [\u041D\u0430 \u0433\u043B\u0430\u0432\u043D\u0443\u044E -> home]\n\nscreen result "Result"\n  status[success]> \u0413\u043E\u0442\u043E\u0432\u043E \xB7 envelope 84 KB \xB7 sandbox \u0443\u0436\u0435 \u0441\u0432\u043E\u0431\u043E\u0434\u0435\u043D\n  card:\n    \u0422\u043E\u043F: BTC 100k by Friday\n    \u0394p: 0.41 \u2192 0.63 \xB7 vol +126%\n    Findings: 4 / 10\n    \u0410\u0440\u0442\u0435\u0444\u0430\u043A\u0442: run_1842.parquet\n  buttons:\n    [\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C \u0441\u0435\u0440\u0432\u0438\u0441 -> services]\n    [\u0415\u0449\u0451 \u0438\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u043D\u0438\u0435 -> composer]\n    [\u041D\u0430 \u0433\u043B\u0430\u0432\u043D\u0443\u044E -> home]\n\nscreen services "Services"\n  bot> \u041D\u0435 \u043C\u0430\u0448\u0438\u043D\u044B, \u0430 \u043F\u0440\u043E\u0441\u044B\u043F\u0430\u044E\u0449\u0438\u0435\u0441\u044F workflow. 5 \u043D\u0430 \u0441\u0442\u0440\u0430\u043D\u0438\u0446\u0443.\n  list:\n    - Alert \xB7 Solana whales \xB7 5 \u043C\u0438\u043D -> detail\n    - Brief \xB7 PM+HL+Solana \xB7 09:00 -> detail\n    - Watch \xB7 8 PM markets \xB7 1\u0447 -> detail\n    - Custom bot \xB7 AI tokens \xB7 1\u0447 -> detail\n    - Alert \xB7 pools.trade new \xB7 5 \u043C\u0438\u043D -> detail\n  buttons:\n    [\u041D\u043E\u0432\u044B\u0439 \u0441\u0435\u0440\u0432\u0438\u0441 -> catalog] [\u041D\u0430 \u0433\u043B\u0430\u0432\u043D\u0443\u044E -> home]\n\nscreen detail "Detail"\n  bot> Threshold alert v4. \u041E\u0431\u0449\u0438\u0439 scheduler, \u0431\u0435\u0437 \u043F\u043E\u0441\u0442\u043E\u044F\u043D\u043D\u043E\u0439 VM.\n  card:\n    \u0427\u0430\u0441\u0442\u043E\u0442\u0430: 5 \u043C\u0438\u043D \xB7 min\n    \u0410\u043A\u0442\u0438\u0432\u043D\u044B\u0445: 12 / 20\n    \u041F\u043E\u0441\u043B\u0435\u0434\u043D\u0438\u0439 hit: cache 180 \u043C\u0441\n    \u0421\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0435: active\n  buttons:\n    [\u041F\u0430\u0443\u0437\u0430 -> services]\n    [\u0417\u0430\u043F\u0443\u0441\u0442\u0438\u0442\u044C \u0441\u0435\u0439\u0447\u0430\u0441 -> review]\n    [\u041D\u0430\u0437\u0430\u0434 -> services]\n';

// ../botflow-tldraw/examples/lovi-alert.botflow?raw
var lovi_alert_default = 'flow lovi_alert "Lovi \xB7 Threshold alert"\n\nscreen home "Home"\n  user> /start\n  bot> Lovi. \u041F\u0440\u0435\u0441\u0435\u0442 \u2014 \u0435\u0434\u0438\u043D\u0438\u0446\u0430 \u043F\u0440\u043E\u0434\u0443\u043A\u0442\u0430. Alert \u043D\u0435 \u043F\u043E\u0434\u043D\u0438\u043C\u0430\u0435\u0442 \u043C\u0430\u0448\u0438\u043D\u0443, \u0442\u043E\u043B\u044C\u043A\u043E scheduler.\n  buttons:\n    [\u041D\u043E\u0432\u043E\u0435 \u0438\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u043D\u0438\u0435 -> composer]\n    [\u041A\u0430\u0442\u0430\u043B\u043E\u0433 \u043F\u0440\u0435\u0441\u0435\u0442\u043E\u0432 -> catalog]\n    [\u0421\u0435\u0440\u0432\u0438\u0441\u044B \u0438 \u0430\u043B\u0435\u0440\u0442\u044B -> services]\n\nscreen composer "Composer"\n  bot> \u0421\u0432\u043E\u0431\u043E\u0434\u043D\u0430\u044F \u0433\u0438\u043F\u043E\u0442\u0435\u0437\u0430 \u2014 escape hatch, \u043D\u0435 default. \u0414\u043E\u0440\u043E\u0436\u0435 \u043F\u0440\u0435\u0441\u0435\u0442\u0430.\n  input: text "\u041D\u0430\u043F\u0440\u0438\u043C\u0435\u0440: \u043A\u0438\u0442\u044B Solana \u0438 \u043F\u0430\u0434\u0435\u043D\u0438\u0435 LP\u2026"\n  then -> plan\n  buttons:\n    [\u041F\u0440\u0435\u0441\u0435\u0442\u044B -> catalog] [\u2190 \u041D\u0430\u0437\u0430\u0434 -> home]\n\nscreen catalog "Catalog"\n  bot> 5 \u043F\u0440\u0435\u0441\u0435\u0442\u043E\u0432 \u043D\u0430 \u0441\u0442\u0440\u0430\u043D\u0438\u0446\u0443. \u041D\u043E\u0432\u044B\u0439 \u0448\u0430\u0431\u043B\u043E\u043D \u043D\u0435 \u0434\u043E\u0431\u0430\u0432\u043B\u044F\u0435\u0442 \u044D\u043A\u0440\u0430\u043D\u044B.\n  list:\n    - Polymarket movers v3 -> params\n    - Hyperliquid anomaly v2 -> params\n    - Pump.fun momentum v1 -> params\n    - Cross-market lead/lag v2 -> params\n    - Threshold alert v4 -> params\n  buttons:\n    [\u0421\u0432\u043E\u044F \u0433\u0438\u043F\u043E\u0442\u0435\u0437\u0430 -> composer] [\u041D\u0430 \u0433\u043B\u0430\u0432\u043D\u0443\u044E -> home]\n\nscreen params "Params"\n  bot> Threshold alert v4. \u041C\u0430\u043A\u0441\u0438\u043C\u0443\u043C 6 \u043F\u043E\u043B\u0435\u0439. \u0418\u0441\u0442\u043E\u0447\u043D\u0438\u043A \u2014 data scope, \u043D\u0435 \u043E\u0442\u0434\u0435\u043B\u044C\u043D\u044B\u0439 \u0431\u043E\u0442.\n  card:\n    Scope: Solana\n    \u0423\u0441\u043B\u043E\u0432\u0438\u0435: >5 tx \u2265 $100k\n    \u0418: LP \u0442\u043E\u0433\u043E \u0436\u0435 \u0442\u043E\u043A\u0435\u043D\u0430 \u043F\u0430\u0434\u0430\u0435\u0442\n    \u0427\u0430\u0441\u0442\u043E\u0442\u0430: 5 \u043C\u0438\u043D \xB7 min\n    \u041A\u0430\u043D\u0430\u043B: \u044D\u0442\u043E\u0442 \u0447\u0430\u0442\n    \u0410\u043A\u0442\u0438\u0432\u043D\u044B\u0445: 12 / 20\n  buttons:\n    [\u0414\u0430\u043B\u044C\u0448\u0435 -> plan]\n    [\u0414\u0440\u0443\u0433\u043E\u0439 \u043F\u0440\u0435\u0441\u0435\u0442 -> catalog] [\u041E\u0442\u043C\u0435\u043D\u0438\u0442\u044C -> home]\n\nscreen plan "Plan"\n  bot> JobSpec. \u041E\u0434\u0438\u043D\u0430\u043A\u043E\u0432\u044B\u0435 \u0430\u043B\u0435\u0440\u0442\u044B \u0447\u0438\u0442\u0430\u044E\u0442 \u043E\u0434\u0438\u043D key, \u043D\u0435 \u043E\u0434\u0438\u043D ClickHouse \u043D\u0430 \u0447\u0435\u043B\u043E\u0432\u0435\u043A\u0430.\n  card:\n    Preset: threshold_alert@v4\n    Query: transfers + LP bucket\n    Compute: \u043D\u0435\u0442 sandbox\n    Cache: 5 \u043C\u0438\u043D \xB7 grouped\n    Single-flight: 1 read / key\n  buttons:\n    [\u041A \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0435 -> review]\n    [\u0423\u0442\u043E\u0447\u043D\u0438\u0442\u044C -> composer] [\u041E\u0442\u043C\u0435\u043D\u0438\u0442\u044C -> home]\n\nscreen review "Review"\n  bot> \u0412\u043A\u043B\u044E\u0447\u0430\u0435\u043C workflow, \u043D\u0435 VM. \u041E\u0442\u043C\u0435\u043D\u0430 \u043E\u0441\u0432\u043E\u0431\u043E\u0436\u0434\u0430\u0435\u0442 \u0441\u043B\u043E\u0442 \u22645 \u0441\u0435\u043A.\n  card:\n    \u0410\u043B\u0435\u0440\u0442\u044B: 12 / 20\n    \u041C\u0438\u043D. \u0447\u0430\u0441\u0442\u043E\u0442\u0430: 5 \u043C\u0438\u043D\n    Workflows: 2 / 3\n    LLM: 0 \xB7 \u043D\u0435 \u043D\u0443\u0436\u0435\u043D \u043D\u0430 tick\n    \u0420\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442: \u22643500 \u0437\u043D\u0430\u043A\u043E\u0432\n  buttons:\n    [\u0412\u043A\u043B\u044E\u0447\u0438\u0442\u044C -> progress]\n    [\u041D\u0430\u0437\u0430\u0434 -> plan] [\u041E\u0442\u043C\u0435\u043D\u0438\u0442\u044C -> home]\n\nscreen progress "Progress"\n  status[loading]> \u041F\u0435\u0440\u0432\u0430\u044F \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0430. \u041E\u0434\u043D\u043E \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0435, \u043D\u0435 \u0447\u0430\u0449\u0435 2 \u0441\u0435\u043A.\n  card:\n    \u042D\u0442\u0430\u043F: validate \u2192 first tick\n    Sandbox: \u043D\u0435 \u0441\u043E\u0437\u0434\u0430\u0451\u0442\u0441\u044F\n    Cache: warm target \u226570%\n  then -> result\n  error -> capacity\n  buttons:\n    [\u041E\u0442\u043C\u0435\u043D\u0438\u0442\u044C -> home]\n\nscreen capacity "Progress"\n  status[error]> \u041B\u0438\u043C\u0438\u0442. 20/20 \u0430\u043B\u0435\u0440\u0442\u043E\u0432 \u0438\u043B\u0438 \u0441\u043B\u043E\u0442 scheduler \u0437\u0430\u043D\u044F\u0442.\n  card:\n    \u0410\u043B\u0435\u0440\u0442\u044B: 20 / 20\n    Workflows: 3 / 3\n    \u041E\u0436\u0438\u0434\u0430\u043D\u0438\u0435: \u0441\u0443\u0437\u0438\u0442\u044C / \u043F\u0430\u0443\u0437\u0430 \u0434\u0440\u0443\u0433\u043E\u0433\u043E\n  buttons:\n    [\u041A \u0441\u0435\u0440\u0432\u0438\u0441\u0430\u043C -> services]\n    [\u041E\u0442\u043C\u0435\u043D\u0438\u0442\u044C -> home] [\u041D\u0430 \u0433\u043B\u0430\u0432\u043D\u0443\u044E -> home]\n\nscreen result "Result"\n  status[success]> \u0410\u043B\u0435\u0440\u0442 \u0430\u043A\u0442\u0438\u0432\u0435\u043D \xB7 tick 5 \u043C\u0438\u043D \xB7 sandbox \u043D\u0435 \u0437\u0430\u043D\u0438\u043C\u0430\u043B\u0438\n  card:\n    \u041F\u0440\u0430\u0432\u0438\u043B\u043E: Solana whales + LP\u2193\n    Last hit: cache 180 \u043C\u0441\n    Envelope: 12 KB\n    \u0410\u0440\u0442\u0435\u0444\u0430\u043A\u0442: \u043D\u0435\u0442 \xB7 \u0443\u0441\u043B\u043E\u0432\u0438\u0435 typed\n  buttons:\n    [\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u0441\u0435\u0440\u0432\u0438\u0441 -> detail]\n    [\u0415\u0449\u0451 \u043F\u0440\u0435\u0441\u0435\u0442 -> catalog]\n    [\u041D\u0430 \u0433\u043B\u0430\u0432\u043D\u0443\u044E -> home]\n\nscreen services "Services"\n  bot> \u041F\u0440\u043E\u0441\u044B\u043F\u0430\u044E\u0449\u0438\u0435\u0441\u044F workflow. 5 \u043D\u0430 \u0441\u0442\u0440\u0430\u043D\u0438\u0446\u0443, \u043D\u0435 \u043F\u043E\u0441\u0442\u043E\u044F\u043D\u043D\u044B\u0435 \u043F\u0440\u043E\u0446\u0435\u0441\u0441\u044B.\n  list:\n    - Alert \xB7 Solana whales \xB7 5 \u043C\u0438\u043D -> detail\n    - Brief \xB7 PM+HL+Solana \xB7 09:00 -> detail\n    - Watch \xB7 8 PM markets \xB7 1\u0447 -> detail\n    - Custom bot \xB7 AI tokens \xB7 1\u0447 -> detail\n    - Alert \xB7 pools.trade new \xB7 5 \u043C\u0438\u043D -> detail\n  buttons:\n    [\u041D\u043E\u0432\u044B\u0439 \u0441\u0435\u0440\u0432\u0438\u0441 -> catalog] [\u041D\u0430 \u0433\u043B\u0430\u0432\u043D\u0443\u044E -> home]\n\nscreen detail "Detail"\n  bot> Threshold alert v4. \u041E\u0431\u0449\u0438\u0439 scheduler, \u0431\u0435\u0437 \u043F\u043E\u0441\u0442\u043E\u044F\u043D\u043D\u043E\u0439 VM.\n  card:\n    \u0427\u0430\u0441\u0442\u043E\u0442\u0430: 5 \u043C\u0438\u043D \xB7 min\n    \u0410\u043A\u0442\u0438\u0432\u043D\u044B\u0445: 13 / 20\n    Last read: grouped key\n    \u0421\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0435: active\n  buttons:\n    [\u041F\u0430\u0443\u0437\u0430 -> services]\n    [\u041F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C \u0441\u0435\u0439\u0447\u0430\u0441 -> progress]\n    [\u041D\u0430\u0437\u0430\u0434 -> services]\n';

// ../botflow-tldraw/src/botflow-presets.js
var BOTFLOW_PRESET_IDS = Object.freeze([
  "botflow.support",
  "botflow.lovi-v1",
  "botflow.lovi-beta",
  "botflow.lovi-alert"
]);
var BOTFLOW_PRESET_SOURCES = Object.freeze({
  [BOTFLOW_PRESET_IDS[0]]: support_default,
  [BOTFLOW_PRESET_IDS[1]]: lovi_default,
  [BOTFLOW_PRESET_IDS[2]]: lovi_beta_default,
  [BOTFLOW_PRESET_IDS[3]]: lovi_alert_default
});
var DEFAULT_BOTFLOW_SOURCE = lovi_default;

// ../botflow-tldraw/src/tldraw-botflow.js
var PAGE_NAME = "Botflow";
var KIT_ID = "botflow.telegram-journey";
var DEFAULT_PRESET_ID = "botflow.lovi-v1";
var SOURCE_OFFSET_X = 0;
var SOURCE_OFFSET_Y = 1744;
var GENERATED_OFFSET_X = 0;
var GENERATED_OFFSET_Y = 0;
var colors = {
  bot: { color: "black", fill: "semi" },
  user: { color: "blue", fill: "solid" },
  status: { color: "light-blue", fill: "semi" },
  error: { color: "red", fill: "semi" },
  success: { color: "green", fill: "semi" },
  button: { color: "blue", fill: "none" },
  input: { color: "grey", fill: "none" },
  card: { color: "grey", fill: "semi" },
  list: { color: "grey", fill: "none" },
  transition: { color: "violet", fill: "none" }
};
function ownedMeta(flowId, role, instanceId, extra = {}) {
  return { botflow: { schema: "botflow/v1", flowId, instanceId, role, ...extra } };
}
function runQuiet(editor, fn) {
  try {
    return editor.run(fn, { history: "ignore" });
  } catch {
    return editor.run(fn);
  }
}
function runTransaction(editor, fn) {
  if (typeof editor.markHistoryStoppingPoint !== "function") return editor.run(fn);
  const markId = editor.markHistoryStoppingPoint("insert Botflow preset");
  try {
    return editor.run(fn);
  } catch (error) {
    editor.bailToMark(markId);
    throw error;
  }
}
function ensurePage(editor) {
  let page = editor.getPages().find((candidate) => candidate.name === PAGE_NAME);
  if (!page) {
    const id = PageRecordType.createId("botflow");
    editor.createPage({ id, name: PAGE_NAME });
    page = editor.getPage(id) ?? editor.getPages().find((candidate) => candidate.name === PAGE_NAME);
  }
  return page;
}
function sourceText(editor, shape, richTextToPlainText) {
  const richText = shape?.props?.richText ?? toRichText("");
  if (richTextToPlainText) return richTextToPlainText(richText);
  try {
    return renderPlaintextFromRichText(editor, richText);
  } catch {
    const text = [];
    const visit = (node) => {
      if (typeof node?.text === "string") text.push(node.text);
      for (const child of node?.content ?? []) visit(child);
    };
    visit(richText);
    return text.join("");
  }
}
function makeGeo({ id, parentId, x, y, w, h, text = "", color = "black", fill = "none", geo = "rectangle", meta }) {
  return {
    id,
    parentId,
    type: "geo",
    x,
    y,
    meta,
    props: { geo, w, h, color, fill, size: "s", font: "sans", align: "middle", verticalAlign: "middle", dash: "solid", growY: 0, richText: toRichText(text) }
  };
}
function upsert(editor, partial, preservePosition = false) {
  const existing = editor.getShape(partial.id);
  if (!existing) {
    editor.createShape(partial);
    return true;
  }
  const update = { ...partial };
  if (preservePosition) {
    delete update.x;
    delete update.y;
  }
  editor.updateShape(update);
  return false;
}
function partStyle(part) {
  if (part.kind === "status") {
    if (part.variant === "error") return colors.error;
    if (part.variant === "success") return colors.success;
    return colors.status;
  }
  if (part.kind === "list-entry") return colors.list;
  if (part.kind === "keyboard") return { color: "grey", fill: "semi" };
  if (part.kind === "overflow") return { color: "grey", fill: "none" };
  return colors[part.kind] ?? colors.card;
}
function chromeParts(screen, plan) {
  return [
    { kind: "status-bar", x: 0, y: 0, w: plan.width, h: 28, text: "9:41                    \u25CF\u25CF\u25CF", color: "black", fill: "solid" },
    { kind: "home-bar", x: 130, y: plan.height - 14, w: 120, h: 6, text: "", color: "grey", fill: "solid", geo: "rectangle" }
  ];
}
function createComposition(instanceId, pageId, point) {
  const key = (...parts) => createShapeId(`botflow-${stableKey(instanceId, ...parts)}`);
  return {
    instanceId,
    pageId,
    originX: point.x,
    originY: point.y,
    titleId: key("title"),
    sourceId: key("source"),
    sourceLabelId: key("source-label"),
    diagnosticsId: key("diagnostics"),
    shapeId: (...parts) => key(...parts),
    arrowId: (edgeId) => key("edge", edgeId),
    bindingId: (edgeId, terminal) => createBindingId(`botflow-${stableKey(instanceId, edgeId, terminal)}`)
  };
}
function nextInstanceId(editor) {
  let instanceId;
  do
    instanceId = String(createShapeId()).replace(/^shape:/, "");
  while ([...editor.store.allRecords()].some((record) => record.meta?.botflow?.instanceId === instanceId));
  return instanceId;
}
function compositionFromSource(sourceShape) {
  const botflow = sourceShape?.meta?.botflow;
  if (!botflow?.instanceId || !sourceShape?.parentId) return null;
  const origin = botflow.origin;
  if (!origin || !Number.isFinite(origin.x) || !Number.isFinite(origin.y)) return null;
  return createComposition(botflow.instanceId, sourceShape.parentId, origin);
}
function createNativeArrow(editor, composition, flowId, edge, fromId, toId) {
  const from = editor.getShapePageBounds(fromId);
  const to = editor.getShapePageBounds(toId);
  if (!from || !to) return null;
  const arrowId = composition.arrowId(edge.id);
  editor.createShape({
    id: arrowId,
    parentId: composition.pageId,
    type: "arrow",
    x: from.midX,
    y: from.midY,
    meta: ownedMeta(flowId, "edge", composition.instanceId, {
      edgeId: edge.id,
      from: edge.from,
      to: edge.to,
      kind: edge.role,
      sourceShapeId: fromId
    }),
    props: {
      start: { x: 0, y: 0 },
      end: { x: to.midX - from.midX, y: to.midY - from.midY },
      arrowheadEnd: "arrow",
      richText: toRichText(edge.label),
      color: edge.role === "error" ? "red" : "grey"
    }
  });
  editor.createBindings([
    {
      id: composition.bindingId(edge.id, "start"),
      type: "arrow",
      fromId: arrowId,
      toId: fromId,
      props: { terminal: "start", normalizedAnchor: { x: 0.5, y: 0.5 }, isExact: false, isPrecise: false },
      meta: ownedMeta(flowId, "edge-binding", composition.instanceId, { edgeId: edge.id, terminal: "start" })
    },
    {
      id: composition.bindingId(edge.id, "end"),
      type: "arrow",
      fromId: arrowId,
      toId,
      props: { terminal: "end", normalizedAnchor: { x: 0.5, y: 0.5 }, isExact: false, isPrecise: false },
      meta: ownedMeta(flowId, "edge-binding", composition.instanceId, { edgeId: edge.id, terminal: "end" })
    }
  ]);
  return arrowId;
}
function renderFlow(editor, composition, source, options = {}) {
  const { instanceId, pageId, originX, originY, titleId, sourceId, sourceLabelId, diagnosticsId } = composition;
  const apply = options.history === "ignore" ? (fn) => runQuiet(editor, fn) : (fn) => fn();
  const parsed = options.parsed ?? parseBotflow(source);
  const { flow, diagnostics } = parsed;
  const sourceShape = editor.getShape(sourceId);
  if (sourceShape?.meta?.botflow) {
    apply(() => editor.updateShape({
      id: sourceShape.id,
      type: sourceShape.type,
      meta: { ...sourceShape.meta, ...ownedMeta(flow.id, "source", instanceId, { origin: { x: originX, y: originY } }) }
    }));
  }
  const hasErrors = diagnostics.some((item) => item.severity === "error");
  if (hasErrors) {
    const diagnosticText2 = `BOTFLOW DIAGNOSTICS
${diagnostics.map((item) => `L${item.line} \xB7 ${item.code}
${item.message}`).join("\n\n")}`;
    apply(() => upsert(editor, makeGeo({
      id: diagnosticsId,
      parentId: pageId,
      x: originX + SOURCE_OFFSET_X,
      y: originY + SOURCE_OFFSET_Y + 620,
      w: 560,
      h: Math.max(110, 48 + diagnostics.length * 62),
      text: diagnosticText2,
      color: "red",
      fill: "semi",
      meta: ownedMeta(flow.id, "diagnostics", instanceId)
    })));
    return parsed;
  }
  const screenIds = /* @__PURE__ */ new Map();
  const edgeSourceIds = /* @__PURE__ */ new Map();
  const expected = /* @__PURE__ */ new Set([titleId, sourceId, sourceLabelId, diagnosticsId]);
  const journey = classifyJourney(flow);
  const view = journeyView(flow);
  const positions = layoutJourney(flow, { originX: originX + GENERATED_OFFSET_X, originY: originY + GENERATED_OFFSET_Y + 72, columnGap: 72, rowGap: 72 });
  const allOwned = [...editor.store.allRecords()].filter(
    (record) => record.typeName === "shape" && record.meta?.botflow?.schema === "botflow/v1" && record.meta?.botflow?.instanceId === instanceId
  );
  apply(() => {
    upsert(editor, {
      id: titleId,
      parentId: pageId,
      type: "text",
      x: originX + GENERATED_OFFSET_X,
      y: originY,
      meta: ownedMeta(flow.id, "title", instanceId),
      props: {
        richText: toRichText(`${flow.title}  \xB7  ${journey.happyPath.length} \u0448\u0430\u0433\u043E\u0432`),
        color: "black",
        size: "m",
        font: "sans",
        textAlign: "start",
        w: 640,
        autoSize: true
      }
    });
    upsert(editor, {
      id: sourceLabelId,
      parentId: pageId,
      type: "text",
      x: originX + SOURCE_OFFSET_X,
      y: originY + SOURCE_OFFSET_Y,
      meta: { component: "botflow-source-label", ...ownedMeta(flow.id, "source-label", instanceId) },
      props: { richText: toRichText("\u0418\u0441\u0445\u043E\u0434\u043D\u0438\u043A  \xB7  \u043D\u0430\u0434\u0438\u043A\u0442\u0443\u0439 \u0438\u043B\u0438 \u043F\u043E\u043F\u0440\u0430\u0432\u044C \u0442\u0435\u043A\u0441\u0442, \u044D\u043A\u0440\u0430\u043D\u044B \u043F\u0435\u0440\u0435\u0441\u043E\u0431\u0435\u0440\u0443\u0442\u0441\u044F"), color: "grey", size: "s", font: "mono", textAlign: "start", w: 560, autoSize: true }
    });
    const currentSource = editor.getShape(sourceId);
    if (currentSource) editor.updateShape({ id: sourceId, type: currentSource.type, x: originX + SOURCE_OFFSET_X, y: originY + SOURCE_OFFSET_Y + 28 });
    for (const screen of flow.screens) {
      const plan = planScreen(screen);
      const frameId = composition.shapeId("screen", screen.id);
      screenIds.set(screen.id, frameId);
      expected.add(frameId);
      const position = positions[screen.id];
      upsert(editor, {
        id: frameId,
        parentId: pageId,
        type: "frame",
        x: position.x,
        y: position.y,
        meta: ownedMeta(flow.id, "screen", instanceId, { screenId: screen.id, sourceLine: screen.line, lane: position.lane }),
        props: { w: plan.width, h: plan.height, name: screen.title, color: position.lane === "error" ? "red" : "grey" }
      }, true);
      const headerId = composition.shapeId(screen.id, "header");
      expected.add(headerId);
      upsert(editor, makeGeo({
        id: headerId,
        parentId: frameId,
        x: 0,
        y: 28,
        w: plan.width,
        h: plan.headerHeight - 28,
        text: `\u2190   ${screen.title}`,
        color: "light-blue",
        fill: "solid",
        meta: ownedMeta(flow.id, "part", instanceId, { screenId: screen.id, part: "header" })
      }));
      for (const chrome of chromeParts(screen, plan)) {
        const chromeId = composition.shapeId(screen.id, chrome.kind);
        expected.add(chromeId);
        upsert(editor, makeGeo({
          id: chromeId,
          parentId: frameId,
          x: chrome.x,
          y: chrome.y,
          w: chrome.w,
          h: chrome.h,
          text: chrome.text,
          color: chrome.color,
          fill: chrome.fill,
          geo: chrome.geo || "rectangle",
          meta: ownedMeta(flow.id, "part", instanceId, { screenId: screen.id, part: chrome.kind })
        }));
      }
      plan.parts.forEach((part, partIndex) => {
        const partId = composition.shapeId(screen.id, part.kind, part.itemIndex, part.row ?? "", part.column ?? "", part.entryIndex ?? "");
        if (part.kind === "button" && part.target) {
          edgeSourceIds.set(stableKey(flow.id, screen.id, "button", part.itemIndex, part.row, part.column, part.target), partId);
        } else if (part.kind === "list-entry" && part.target) {
          edgeSourceIds.set(stableKey(flow.id, screen.id, "list", part.itemIndex, part.entryIndex, part.target), partId);
        }
        expected.add(partId);
        const style = partStyle(part);
        upsert(editor, makeGeo({
          id: partId,
          parentId: frameId,
          x: part.x,
          y: part.y,
          w: part.w,
          h: part.h,
          text: part.text,
          color: style.color,
          fill: style.fill,
          geo: part.geo || "rectangle",
          meta: ownedMeta(flow.id, "part", instanceId, {
            screenId: screen.id,
            part: part.kind,
            partIndex,
            ...part.target ? { target: part.target } : {}
          })
        }));
      });
    }
    const oldOwned = allOwned.filter(
      (record) => record.id !== sourceId && record.id !== sourceLabelId && record.id !== diagnosticsId && record.id !== titleId && record.meta?.botflow?.role !== "edge" && !expected.has(record.id)
    );
    if (oldOwned.length) {
      const locked = oldOwned.filter((shape) => shape.isLocked).map((shape) => shape.id);
      if (locked.length) editor.toggleLock(locked);
      editor.deleteShapes(oldOwned.map((shape) => shape.id));
    }
  });
  const validEdges = view.arrows;
  const expectedEdgeIds = new Set(validEdges.map((edge) => edge.id));
  const expectedEdgeSources = new Map(validEdges.map((edge) => [edge.id, edgeSourceIds.get(edge.id) ?? screenIds.get(edge.from)]));
  const existingArrows = allOwned.filter((record) => record.type === "arrow" && record.meta?.botflow?.role === "edge");
  const arrowsByEdgeId = /* @__PURE__ */ new Map();
  const staleArrows = [];
  for (const arrow of existingArrows) {
    const edgeId = arrow.meta?.botflow?.edgeId;
    if (arrow.meta?.botflow?.flowId !== flow.id || !edgeId || !expectedEdgeIds.has(edgeId) || arrow.meta?.botflow?.sourceShapeId !== expectedEdgeSources.get(edgeId) || arrowsByEdgeId.has(edgeId)) staleArrows.push(arrow);
    else arrowsByEdgeId.set(edgeId, arrow);
  }
  if (staleArrows.length) apply(() => editor.deleteShapes(staleArrows.map((shape) => shape.id)));
  if (validEdges.length) apply(() => {
    for (const edge of validEdges) {
      const from = expectedEdgeSources.get(edge.id);
      const to = screenIds.get(edge.to);
      if (!from || !to) continue;
      const existing = arrowsByEdgeId.get(edge.id);
      if (existing) {
        editor.updateShape({
          id: existing.id,
          type: existing.type,
          props: { ...existing.props, richText: toRichText(edge.label), color: edge.role === "error" ? "red" : "grey" },
          meta: ownedMeta(flow.id, "edge", instanceId, { edgeId: edge.id, from: edge.from, to: edge.to, kind: edge.role, sourceShapeId: from })
        });
        continue;
      }
      createNativeArrow(editor, composition, flow.id, edge, from, to);
    }
  });
  const diagnosticText = `${flow.title}
\u2713 ${flow.screens.length} \u044D\u043A\u0440\u0430\u043D\u043E\u0432 \xB7 ${collectEdges(flow).length} \u0441\u0432\u044F\u0437\u0435\u0439 \xB7 ${view.arrows.length} \u043D\u0430 \u0445\u043E\u043B\u0441\u0442\u0435`;
  apply(() => upsert(editor, makeGeo({
    id: diagnosticsId,
    parentId: pageId,
    x: originX + SOURCE_OFFSET_X,
    y: originY + SOURCE_OFFSET_Y + 620,
    w: 560,
    h: 96,
    text: diagnosticText,
    color: "green",
    fill: "semi",
    meta: ownedMeta(flow.id, "diagnostics", instanceId)
  })));
  return parsed;
}
function validateInsertion(editor, source, context) {
  if (!editor) throw new TypeError("Botflow insertion requires an editor");
  const pageId = context?.pageId;
  const point = context?.point;
  if (!pageId || !editor.getPage(pageId)) throw new TypeError(`Unknown Botflow insertion page: ${pageId}`);
  if (!Number.isFinite(point?.x) || !Number.isFinite(point?.y)) {
    throw new TypeError("Botflow insertion requires a finite context.point");
  }
  const parsed = parseBotflow(source);
  const errors = parsed.diagnostics.filter(({ severity }) => severity === "error");
  if (!parsed.flow.screens.length || errors.length) {
    const summary = errors.map(({ line, message }) => `L${line}: ${message}`).join("; ") || "The source has no screens";
    throw new Error(`Invalid Botflow preset source: ${summary}`);
  }
  return parsed;
}
function createReceipt(editor, composition, presetId) {
  const records = [...editor.store.allRecords()].filter((record) => record.meta?.botflow?.instanceId === composition.instanceId);
  return {
    kitId: KIT_ID,
    presetId,
    shapeIds: records.filter((record) => record.typeName === "shape").map((record) => record.id),
    bindingIds: records.filter((record) => record.typeName === "binding").map((record) => record.id),
    instanceId: composition.instanceId,
    sourceShapeId: composition.sourceId
  };
}
function insertBotflow(editor, source, context, presetId = DEFAULT_PRESET_ID) {
  const parsed = validateInsertion(editor, source, context);
  const instanceId = nextInstanceId(editor);
  const composition = createComposition(instanceId, context.pageId, context.point);
  runTransaction(editor, () => {
    editor.createShape({
      id: composition.sourceId,
      parentId: composition.pageId,
      type: "text",
      x: composition.originX + SOURCE_OFFSET_X,
      y: composition.originY + SOURCE_OFFSET_Y + 28,
      meta: {
        component: "botflow-source",
        ...ownedMeta(parsed.flow.id, "source", instanceId, { origin: { x: composition.originX, y: composition.originY } })
      },
      props: { richText: toRichText(source), color: "black", size: "s", font: "mono", textAlign: "start", w: 560, autoSize: false }
    });
    renderFlow(editor, composition, source, { parsed });
    const rootShapeIds = [composition.titleId, ...parsed.flow.screens.map((screen) => composition.shapeId("screen", screen.id))].filter((id) => editor.getShape(id));
    editor.setSelectedShapes(rootShapeIds);
  });
  return createReceipt(editor, composition, presetId);
}
var EMPTY_REGISTRATIONS = Object.freeze([]);
function createBotflowContribution(options = {}) {
  const presets = {
    ...BOTFLOW_PRESET_SOURCES,
    ...options.source === void 0 ? {} : { [DEFAULT_PRESET_ID]: options.source },
    ...options.presets ?? {}
  };
  const presetIds = [...BOTFLOW_PRESET_IDS, ...Object.keys(presets).filter((presetId) => !BOTFLOW_PRESET_IDS.includes(presetId))];
  return Object.freeze({
    kitId: KIT_ID,
    presetIds: Object.freeze(presetIds),
    shapeUtils: EMPTY_REGISTRATIONS,
    bindingUtils: EMPTY_REGISTRATIONS,
    tools: EMPTY_REGISTRATIONS,
    onMount(editor) {
      return attachBotflowRebuilds({ editor });
    },
    insertPreset(editor, presetId, context) {
      const preset = presets[presetId];
      if (preset === void 0) throw new Error(`Unknown Botflow preset: ${presetId}`);
      const source = typeof preset === "function" ? preset({ editor, presetId, context }) : preset?.source ?? preset;
      if (typeof source !== "string") throw new TypeError(`Botflow preset ${presetId} must resolve to a source string`);
      return insertBotflow(editor, source, context, presetId);
    }
  });
}
var botflowContribution = createBotflowContribution();
var CANVAS_KIT_CONTRIBUTIONS = Object.freeze([botflowContribution]);
function attachBotflowRebuilds({ editor, signal, debounceMs = 450, richTextToPlainText } = {}) {
  if (!editor) throw new TypeError("attachBotflowRebuilds requires an editor");
  if (signal?.aborted) return () => {
  };
  const state = /* @__PURE__ */ new Map();
  let timer = null;
  let rendering = false;
  const rebuild = () => {
    if (rendering) return;
    rendering = true;
    try {
      const sources = [...editor.store.allRecords()].filter(
        (record) => record.typeName === "shape" && record.meta?.component === "botflow-source" && record.meta?.botflow?.instanceId
      );
      const liveInstances = new Set(sources.map((shape) => shape.meta.botflow.instanceId));
      for (const instanceId of state.keys()) if (!liveInstances.has(instanceId)) state.delete(instanceId);
      for (const shape of sources) {
        const composition = compositionFromSource(shape);
        if (!composition) continue;
        const source = sourceText(editor, shape, richTextToPlainText);
        if (!source || state.get(composition.instanceId) === source) continue;
        renderFlow(editor, composition, source, { history: "ignore" });
        state.set(composition.instanceId, source);
      }
    } finally {
      rendering = false;
    }
  };
  rebuild();
  const stop = editor.store.listen(() => {
    if (rendering || editor.isReplayingHistory?.()) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(rebuild, debounceMs);
  });
  const dispose = () => {
    if (timer) clearTimeout(timer);
    stop();
  };
  signal?.addEventListener("abort", dispose, { once: true });
  return dispose;
}
function installBotflow({ editor, helpers = {}, signal = new AbortController().signal, source = DEFAULT_BOTFLOW_SOURCE } = {}) {
  if (signal.aborted) return;
  const priorPage = editor.getCurrentPageId();
  const page = ensurePage(editor);
  const existingSource = [...editor.store.allRecords()].find(
    (record) => record.typeName === "shape" && record.parentId === page.id && record.meta?.component === "botflow-source"
  );
  let receipt = null;
  if (!existingSource) {
    receipt = insertBotflow(editor, source, { pageId: page.id, point: { x: 80, y: 16 } });
    editor.setCurrentPage(page.id);
    editor.zoomToSelection({ animation: { duration: 200 } });
    editor.selectNone();
  }
  const dispose = attachBotflowRebuilds({ editor, signal, richTextToPlainText: helpers.richTextToPlainText });
  if (existingSource && priorPage && priorPage !== page.id) editor.setCurrentPage(priorPage);
  return { receipt, dispose };
}
export {
  CANVAS_KIT_CONTRIBUTIONS,
  DEFAULT_BOTFLOW_SOURCE,
  attachBotflowRebuilds,
  createBotflowContribution,
  installBotflow as default
};
