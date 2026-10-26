// Temporary passwords for new users and resets: four groups of four from an
// alphabet without look-alike characters (no 0/O, 1/l/I), e.g. "k7Pm-x9Qd-…".
import { randomInt } from "node:crypto";

const LETTERS = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ";
const DIGITS = "23456789";

export function temporaryPassword(): string {
  const all = LETTERS + DIGITS;
  const groups = Array.from({ length: 4 }, () =>
    Array.from({ length: 4 }, () => all[randomInt(all.length)]).join(""),
  );
  // Guarantee a digit so the password always passes the mixing rule.
  groups[3] = groups[3].slice(0, 3) + DIGITS[randomInt(DIGITS.length)];
  return groups.join("-");
}
