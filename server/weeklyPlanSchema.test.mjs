import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const schemaPaths = [
  resolve(process.cwd(), "server/weekly-plan.schema.json"),
  resolve(process.cwd(), "server/plan-adjustment.schema.json"),
];

function collectUnsupportedKeywords(value, path = "$") {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => collectUnsupportedKeywords(item, `${path}[${index}]`));
  }
  if (!value || typeof value !== "object") return [];

  return Object.entries(value).flatMap(([key, child]) => [
    ...(key === "uniqueItems" ? [`${path}.${key}`] : []),
    ...collectUnsupportedKeywords(child, `${path}.${key}`),
  ]);
}

describe("weekly-plan Codex output schema", () => {
  it("does not use response-format keywords rejected by Codex", async () => {
    for (const schemaPath of schemaPaths) {
      const schema = JSON.parse(await readFile(schemaPath, "utf8"));
      expect(collectUnsupportedKeywords(schema)).toEqual([]);
    }
  });
});
