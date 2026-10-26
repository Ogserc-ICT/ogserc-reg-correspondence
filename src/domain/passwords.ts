// Password rules for staff accounts. Length matters more than character
// classes; the extra checks stop the obvious choices.

export const PASSWORD_MIN = 12;
export const PASSWORD_MAX = 128;

/** Failed sign-ins in a row before a temporary lockout. */
export const MAX_FAILED_LOGINS = 5;
export const LOCKOUT_MINUTES = 15;

const COMMON = [
  "password",
  "123456",
  "qwerty",
  "letmein",
  "welcome",
  "ogserc",
  "registry",
  "abeokuta",
];

/** Every rule the password breaks; empty when it is acceptable. */
export function passwordProblems(
  password: string,
  user: { email: string; name: string },
): string[] {
  const problems: string[] = [];
  const lower = password.toLowerCase();
  if (password.length < PASSWORD_MIN)
    problems.push(`Use at least ${PASSWORD_MIN} characters.`);
  if (password.length > PASSWORD_MAX)
    problems.push(`Use at most ${PASSWORD_MAX} characters.`);
  if (!/[a-z]/i.test(password) || !/[^a-z]/i.test(password))
    problems.push("Mix letters with numbers, spaces or symbols.");
  if (/^(.)\1+$/.test(password)) problems.push("Don't repeat one character.");
  const local = user.email.split("@")[0].toLowerCase();
  const names = user.name
    .toLowerCase()
    .split(/\s+/)
    .filter((n) => n.length >= 3);
  if (
    (local.length >= 3 && lower.includes(local)) ||
    names.some((n) => lower.includes(n))
  )
    problems.push("Don't use your name or email address.");
  if (COMMON.some((w) => lower.includes(w)))
    problems.push("Avoid common words such as “password” or “ogserc”.");
  return problems;
}

/** After a failed sign-in: the new count, and when the lockout ends if it starts now. */
export function afterFailedLogin(
  failedLogins: number,
  now: Date,
): { failedLogins: number; lockedUntil: Date | null } {
  const n = failedLogins + 1;
  return n >= MAX_FAILED_LOGINS
    ? {
        failedLogins: 0,
        lockedUntil: new Date(now.getTime() + LOCKOUT_MINUTES * 60_000),
      }
    : { failedLogins: n, lockedUntil: null };
}

export function isLocked(lockedUntil: Date | null, now: Date): boolean {
  return lockedUntil !== null && lockedUntil.getTime() > now.getTime();
}
