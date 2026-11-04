// Q-V2-2 (agreed): the re-routing notice to the previous unit.
import { describe, expect, it } from "vitest";
import { instantIn } from "./clock";
import { composeRerouteNotice, planRerouteNotice } from "./ack-email";

const base = {
  mode: "SEND" as const,
  enabled: true,
  unitChanged: true,
  previousTo: ["complaints@ogserc.org.ng", "llca@ogserc.org.ng"],
  emailedTo: ["Complaints@OGSERC.org.ng", "llca@ogserc.org.ng"],
  newTo: ["it@ogserc.org.ng"],
};

describe("planRerouteNotice", () => {
  it("tells the previous unit's addresses that had the acknowledgement", () => {
    expect(planRerouteNotice(base)).toEqual({
      action: "send",
      to: ["complaints@ogserc.org.ng", "llca@ogserc.org.ng"],
    });
    expect(planRerouteNotice({ ...base, mode: "REVIEW" })).toMatchObject({
      action: "review",
    });
  });

  it("sends nothing when off, unchanged, never emailed, or already covered", () => {
    expect(planRerouteNotice({ ...base, mode: "OFF" })).toEqual({
      action: "none",
    });
    expect(planRerouteNotice({ ...base, enabled: false })).toEqual({
      action: "none",
    });
    expect(planRerouteNotice({ ...base, unitChanged: false })).toEqual({
      action: "none",
    });
    expect(planRerouteNotice({ ...base, emailedTo: [] })).toEqual({
      action: "none",
    });
    // A shared division address gets the new unit's email anyway.
    expect(
      planRerouteNotice({
        ...base,
        newTo: ["it@ogserc.org.ng", "LLCA@ogserc.org.ng"],
      }),
    ).toEqual({ action: "send", to: ["complaints@ogserc.org.ng"] });
  });
});

it("uses the agreed wording", () => {
  const n = composeRerouteNotice(
    {
      no: "OGSERC/ACK/2026/00004",
      type: "Consumer complaint",
      sender: "Mrs A. Customer",
      subject: "Estimated billing",
      previousUnit: "Customer Complaints",
      newUnit: "ICT unit",
      acknowledgedAt: instantIn("2026-12-10", "09:00"),
      routedAt: instantIn("2026-12-11", "10:00"),
      routedBy: "Secretary to the Commission",
    },
    "Africa/Lagos",
  );
  expect(n.subject).toBe(
    "Re-routed: OGSERC/ACK/2026/00004 - Mrs A. Customer is now with ICT unit",
  );
  expect(n.body.split("\r\n")).toEqual([
    'OGSERC/ACK/2026/00004 (Consumer complaint from Mrs A. Customer: "Estimated billing") was acknowledged to Customer Complaints on 10-Dec-2026.',
    "On 11-Dec-2026 it was routed to ICT unit by Secretary to the Commission.",
    "No action is needed from Customer Complaints. If you already hold the document or have started on it, please pass it to ICT unit.",
    "",
    "OGSERC Registry",
  ]);
});
