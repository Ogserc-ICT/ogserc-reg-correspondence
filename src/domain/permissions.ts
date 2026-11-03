// Who may do what (SPEC §10 with SPEC-v2 C12, STACK rules 6–7). Pure and
// deny-by-default: a role has only the capabilities listed here. Routing
// (registry.route) belongs to no role: only the per-user canRoute flag grants
// it, and it grants nothing else. The server checks these on every action and
// filters every query by `readScope`.

export type Role =
  | "REGISTRY_OFFICER"
  | "HEAD_OF_REGISTRY"
  | "UNIT_OFFICER"
  | "SECRETARY"
  | "ADMIN"
  | "FRONT_DESK_OFFICER";

export const ROLE_LABELS: Record<Role, string> = {
  REGISTRY_OFFICER: "Registry officer",
  HEAD_OF_REGISTRY: "Head of Registry",
  UNIT_OFFICER: "Unit officer",
  SECRETARY: "Secretary / management",
  ADMIN: "Admin",
  FRONT_DESK_OFFICER: "Front desk officer",
};

export type Capability =
  /** Log inward/outward; forward, close, dispatch, deliver; update handling fields. */
  | "registers.write"
  /** Void an item (reason required). */
  | "items.void"
  /** Edit any field of any item. */
  | "items.editAny"
  /** File Index and file movements. */
  | "files.read"
  | "files.write"
  /** Files marked Confidential, or of class Personnel. */
  | "files.readConfidential"
  | "reports.print"
  | "dashboard.view"
  /** Incoming/outgoing types, lists, holidays. */
  | "reference.manage"
  | "users.manage"
  | "settings.manage"
  /** Read the audit log. */
  | "audit.view"
  /** Routing Desk (C5). Granted only by User.canRoute, never by a role. */
  | "registry.route"
  /** Log front desk intakes (C3). */
  | "frontdesk.write"
  /** Front Desk Log and pulling intakes into New Inward (C3, C12). */
  | "frontdesk.read"
  /** Resend acknowledgement emails and send or discard those to review (C6). */
  | "ackEmail.send";

const CAPABILITIES: Record<Role, readonly Capability[]> = {
  REGISTRY_OFFICER: [
    "registers.write",
    "frontdesk.read",
    "ackEmail.send",
    "files.read",
    "files.write",
    "reports.print",
    "dashboard.view",
  ],
  HEAD_OF_REGISTRY: [
    "registers.write",
    "frontdesk.read",
    "ackEmail.send",
    "items.void",
    "items.editAny",
    "files.read",
    "files.write",
    "files.readConfidential",
    "reports.print",
    "dashboard.view",
    "reference.manage",
    "audit.view",
  ],
  // Read-only in v1 (Q5); reads are limited by readScope.
  UNIT_OFFICER: [],
  SECRETARY: [
    "frontdesk.read",
    "files.read",
    "files.readConfidential",
    "reports.print",
    "dashboard.view",
  ],
  ADMIN: ["users.manage", "settings.manage", "audit.view"],
  // C12: intakes only; no registers, routing or files.
  FRONT_DESK_OFFICER: ["frontdesk.write"],
};

export type Principal = {
  id: string;
  role: Role;
  /** Unit officers only. */
  unitId: string | null;
  active: boolean;
  /** User.canRoute: adds registry.route, nothing else (C5.1, C12). */
  canRoute?: boolean;
};

export function can(user: Principal | null, cap: Capability): boolean {
  if (!user || !user.active) return false;
  if (cap === "registry.route") return user.canRoute === true;
  return CAPABILITIES[user.role].includes(cap);
}

export function capabilitiesOf(role: Role): readonly Capability[] {
  return CAPABILITIES[role];
}

/** Which inward/outward items a user may read. */
export type ReadScope =
  { kind: "all" } | { kind: "unit"; unitId: string } | { kind: "none" };

export function readScope(user: Principal | null): ReadScope {
  if (!user || !user.active) return { kind: "none" };
  switch (user.role) {
    case "REGISTRY_OFFICER":
    case "HEAD_OF_REGISTRY":
    case "SECRETARY":
      return { kind: "all" };
    case "UNIT_OFFICER":
      return user.unitId
        ? { kind: "unit", unitId: user.unitId }
        : { kind: "none" };
    case "ADMIN":
    case "FRONT_DESK_OFFICER":
      return { kind: "none" };
  }
}

/**
 * The Routing Desk loads any inward item for a user with registry.route,
 * whatever their role's read scope (C5.2 read-only fields). It opens nothing
 * else: registers, files and reports still follow the role.
 */
export function canReadForRouting(user: Principal | null): boolean {
  return can(user, "registry.route");
}

/**
 * Unit officers see every non-void inward item routed to their unit (Phase 0
 * proposal for SPEC §10, which says "pending and closed").
 */
export function canReadInward(
  user: Principal | null,
  item: { routedUnitId: string; voided: boolean },
): boolean {
  const scope = readScope(user);
  if (scope.kind === "all") return true;
  if (scope.kind === "unit")
    return !item.voided && item.routedUnitId === scope.unitId;
  return false;
}

/** Unit officers see non-void outward items their unit originated. */
export function canReadOutward(
  user: Principal | null,
  item: { originatingUnitId: string; voided: boolean },
): boolean {
  const scope = readScope(user);
  if (scope.kind === "all") return true;
  if (scope.kind === "unit")
    return !item.voided && item.originatingUnitId === scope.unitId;
  return false;
}

/** Confidential files and Personnel files are hidden from registry officers. */
export function canReadFile(
  user: Principal | null,
  file: { confidential: boolean },
): boolean {
  if (!can(user, "files.read")) return false;
  return !file.confidential || can(user, "files.readConfidential");
}

/**
 * Only the Head of Registry voids, and never an item they logged themselves
 * unless the setting allows it (STACK rule 7, Q-D).
 */
export function canVoid(
  user: Principal | null,
  item: { createdById: string; voided: boolean },
  headMayVoidOwnItems: boolean,
): boolean {
  if (!can(user, "items.void") || item.voided) return false;
  return headMayVoidOwnItems || item.createdById !== user!.id;
}

/** Unit officers need a unit; nobody else has one. */
export function roleUnitError(
  role: Role,
  unitId: string | null,
): string | null {
  if (role === "UNIT_OFFICER" && !unitId) return "A unit officer needs a unit.";
  if (role !== "UNIT_OFFICER" && unitId)
    return "Only unit officers have a unit.";
  return null;
}
