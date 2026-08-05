export const OPERATIONAL_EVENT_VERSION = 1;
export const OPERATIONAL_ELIGIBILITY_VERSION = 1;
export const OPERATIONAL_EVENT_MAX_BYTES = 768;

const REQUEST_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LOGICAL_ROUTE_PATTERN = /^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:GET|POST|PUT|PATCH|DELETE)$/;
const STABLE_TOKEN_PATTERN = /^[a-zA-Z0-9._-]{1,64}$/;
const COMMIT_PATTERN = /^[0-9a-f]{40}$/i;
const ALLOWED_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);

declare const __HHR_RELEASE_COMMIT__: string;
declare const __HHR_RELEASE_SCHEMA__: string;
declare const __HHR_RELEASE_MANIFEST_VERSION__: number;

export type OperationalOutcome = "success" | "failure" | "cancelled";

export type OperationalRelease = {
  manifestVersion: number;
  commit: string;
  schema: string;
};

export type OperationalEvent = {
  operationalVersion: number;
  event: "api_request";
  level: "info" | "warn" | "error";
  outcome: OperationalOutcome;
  requestId: string;
  route: string;
  routeFamily: string;
  method: string;
  status: number;
  code: string;
  durationMs: number;
  releaseManifestVersion: number;
  releaseCommit: string;
  releaseSchema: string;
};

export type OperationalEventInput = {
  requestId: string;
  route: string;
  method: string;
  status: number;
  code: string;
  durationMs: number;
  outcome?: OperationalOutcome;
};

export function isOperationalIndicatorEligible(
  event: Pick<OperationalEvent, "outcome" | "status">,
): boolean {
  return event.outcome !== "cancelled" && (event.status < 400 || event.status >= 500);
}

function compiledCommit(): string | undefined {
  return typeof __HHR_RELEASE_COMMIT__ === "string"
    ? __HHR_RELEASE_COMMIT__
    : undefined;
}

function compiledSchema(): string | undefined {
  return typeof __HHR_RELEASE_SCHEMA__ === "string"
    ? __HHR_RELEASE_SCHEMA__
    : undefined;
}

function compiledManifestVersion(): number | undefined {
  return typeof __HHR_RELEASE_MANIFEST_VERSION__ === "number"
    ? __HHR_RELEASE_MANIFEST_VERSION__
    : undefined;
}

export function operationalReleaseIdentity(
  environment: Record<string, string | undefined> = process.env,
): OperationalRelease {
  const commitCandidate = compiledCommit() ?? environment.HHR_RELEASE_SHA;
  const schemaCandidate = compiledSchema() ?? environment.HHR_RELEASE_SCHEMA;
  const manifestCandidate = compiledManifestVersion()
    ?? Number(environment.HHR_RELEASE_MANIFEST_VERSION);
  return {
    manifestVersion: Number.isSafeInteger(manifestCandidate) && manifestCandidate > 0
      ? manifestCandidate
      : 1,
    commit: typeof commitCandidate === "string" && COMMIT_PATTERN.test(commitCandidate)
      ? commitCandidate.toLowerCase()
      : "local",
    schema: typeof schemaCandidate === "string" && STABLE_TOKEN_PATTERN.test(schemaCandidate)
      ? schemaCandidate
      : "local",
  };
}

function normalizedOutcome(input: OperationalEventInput, status: number): OperationalOutcome {
  if (input.outcome) return input.outcome;
  if (status === 499) return "cancelled";
  return status >= 400 ? "failure" : "success";
}

function normalizedStatus(status: number): number {
  return Number.isSafeInteger(status) && status >= 100 && status <= 599 ? status : 500;
}

function normalizedDuration(durationMs: number): number {
  if (!Number.isFinite(durationMs)) return 0;
  return Math.min(86_400_000, Math.max(0, Math.round(durationMs)));
}

function normalizedRoute(route: string): string {
  return LOGICAL_ROUTE_PATTERN.test(route) ? route : "unknown.GET";
}

function normalizedMethod(method: string): string {
  const value = method.toUpperCase();
  return ALLOWED_METHODS.has(value) ? value : "OTHER";
}

function normalizedCode(code: string, outcome: OperationalOutcome): string {
  if (STABLE_TOKEN_PATTERN.test(code)) return code;
  return outcome === "success" ? "OK" : "INTERNAL_ERROR";
}

export function buildOperationalEvent(
  input: OperationalEventInput,
  release: OperationalRelease = operationalReleaseIdentity(),
): OperationalEvent {
  const status = normalizedStatus(input.status);
  const outcome = normalizedOutcome(input, status);
  const route = normalizedRoute(input.route);
  const safeRelease = operationalReleaseIdentity({
    HHR_RELEASE_MANIFEST_VERSION: String(release.manifestVersion),
    HHR_RELEASE_SHA: release.commit,
    HHR_RELEASE_SCHEMA: release.schema,
  });
  return {
    operationalVersion: OPERATIONAL_EVENT_VERSION,
    event: "api_request",
    level: status >= 500 ? "error" : outcome === "failure" ? "warn" : "info",
    outcome,
    requestId: REQUEST_ID_PATTERN.test(input.requestId) ? input.requestId.toLowerCase() : "invalid",
    route,
    routeFamily: route.split(".", 1)[0],
    method: normalizedMethod(input.method),
    status,
    code: normalizedCode(input.code, outcome),
    durationMs: normalizedDuration(input.durationMs),
    releaseManifestVersion: safeRelease.manifestVersion,
    releaseCommit: safeRelease.commit,
    releaseSchema: safeRelease.schema,
  };
}

export function emitOperationalEvent(input: OperationalEventInput): void {
  try {
    const event = buildOperationalEvent(input);
    const line = JSON.stringify(event);
    if (line.length > OPERATIONAL_EVENT_MAX_BYTES) return;
    if (event.level === "error") console.error(line);
    else if (event.level === "warn") console.warn(line);
    else console.log(line);
  } catch {
    // Operational telemetry must never alter the API response.
  }
}
