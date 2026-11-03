// V1: the v2 reference data as seeded on a fresh database (C1, C2, C7, C8).
import { beforeAll, describe, expect, it } from "vitest";
import { typeUnitProblems } from "@/server/reference";
import { connectTestDb, resetDb } from "./helpers";

const db = connectTestDb();

beforeAll(async () => {
  await resetDb(db);
});

describe("v2 seed", () => {
  it("has 5 divisions and 30 units, each unit in a division with its group", async () => {
    expect(await db.division.count()).toBe(5);
    const units = await db.unit.findMany({ include: { division: true } });
    expect(units).toHaveLength(30);
    expect(units.every((u) => u.division && u.unitGroup)).toBe(true);
    const frontDesk = units.find((u) => u.name === "Front Desk")!;
    expect(frontDesk.division!.name).toBe("Financial Management Services");
    expect(frontDesk.unitGroup).toBe("HR and Admin");
  });

  it("seeds only the email addresses the workbook has (Q-V2-6)", async () => {
    const withUnitEmail = await db.unit.findMany({
      where: { NOT: { emails: { isEmpty: true } } },
    });
    expect(withUnitEmail.map((u) => [u.name, u.emails])).toEqual([
      ["ICT unit", ["it@ogserc.org.ng"]],
    ]);
    const withDivEmail = await db.division.findMany({
      where: { NOT: { emails: { isEmpty: true } } },
      orderBy: { sortOrder: "asc" },
    });
    expect(withDivEmail.map((d) => [d.name, d.emails])).toEqual([
      ["Engineering Services", ["engineeringstandards@ogserc.org.ng"]],
      ["Electricity Market, Planning and Research", ["empr@ogserc.org.ng"]],
    ]);
  });

  it("has 32 incoming types, the two broken defaults replaced, nothing invented (C2, V13)", async () => {
    expect(await db.incomingType.count()).toBe(32);
    const unit = async (type: string) =>
      (
        await db.incomingType.findUniqueOrThrow({
          where: { name: type },
          include: { defaultUnit: true },
        })
      ).defaultUnit.name;
    expect(await unit("Licensee returns / performance report")).toBe(
      "Performance Monitoring unit",
    );
    expect(await unit("Incident / outage report")).toBe(
      "Occupational Health, Safety and Performance Analysis unit",
    );
    expect(await unit("Consumer petition")).toBe("Customer Complaints");
    expect(await unit("Public representation")).toBe(
      "Public Affairs and Stakeholder unit: Communication",
    );
    expect(
      await db.unit.count({
        where: { name: { contains: "Market Analysis," } },
      }),
    ).toBe(0);
    expect(await typeUnitProblems(db)).toEqual([]);
  });

  it("gives every file class its code (C8)", async () => {
    const classes = await db.listItem.findMany({
      where: { list: "FILE_CLASS" },
      orderBy: { sortOrder: "asc" },
    });
    expect(classes.map((c) => c.code)).toEqual([
      "REG",
      "RL",
      "TM",
      "TS",
      "CA",
      "LEG",
      "FIN",
      "ADM",
      "PF",
      "GOV",
      "POL",
      "GEN",
    ]);
    expect(
      classes.find((c) => c.label === "Personnel (confidential)")!.systemKey,
    ).toBe("PERSONNEL");
  });

  it("seeds the signatory list with the Secretary as default, and no user accounts (C7)", async () => {
    const s = await db.signatory.findMany({ orderBy: { sortOrder: "asc" } });
    expect(s.map((x) => [x.name, x.designation, x.isDefault])).toEqual([
      ["Jide Onakoya", "Chairman", false],
      ["Oluwatoyin Sonoiki", "Secretary to the Commission", true],
    ]);
    expect(await db.user.count()).toBe(0);
  });

  it("starts with acknowledgement email Off and the v2 prefixes", async () => {
    const st = await db.registrySettings.findUniqueOrThrow({
      where: { id: 1 },
    });
    expect(st).toMatchObject({
      ackEmailMode: "OFF",
      ackEmailCc: "",
      frontDeskPrefix: "OGSERC/FD",
      filePrefix: "OGSERC",
      fileRefSerialDigits: 3,
    });
  });

  it("allows only one default signatory", async () => {
    await expect(
      db.signatory.create({
        data: { name: "X", designation: "Y", isDefault: true },
      }),
    ).rejects.toThrow();
  });
});
