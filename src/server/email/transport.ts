// Email provider interface (SPEC-v2 C6, Q-V2-1). Until the Commission picks a
// provider, the only transport is "dev", which writes each message as an .eml
// file under EMAIL_DEV_DIR and is refused in production. With no transport
// configured, sends fail, are recorded in the EmailLog and are retried by the
// email-retry job.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export type MailAttachment = {
  filename: string;
  contentType: string;
  content: Uint8Array;
};

export type MailMessage = {
  to: string[];
  cc: string[];
  subject: string;
  /** Plain text, CRLF line ends. */
  body: string;
  attachments: MailAttachment[];
};

export interface MailTransport {
  readonly name: string;
  /** Resolves when the provider has accepted the message; throws otherwise. */
  send(message: MailMessage): Promise<{ id: string }>;
}

export const NO_TRANSPORT = "no email provider is set up (EMAIL_TRANSPORT)";

const b64 = (bytes: Uint8Array | string) =>
  Buffer.from(bytes).toString("base64").replace(/.{76}/g, "$&\r\n");

/** RFC 2047 for non-ASCII header text. */
const header = (s: string) =>
  /^[\x20-\x7e]*$/.test(s)
    ? s
    : `=?UTF-8?B?${Buffer.from(s).toString("base64")}?=`;

/** The message as a MIME document (what a real provider would send). */
export function toEml(m: MailMessage, from: string, date: Date): string {
  const boundary = `ogserc-${date.getTime().toString(36)}`;
  const lines = [
    `From: ${from}`,
    `To: ${m.to.join(", ")}`,
    ...(m.cc.length ? [`Cc: ${m.cc.join(", ")}`] : []),
    `Subject: ${header(m.subject)}`,
    `Date: ${date.toUTCString()}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: base64",
    "",
    b64(m.body),
  ];
  for (const a of m.attachments)
    lines.push(
      `--${boundary}`,
      `Content-Type: ${a.contentType}; name="${a.filename}"`,
      `Content-Disposition: attachment; filename="${a.filename}"`,
      "Content-Transfer-Encoding: base64",
      "",
      b64(a.content),
    );
  lines.push(`--${boundary}--`, "");
  return lines.join("\r\n");
}

/** Writes each message to EMAIL_DEV_DIR (default .data/mail). Dev and test only. */
export function devTransport(
  dir: string,
  from = "registry@localhost",
): MailTransport {
  let n = 0;
  return {
    name: "dev",
    async send(m) {
      await mkdir(dir, { recursive: true });
      const now = new Date();
      const slug = m.subject
        .replace(/[^A-Za-z0-9]+/g, "-")
        .slice(0, 60)
        .replace(/-+$/, "");
      const id = `${now.toISOString().replace(/[:.]/g, "-")}-${++n}-${slug}.eml`;
      await writeFile(path.join(dir, id), toEml(m, from, now));
      return { id };
    },
  };
}

let override: MailTransport | null | undefined;

/** Tests swap the transport (undefined = back to the environment's). */
export function setMailTransportForTests(t: MailTransport | null | undefined) {
  override = t;
}

/** The configured transport, or null when none is set up. */
export function mailTransport(
  env: NodeJS.ProcessEnv = process.env,
): MailTransport | null {
  if (override !== undefined) return override;
  const kind = env.EMAIL_TRANSPORT?.trim().toLowerCase();
  if (!kind) return null;
  if (kind === "dev") {
    if (env.NODE_ENV === "production") return null; // refused (startup check)
    return devTransport(
      path.resolve(env.EMAIL_DEV_DIR?.trim() || ".data/mail"),
      env.EMAIL_FROM?.trim() || undefined,
    );
  }
  return null;
}

/** For the startup check and the settings screen. */
export function transportProblem(env: NodeJS.ProcessEnv): string | null {
  const kind = env.EMAIL_TRANSPORT?.trim().toLowerCase();
  if (!kind) return null;
  if (kind !== "dev") return `EMAIL_TRANSPORT "${kind}" is not supported.`;
  if (env.NODE_ENV === "production")
    return "EMAIL_TRANSPORT=dev writes emails to files and must not be used in production.";
  return null;
}
