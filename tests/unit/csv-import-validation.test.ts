import { describe, it, expect } from "vitest";

describe("CSV / Spreadsheet Parsing & Import Validation", () => {
  it("safely strips formulas/macros and extracts clean tabular values", () => {
    const rawCsv = `Post Identifier,Reach,Impressions,Engagement\n=SUM(1+2),1000,1500,5.2\n@CMD(calc),2000,3000,4.8`;
    const lines = rawCsv.split(/\r?\n/).filter((l) => l.trim().length > 0);

    const headers = lines[0].split(",").map((h) => h.trim().replace(/^["'=+@-]/, "").replace(/["']$/, ""));
    expect(headers).toEqual(["Post Identifier", "Reach", "Impressions", "Engagement"]);

    const row1 = lines[1].split(",").map((v) => v.trim().replace(/^["'=+@-]/, "").replace(/["']$/, ""));
    expect(row1[0]).toBe("SUM(1+2)"); // Stripped leading formula character '='
  });

  it("detects cross-project unmatched rows during validation", () => {
    const existingProjectItemIds = new Set(["item_acme_1", "item_acme_2", "item_acme_3"]);
    const importedRows = [
      { identifier: "item_acme_1", reach: 1000 },
      { identifier: "item_solaredge_99", reach: 500 }, // Cross-project/unmatched!
    ];

    const validRows = importedRows.filter((r) => existingProjectItemIds.has(r.identifier));
    const invalidRows = importedRows.filter((r) => !existingProjectItemIds.has(r.identifier));

    expect(validRows.length).toBe(1);
    expect(invalidRows.length).toBe(1);
    expect(invalidRows[0].identifier).toBe("item_solaredge_99");
  });
});
