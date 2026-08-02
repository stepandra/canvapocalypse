const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);
const RESIDENT_CAPABILITY_HEADER = "x-tldraw-html-capability";

export function normalizeKanbanRuntimeOrigin(value) {
  const url = new URL(value);
  if (
    url.protocol !== "http:" ||
    !LOOPBACK_HOSTS.has(url.hostname) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw Object.assign(
      new Error("Kanban runtime must be an unauthenticated loopback HTTP URL"),
      { statusCode: 400 },
    );
  }
  url.pathname = "";
  return url.toString().replace(/\/$/, "");
}

async function proxyJson(response, upstreamResponse, send) {
  const body = await upstreamResponse.text();
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  return send(response, upstreamResponse.status, body);
}

export function createKanbanTracksService({
  fetchFn = fetch,
  residentCapability,
} = {}) {
  if (!residentCapability) {
    throw new Error("Kanban Tracks resident capability is required");
  }
  return async function handleKanbanTracksRequest(
    url,
    request,
    response,
    send,
  ) {
    if (request.method !== "GET") return false;
    if (request.headers?.[RESIDENT_CAPABILITY_HEADER] !== residentCapability) {
      send(response, 401, "Resident capability is required");
      return true;
    }
    const runtimeOrigin = normalizeKanbanRuntimeOrigin(
      url.searchParams.get("runtimeOrigin") || "http://127.0.0.1:3484",
    );
    if (url.pathname === "/kanban/tracks/projects") {
      const upstream = await fetchFn(`${runtimeOrigin}/api/tracks/projects`, {
        cache: "no-store",
      });
      await proxyJson(response, upstream, send);
      return true;
    }
    if (url.pathname === "/kanban/tracks/projection") {
      const projectRef = url.searchParams.get("projectRef")?.trim();
      if (!projectRef) {
        throw Object.assign(new Error("projectRef is required"), {
          statusCode: 400,
        });
      }
      const upstreamUrl = new URL("/api/tracks/projection", runtimeOrigin);
      upstreamUrl.searchParams.set("projectRef", projectRef);
      const upstream = await fetchFn(upstreamUrl, { cache: "no-store" });
      await proxyJson(response, upstream, send);
      return true;
    }
    return false;
  };
}
