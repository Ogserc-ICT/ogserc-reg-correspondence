import { describe, expect, it } from "vitest";
import { isEmailAddress, normaliseEmails } from "./emails";

describe("normaliseEmails (C1)", () => {
  it("splits, trims, lower-cases and dedupes", () => {
    expect(
      normaliseEmails(" IT@ogserc.org.ng; it@OGSERC.org.ng ,a@b.ng\nc@d.ng"),
    ).toEqual({
      emails: ["it@ogserc.org.ng", "a@b.ng", "c@d.ng"],
      invalid: [],
    });
  });

  it("accepts an array and reports entries that are not addresses", () => {
    expect(normaliseEmails(["a@b.ng", "not-an-address", "x@y"])).toEqual({
      emails: ["a@b.ng"],
      invalid: ["not-an-address", "x@y"],
    });
  });

  it("treats blank input as no addresses", () => {
    expect(normaliseEmails("")).toEqual({ emails: [], invalid: [] });
    expect(normaliseEmails([])).toEqual({ emails: [], invalid: [] });
  });

  it("checks single addresses", () => {
    expect(isEmailAddress("empr@ogserc.org.ng")).toBe(true);
    expect(isEmailAddress("a b@c.ng")).toBe(false);
  });
});
