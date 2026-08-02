import {
  KanbanTrackProjects,
  KanbanTrackProjectsSchema,
  KanbanTracksProjection,
  KanbanTracksProjectionSchema,
} from "../../shared/types/KanbanTracksProjection";
import { fetchHtmlMockupBridge } from "../html-mockup/htmlMockupBridge";

export const KANBAN_TRACKS_BRIDGE_ORIGIN = "http://127.0.0.1:5176";
export const DEFAULT_KANBAN_RUNTIME_ORIGIN = "http://127.0.0.1:3484";

function normalizeLoopbackRuntimeOrigin(value: string) {
  const url = new URL(value.trim());
  if (
    url.protocol !== "http:" ||
    !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      "Kanban runtime must be an unauthenticated loopback HTTP URL",
    );
  }
  url.pathname = "";
  return url.toString().replace(/\/$/, "");
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      text || `Kanban Tracks request failed (${response.status})`,
    );
  }
  return text ? JSON.parse(text) : null;
}

export class KanbanTracksProvider {
  readonly runtimeOrigin: string;
  readonly bridgeOrigin: string;

  constructor(runtimeOrigin: string, options: { bridgeOrigin?: string } = {}) {
    this.runtimeOrigin = normalizeLoopbackRuntimeOrigin(runtimeOrigin);
    this.bridgeOrigin = options.bridgeOrigin ?? KANBAN_TRACKS_BRIDGE_ORIGIN;
  }

  async listProjects(signal?: AbortSignal): Promise<KanbanTrackProjects> {
    const url = new URL("/kanban/tracks/projects", this.bridgeOrigin);
    url.searchParams.set("runtimeOrigin", this.runtimeOrigin);
    const payload = await readJson(
      await fetchHtmlMockupBridge(url, { cache: "no-store", signal }),
    );
    return KanbanTrackProjectsSchema.parse(payload);
  }

  async inspectTracks(
    projectRef: string,
    signal?: AbortSignal,
  ): Promise<KanbanTracksProjection> {
    const url = new URL("/kanban/tracks/projection", this.bridgeOrigin);
    url.searchParams.set("runtimeOrigin", this.runtimeOrigin);
    url.searchParams.set("projectRef", projectRef);
    const payload = await readJson(
      await fetchHtmlMockupBridge(url, { cache: "no-store", signal }),
    );
    return KanbanTracksProjectionSchema.parse(payload);
  }
}
