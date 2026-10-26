import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  prettier,
  {
    // src/domain is pure: no DB, no framework, no clock (CLAUDE.md, STACK §1).
    files: ["src/domain/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["next", "next/*", "react", "react-dom"],
              message: "src/domain must not import framework code.",
            },
            {
              group: ["@prisma/*", "@/generated/*", "pg", "@/server/*"],
              message: "src/domain must not touch the database.",
            },
          ],
        },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: "MemberExpression[object.name='Date'][property.name='now']",
          message: "Pass `now` in; never read the clock in src/domain.",
        },
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message: "Pass `now` in; never read the clock in src/domain.",
        },
      ],
    },
  },
  globalIgnores([
    ".next/**",
    ".next-e2e/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "src/generated/**",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
    ".pgdata/**",
  ]),
]);

export default eslintConfig;
