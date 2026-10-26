// Starting values for the New Inward / New Outward forms (SPEC §4.1, §5.1).
import { dateIn } from "@/domain/clock";
import { formatTime } from "@/domain/format";
import type { Principal } from "@/domain/permissions";
import type { FormOptions } from "./options";

export function newInwardDefaults(
  options: FormOptions,
  user: Principal,
  now: Date,
): Record<string, string> {
  const isRegistry = options.registryUsers.some((u) => u.id === user.id);
  return {
    receivedDate: dateIn(now),
    receivedTime: formatTime(now),
    receivedById: isRegistry ? user.id : "",
    ackIssuedViaId:
      options.ackVia.find((a) => a.key === "PRINTED_SLIP")?.id ?? "",
  };
}

export function newOutwardDefaults(
  options: FormOptions,
  user: Principal,
  now: Date,
): Record<string, string> {
  // Default signatory: the Secretary to the Commission (SPEC §5.1, §9 R11).
  const secretary =
    options.signatories.find((s) =>
      /secretary to the commission/i.test(s.designation),
    ) ?? options.signatories[0];
  const isRegistry = options.registryUsers.some((u) => u.id === user.id);
  return {
    documentDate: dateIn(now),
    signedById: secretary?.id ?? "",
    signatoryDesignation:
      secretary?.designation || "Secretary to the Commission",
    dispatchedById: isRegistry ? user.id : "",
  };
}
