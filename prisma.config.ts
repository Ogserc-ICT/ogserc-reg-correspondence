// Prisma CLI settings (migrate, seed). Migrations need a direct connection:
// on Vercel + Neon, DATABASE_URL is the pooled one and DATABASE_URL_UNPOOLED
// the direct one; locally both are the same database.
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env["DATABASE_URL_UNPOOLED"] || process.env["DATABASE_URL"],
  },
});
