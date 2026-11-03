// Routing (SPEC-v2 C5): the Routing Desk loads an inward item and saves the
// six routing fields. Only a user with registry.route (the per-user canRoute
// flag) may do either; the flag opens the item for routing and nothing else.
// Every save writes a RoutingEvent and an audit entry in one transaction.
import { can, canReadForRouting } from "@/domain/permissions";
import {
  missingRoutingFields,
  routedMessage,
  routingBlocker,
  routingChanges,
  ROUTING_REFUSED,
  type RoutingFields,
} from "@/domain/routing";
import type { Prisma } from "@/generated/prisma/client";
import { audit } from "../audit";
import { verifyPassword } from "../auth";
import { fromDbDate, toDbDate } from "../dates";
import type { Db, Tx } from "../db";
import { ForbiddenError, ValidationError } from "../errors";
import { refreshInward, type Actor } from "../registers";
import { loadRuleContext } from "../rules";
import { lockInward, refProblems, throwIfProblems, type Raw } from "./common";
import { INWARD_LABELS, readInward } from "./inward";

/** The stored routing fields (ids are foreign keys). */
type StoredRouting = {
  unitOverrideId: string | null;
  fileId: string | null;
  actionRequiredId: string | null;
  priorityId: string | null;
  actionOfficer: string | null;
  responseDueOverride: string | null;
};

const ROUTING_KEYS = [
  "unitOverrideId",
  "fileId",
  "actionRequiredId",
  "priorityId",
  "actionOfficer",
  "responseDueOverride",
] as const;

function assertRouter(actor: Actor): void {
  if (!can(actor.user, "registry.route"))
    throw new ForbiddenError(ROUTING_REFUSED);
}

/** The stored fields in the shape the domain diff compares. */
function asDomain(f: StoredRouting): RoutingFields {
  return {
    unitOverrideId: f.unitOverrideId,
    fileId: f.fileId,
    // Ids stand in for keys: the diff compares values only.
    actionRequired: f.actionRequiredId as RoutingFields["actionRequired"],
    priority: f.priorityId as RoutingFields["priority"],
    actionOfficer: f.actionOfficer,
    responseDueOverride: f.responseDueOverride,
  };
}

const DOMAIN_TO_STORED: Record<keyof RoutingFields, keyof StoredRouting> = {
  unitOverrideId: "unitOverrideId",
  fileId: "fileId",
  actionRequired: "actionRequiredId",
  priority: "priorityId",
  actionOfficer: "actionOfficer",
  responseDueOverride: "responseDueOverride",
};

/** Readable values for history and audit: ids become { id, label }. */
async function describe(
  tx: Tx,
  part: Partial<RoutingFields>,
): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(part) as [
    keyof RoutingFields,
    string | null,
  ][]) {
    const stored = DOMAIN_TO_STORED[k];
    if (
      v === null ||
      stored === "actionOfficer" ||
      stored === "responseDueOverride"
    ) {
      out[stored] = v;
      continue;
    }
    let label: string | null = null;
    if (stored === "unitOverrideId")
      label = (await tx.unit.findUnique({ where: { id: v } }))?.name ?? null;
    else if (stored === "fileId")
      label =
        (await tx.registryFile.findUnique({ where: { id: v } }))?.reference ??
        null;
    else
      label =
        (await tx.listItem.findUnique({ where: { id: v } }))?.label ?? null;
    out[stored] = { id: v, label };
  }
  return out;
}

/**
 * Routing Desk "load": the C5.2 read-only details, the editable routing
 * fields and the routing history. Opens any inward item, but only for a
 * router; it never widens what the role can read elsewhere.
 */
export async function loadForRouting(db: Db, actor: Actor, id: string) {
  if (!canReadForRouting(actor.user)) throw new ForbiddenError(ROUTING_REFUSED);
  const ctx = await loadRuleContext(db, actor.now);
  const row = await db.inwardItem.findUnique({
    where: { id },
    include: {
      routedUnit: { include: { division: true } },
      routedBy: { select: { name: true } },
      file: { select: { reference: true } },
      actionRequired: { select: { label: true } },
      priority: { select: { label: true } },
      routingEvents: {
        orderBy: { routedAt: "asc" },
        include: { routedBy: { select: { name: true } } },
      },
    },
  });
  if (!row) throw new ValidationError(["That inward item doesn't exist."]);
  const derived = await db.$transaction((tx) => refreshInward(tx, id, ctx));
  return {
    id: row.id,
    number: row.number,
    sender: row.sender,
    subject: row.subject,
    type: row.snapTypeName,
    status: derived.status,
    unit: row.routedUnit.name,
    division: row.routedUnit.division?.name ?? null,
    routedBy: row.routedBy?.name ?? null,
    routedAt: row.routedAt,
    blocker: routingBlocker({ number: row.number, status: derived.status }),
    fields: {
      unitOverrideId: row.unitOverrideId,
      fileId: row.fileId,
      fileReference: row.file?.reference ?? null,
      actionRequiredId: row.actionRequiredId,
      priorityId: row.priorityId,
      actionOfficer: row.actionOfficer,
      responseDueOverride: fromDbDate(row.responseDueOverride),
    },
    history: row.routingEvents.map((e) => ({
      at: e.routedAt,
      by: e.routedBy.name,
      before: e.before,
      after: e.after,
    })),
  };
}

/**
 * Routing Desk "save" (C5.2). Re-routing is allowed and kept as history (E4);
 * Closed and Void items are refused (E5). Returns the C5.2 message; the
 * acknowledgement email (C6) is added in V6.
 */
export async function routeInward(
  db: Db,
  actor: Actor,
  id: string,
  raw: Raw,
  opts: { password?: string } = {},
) {
  assertRouter(actor);
  const { fields, problems } = readInward(
    Object.fromEntries(
      Object.entries(raw).filter(([k]) =>
        (ROUTING_KEYS as readonly string[]).includes(k),
      ),
    ),
  );

  return db.$transaction(
    async (tx) => {
      const settings = await tx.registrySettings.findUniqueOrThrow({
        where: { id: 1 },
      });
      const router = await tx.user.findUniqueOrThrow({
        where: { id: actor.user.id },
      });
      // Q-V2-3 (default off): re-enter the password to route.
      if (settings.routingRequiresPassword) {
        const account = await tx.account.findFirst({
          where: { userId: router.id, providerId: "credential" },
        });
        const ok =
          !!opts.password &&
          !!account?.password &&
          (await verifyPassword({
            hash: account.password,
            password: opts.password,
          }));
        if (!ok)
          throw new ValidationError([
            "Re-enter your password to save the routing.",
          ]);
      }

      const ctx = await loadRuleContext(tx, actor.now);
      await lockInward(tx, id);
      const row = await tx.inwardItem.findUnique({ where: { id } });
      if (!row) throw new ValidationError(["That inward item doesn't exist."]);
      const current = await refreshInward(tx, id, ctx);
      const blocked = routingBlocker({
        number: row.number,
        status: current.status,
      });
      if (blocked) throw new ValidationError([blocked]);

      const before: StoredRouting = {
        unitOverrideId: row.unitOverrideId,
        fileId: row.fileId,
        actionRequiredId: row.actionRequiredId,
        priorityId: row.priorityId,
        actionOfficer: row.actionOfficer,
        responseDueOverride: fromDbDate(row.responseDueOverride),
      };
      const after: StoredRouting = {
        unitOverrideId: fields.unitOverrideId ?? null,
        fileId: fields.fileId ?? null,
        actionRequiredId: fields.actionRequiredId ?? null,
        priorityId: fields.priorityId ?? null,
        actionOfficer: fields.actionOfficer ?? null,
        responseDueOverride: fields.responseDueOverride ?? null,
      };

      const missing = missingRoutingFields(asDomain(after));
      const all = [...problems];
      all.push(
        ...(await refProblems(
          tx,
          [
            {
              kind: "unit",
              id: after.unitOverrideId,
              label: INWARD_LABELS.unitOverrideId,
            },
            {
              kind: "list",
              list: "ACTION_REQUIRED",
              id: after.actionRequiredId,
              label: INWARD_LABELS.actionRequiredId,
            },
            {
              kind: "list",
              list: "PRIORITY",
              id: after.priorityId,
              label: INWARD_LABELS.priorityId,
            },
          ],
          true,
        )),
      );
      if (after.fileId) {
        const file = await tx.registryFile.findUnique({
          where: { id: after.fileId },
        });
        if (!file) all.push("File: choose a file from the search.");
      }
      throwIfProblems(missing, all);

      const diff = routingChanges(asDomain(before), asDomain(after));
      const item = await tx.inwardItem.update({
        where: { id },
        data: {
          unitOverrideId: after.unitOverrideId,
          fileId: after.fileId,
          actionRequiredId: after.actionRequiredId,
          priorityId: after.priorityId,
          actionOfficer: after.actionOfficer,
          responseDueOverride: toDbDate(after.responseDueOverride),
          routedById: router.id,
          routedAt: actor.now,
        },
      });
      const history = {
        before: (await describe(tx, diff.before)) as Prisma.InputJsonValue,
        after: (await describe(tx, diff.after)) as Prisma.InputJsonValue,
      };
      await tx.routingEvent.create({
        data: {
          inwardItemId: id,
          routedById: router.id,
          routedAt: actor.now,
          ...history,
        },
      });
      await audit(
        tx,
        {
          userId: router.id,
          action: "route",
          entityType: "InwardItem",
          entityId: id,
          before: { ...(history.before as object), routedAt: row.routedAt },
          after: { ...(history.after as object), routedAt: actor.now },
        },
        actor.now,
      );
      const derived = await refreshInward(tx, id, ctx);
      const unit = await tx.unit.findUniqueOrThrow({
        where: { id: derived.routedUnitId ?? row.snapDefaultUnitId },
      });
      return {
        item,
        status: derived.status,
        message: routedMessage(
          row.number,
          unit.name,
          router.name,
          derived.status,
        ),
      };
    },
    { timeout: 20_000 },
  );
}
