// Routing (SPEC-v2 C5): only users granted registry.route (the per-user
// "can route" flag) route an inward item: unit, file, action, priority, action
// officer, due date. Pure rules and messages; the server checks the capability
// and stores a RoutingEvent for every save.
import type { IsoDate } from "./calendar";
import type { InwardStatus } from "./inward";
import type { ActionRequiredKey, PriorityKey } from "./rules";

/** C5.1 refusal, shown to anyone without registry.route. */
export const ROUTING_REFUSED =
  "Only the Secretary to the Commission and the Head of Administration can route items.";

/** The six fields routing sets (C5.2). Ids are foreign keys. */
export type RoutingFields = {
  unitOverrideId: string | null;
  fileId: string | null;
  actionRequired: ActionRequiredKey | null;
  priority: PriorityKey | null;
  actionOfficer: string | null;
  responseDueOverride: IsoDate | null;
};

export const ROUTING_FIELD_LABELS: Record<keyof RoutingFields, string> = {
  unitOverrideId: "Unit (override)",
  fileId: "File reference",
  actionRequired: "Action required",
  priority: "Priority",
  actionOfficer: "Action officer",
  responseDueOverride: "Response due (override)",
};

const ROUTING_KEYS = Object.keys(
  ROUTING_FIELD_LABELS,
) as (keyof RoutingFields)[];

/**
 * Why an item cannot be routed, or null. Void and Closed items are refused
 * (E5; the workbook does not check).
 */
export function routingBlocker(item: {
  number: string;
  status: InwardStatus;
}): string | null {
  if (item.status === "Void")
    return `${item.number} is void and cannot be routed.`;
  if (item.status === "Closed")
    return `${item.number} is closed and cannot be routed.`;
  return null;
}

/** Missing required routing fields, as form labels (C5.2: action required). */
export function missingRoutingFields(f: RoutingFields): string[] {
  return f.actionRequired ? [] : [ROUTING_FIELD_LABELS.actionRequired];
}

/** Before/after of the routing fields that changed (RoutingEvent and audit). */
export function routingChanges(
  before: RoutingFields,
  after: RoutingFields,
): { before: Partial<RoutingFields>; after: Partial<RoutingFields> } {
  const b: Record<string, unknown> = {};
  const a: Record<string, unknown> = {};
  for (const k of ROUTING_KEYS)
    if ((before[k] ?? null) !== (after[k] ?? null)) {
      b[k] = before[k] ?? null;
      a[k] = after[k] ?? null;
    }
  return {
    before: b as Partial<RoutingFields>,
    after: a as Partial<RoutingFields>,
  };
}

/** C5.2 message after saving routing; the email line follows it. */
export function routedMessage(
  no: string,
  unit: string,
  routedBy: string,
  status: InwardStatus,
): string {
  return `${no} routed to ${unit} by ${routedBy}.\nStatus: ${status}`;
}

/**
 * Forwarding (Forwarded today, Close today, or an Update Item that sets the
 * date forwarded) on an item not yet routed needs a confirm (C5.4; agreed for
 * Close today and Update Item too). After the user confirms, the item records
 * the fact and shows the flag "Forwarded before routing" (E6).
 */
export function needsForwardBeforeRoutingConfirm(item: {
  routed: boolean;
  dateForwarded: IsoDate | null;
  /** The date forwarded the action would set; null if it sets none. */
  settingForwarded: IsoDate | null;
}): boolean {
  return !item.routed && !item.dateForwarded && item.settingForwarded !== null;
}

export function forwardBeforeRoutingPrompt(no: string): string {
  return `${no} has not been routed by the Secretary / Head of Admin yet. Forward it anyway?`;
}
