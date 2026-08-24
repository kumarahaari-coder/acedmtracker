import { describe, it, expect } from "vitest";
import { parseCSV, parseXLSX } from "@/lib/spreadsheet";
import * as XLSX from "xlsx";

describe("Spreadsheet Parsing Suite (CSV & XLSX)", () => {
  it("correctly parses standard and complex CSV with quoted commas and escaped quotes", () => {
    const csvContent = `Post URL,Reach,Impressions,Caption,Engagement\nhttps://instagram.com/p/123,12000,18000,"Tips for Doctors, Clinics, and Staff",4.8\nhttps://instagram.com/p/456,8500,12000,"The ""Ultimate"" Guide to Patient Retention",5.2`;

    const { headers, rows } = parseCSV(csvContent);

    expect(headers).toEqual(["Post URL", "Reach", "Impressions", "Caption", "Engagement"]);
    expect(rows.length).toBe(2);
    expect(rows[0]["Caption"]).toBe("Tips for Doctors, Clinics, and Staff");
    expect(rows[0]["Reach"]).toBe("12000");
    expect(rows[1]["Caption"]).toBe('The "Ultimate" Guide to Patient Retention');
    expect(rows[1]["Engagement"]).toBe("5.2");
  });

  it("sanitizes dangerous spreadsheet formulas in CSV values", () => {
    const maliciousCsv = `Post URL,Reach,FormulaField\nhttps://instagram.com/p/123,12000,=cmd|' /C calc'!A0\nhttps://instagram.com/p/456,8500,+SUM(1,2)\nhttps://instagram.com/p/789,9000,@malicious_export`;

    const { rows } = parseCSV(maliciousCsv);

    expect(rows[0]["FormulaField"].startsWith("=")).toBe(false);
    expect(rows[1]["FormulaField"].startsWith("+")).toBe(false);
    expect(rows[2]["FormulaField"].startsWith("@")).toBe(false);
  });

  it("correctly parses binary XLSX workbook with multiple columns and data rows", () => {
    // Generate an in-memory binary XLSX workbook
    const worksheetData = [
      ["Post URL", "Reach", "Impressions", "Engagement Rate", "Revenue"],
      ["https://instagram.com/p/C9x81aBqMock", 14500, 21000, 6.5, 66000],
      ["https://linkedin.com/feed/update/urn:li:activity:982317", 8900, 14200, 4.2, 45000],
      ["https://instagram.com/p/C9x81aBqDocInt", 22000, 31000, 7.8, 120000],
    ];

    const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Analytics");

    const arrayBuffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });

    const { headers, rows } = parseXLSX(arrayBuffer);

    expect(headers).toEqual(["Post URL", "Reach", "Impressions", "Engagement Rate", "Revenue"]);
    expect(rows.length).toBe(3);
    expect(rows[0]["Post URL"]).toBe("https://instagram.com/p/C9x81aBqMock");
    expect(rows[0]["Reach"]).toBe("14500");
    expect(rows[0]["Revenue"]).toBe("66000");
    expect(rows[1]["Engagement Rate"]).toBe("4.2");
  });
});
