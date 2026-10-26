// Gives the integration tests a fresh, migrated local *_test database
// (DATABASE_URL_TEST, or the local test cluster on port 5444).
import "dotenv/config";
import type { TestProject } from "vitest/node";
import { freshDatabase } from "../../scripts/fresh-db";
import { localUrl } from "../../scripts/pg-cluster";

declare module "vitest" {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}

export default async function setup(project: TestProject) {
  const url = process.env.DATABASE_URL_TEST || localUrl("test");
  const db = await freshDatabase("test", url);
  project.provide("databaseUrl", url);
  return db.stop;
}
