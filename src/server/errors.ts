// Errors the server layer throws; pages and actions turn them into a 403 or a
// message on screen.
import { can, type Capability, type Principal } from "@/domain/permissions";

export class ForbiddenError extends Error {
  constructor(message = "You don't have permission to do that.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/** A rule broken by the input; the message is shown to the user as it is. */
export class ValidationError extends Error {
  constructor(public readonly problems: string[]) {
    super(problems.join(" "));
    this.name = "ValidationError";
  }
}

export function assertCan(
  user: Principal | null,
  cap: Capability,
): asserts user is Principal {
  if (!can(user, cap)) throw new ForbiddenError();
}
