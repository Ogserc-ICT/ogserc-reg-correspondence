// What the acknowledgement slip says (TEMPLATES §1, SPEC §8.1, §9 R13). Pure:
// the PDF code only lays this out.
import type { IsoDate } from "./calendar";
import {
  BLANK,
  formatClockTime,
  formatDate,
  formatDateTime,
  formatNaira,
  formatYesNo,
} from "./format";

export const COPY_LABELS = [
  "REGISTRANT'S / SENDER'S COPY",
  "REGISTRY COPY",
] as const;
export const SLIP_TITLE = "ACKNOWLEDGEMENT OF RECEIPT";
export const COMMISSION = "OGUN STATE ELECTRICITY REGULATORY COMMISSION";
export const HEADING_PARA103 =
  "Paragraph 10(3), OGSERC Order on Commencement of Operations and Registration of Licensees and Electricity Operators, 2026";
export const HEADING_GENERAL =
  "Correspondence received by the Registry of the Ogun State Electricity Regulatory Commission";

export type SlipFooterKind = "REGISTRATION" | "PARA103" | "GENERAL";

export type SlipInput = {
  number: string;
  receivedAt: Date;
  deemedReceiptDate: IsoDate;
  mode: string;
  orderRef: string | null;
  type: string;
  relatedOgsercNo: string | null;
  sender: string;
  senderRef: string | null;
  subject: string;
  deliveredBy: string | null;
  volumes: number | null;
  schedule2DocsAttached: number | null;
  feeEvidenceAttached: boolean | null;
  paymentRef: string | null;
  amountShownKobo: bigint | null;
  receivedBy: string;
  forwardedTo: string;
  /** Snapshotted from the type when the item was saved. */
  para103SlipWording: boolean;
  footerKind: SlipFooterKind;
  footers: { registration: string; para103: string; general: string };
  officeClosingTime: string;
  secretaryName: string;
  registryAddress: string;
};

export type SlipContent = {
  commission: string;
  address: string;
  title: string;
  heading: string;
  number: string;
  /** Lines of one or two [label, value] pairs, in template order. */
  lines: [string, string][][];
  footer: string;
  signatureLine: string;
  forSecretary: string;
};

const text = (v: string | null | undefined) => (v && v.trim() ? v : BLANK);
const num = (v: number | null) => (v === null ? BLANK : String(v));

export function slipContent(i: SlipInput): SlipContent {
  const template =
    i.footerKind === "REGISTRATION"
      ? i.footers.registration
      : i.footerKind === "PARA103"
        ? i.footers.para103
        : i.footers.general;
  return {
    commission: COMMISSION,
    address: i.registryAddress,
    title: SLIP_TITLE,
    heading: i.para103SlipWording ? HEADING_PARA103 : HEADING_GENERAL,
    number: i.number,
    lines: [
      [
        ["Date & time received", formatDateTime(i.receivedAt)],
        ["Deemed receipt date", formatDate(i.deemedReceiptDate)],
      ],
      [
        ["Mode of receipt", i.mode],
        ["Order reference", text(i.orderRef)],
      ],
      [
        ["Type", i.type],
        ["Related OGSERC No.", text(i.relatedOgsercNo)],
      ],
      [
        ["Sender", i.sender],
        ["Sender's ref. no.", text(i.senderRef)],
      ],
      [["Subject", i.subject]],
      [
        ["Delivered / sent by", text(i.deliveredBy)],
        ["Files / volumes", num(i.volumes)],
      ],
      [
        ["Schedule 2 documents", num(i.schedule2DocsAttached)],
        ["Fee evidence attached", formatYesNo(i.feeEvidenceAttached)],
      ],
      [
        ["Payment reference", text(i.paymentRef)],
        ["Amount shown (₦)", formatNaira(i.amountShownKobo)],
      ],
      [
        ["Received by", i.receivedBy],
        ["Forwarded to", i.forwardedTo],
      ],
    ],
    footer: template.replaceAll(
      "{closingTime}",
      formatClockTime(i.officeClosingTime),
    ),
    signatureLine: "Registry officer's signature: ______________________",
    forSecretary: `For the Secretary to the Commission (${text(i.secretaryName)})`,
  };
}
