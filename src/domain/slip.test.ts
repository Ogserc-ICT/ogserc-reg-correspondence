// TEMPLATES §1 and SPEC §9 R13: heading by para103SlipWording, footer by type.
import { describe, expect, it } from "vitest";
import { SLIP_FOOTERS } from "../../prisma/seed/reference";
import { instantIn } from "./clock";
import {
  HEADING_GENERAL,
  HEADING_PARA103,
  slipContent,
  type SlipInput,
} from "./slip";

const base: SlipInput = {
  number: "OGSERC/ACK/2026/00001",
  receivedAt: instantIn("2026-11-20", "10:15"),
  deemedReceiptDate: "2026-11-20",
  mode: "Hand delivery",
  orderRef: "11; Sch. 1 Pt A",
  type: "REG-01 Registration (new)",
  relatedOgsercNo: null,
  sender: "Sample Mini-Grid Ltd",
  senderRef: null,
  subject: "Registration of mini-grid operator",
  deliveredBy: null,
  volumes: 2,
  schedule2DocsAttached: 12,
  feeEvidenceAttached: true,
  paymentRef: "OGSERC-PAY-0001",
  amountShownKobo: BigInt(25_000_000),
  receivedBy: "Registry Officer 1",
  forwardedTo: "Licensing unit",
  para103SlipWording: true,
  footerKind: "REGISTRATION",
  footers: SLIP_FOOTERS,
  officeClosingTime: "17:00",
  secretaryName: "",
  registryAddress:
    "Registry · 5th & 6th Floors, OPIC Building, Oke-Ilewo, Abeokuta",
};

describe("acknowledgement slip content", () => {
  it("I1 (REG-01): para 10(3) heading and the registration footer", () => {
    const c = slipContent(base);
    expect(c.heading).toBe(HEADING_PARA103);
    expect(c.footer).toContain(
      "It is not a registration, licence or permit (para 11(3)).",
    );
    expect(c.footer).toContain("after 5:00 p.m. or on a non-working day");
    expect(c.lines.flat()).toContainEqual(["Amount shown (₦)", "₦250,000"]);
    expect(c.lines.flat()).toContainEqual([
      "Date & time received",
      "20-Nov-2026 10:15",
    ]);
    expect(c.lines.flat()).toContainEqual(["Sender's ref. no.", "—"]);
    expect(c.forSecretary).toBe("For the Secretary to the Commission (—)");
  });

  it("I3 (NERC letter): general heading and general footer", () => {
    const c = slipContent({
      ...base,
      para103SlipWording: false,
      footerKind: "GENERAL",
    });
    expect(c.heading).toBe(HEADING_GENERAL);
    expect(c.footer).toBe(SLIP_FOOTERS.general);
    expect(c.footer).not.toContain("registration");
  });

  it("other para 10(3) types: short para 10(3) footer, closing time from settings", () => {
    const c = slipContent({
      ...base,
      footerKind: "PARA103",
      officeClosingTime: "16:30",
    });
    expect(c.footer).toContain("after 4:30 p.m.");
    expect(c.footer).not.toContain("thirty (30) days");
  });
});
