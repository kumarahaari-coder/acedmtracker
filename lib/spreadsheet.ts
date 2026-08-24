import * as XLSX from "xlsx";

export interface ParsedSpreadsheet {
  headers: string[];
  rows: Record<string, string>[];
}

/**
 * Robust CSV parser handling quoted strings, escaped quotes, and commas inside cells.
 */
export function parseCSV(csvText: string): ParsedSpreadsheet {
  const cleanText = csvText.replace(/^\uFEFF/, ""); // Remove BOM if present
  const lines: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = "";
  let inQuotes = false;

  for (let i = 0; i < cleanText.length; i++) {
    const char = cleanText[i];
    const nextChar = cleanText[i + 1];

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        currentCell += '"';
        i++; // skip escaped quote
      } else if (char === '"') {
        inQuotes = false;
      } else {
        currentCell += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ",") {
        currentRow.push(currentCell.trim());
        currentCell = "";
      } else if (char === "\r") {
        if (nextChar === "\n") i++;
        currentRow.push(currentCell.trim());
        if (currentRow.some((c) => c.length > 0)) {
          lines.push(currentRow);
        }
        currentRow = [];
        currentCell = "";
      } else if (char === "\n") {
        currentRow.push(currentCell.trim());
        if (currentRow.some((c) => c.length > 0)) {
          lines.push(currentRow);
        }
        currentRow = [];
        currentCell = "";
      } else {
        currentCell += char;
      }
    }
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell.trim());
    if (currentRow.some((c) => c.length > 0)) {
      lines.push(currentRow);
    }
  }

  if (lines.length === 0) {
    return { headers: [], rows: [] };
  }

  // Sanitize headers
  const rawHeaders = lines[0];
  const headers = rawHeaders.map((h, idx) => {
    let clean = h.replace(/^["'=+@-]/, "").replace(/["']$/, "").trim();
    return clean || `Column_${idx + 1}`;
  });

  const rows: Record<string, string>[] = [];
  for (let r = 1; r < lines.length; r++) {
    const lineValues = lines[r];
    const rowObj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      let val = lineValues[idx] || "";
      // Strip dangerous leading spreadsheet formula characters (=, +, -, @)
      if (val.startsWith("=") || val.startsWith("+") || val.startsWith("-") || val.startsWith("@")) {
        val = val.substring(1).trim();
      }
      rowObj[h] = val;
    });
    rows.push(rowObj);
  }

  return { headers, rows };
}

/**
 * Real XLSX / XLS Workbook parser using binary ArrayBuffer
 */
export function parseXLSX(data: ArrayBuffer | Uint8Array): ParsedSpreadsheet {
  const workbook = XLSX.read(data, { type: "array" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return { headers: [], rows: [] };

  const worksheet = workbook.Sheets[sheetName];
  const jsonData: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

  if (!jsonData || jsonData.length === 0) {
    return { headers: [], rows: [] };
  }

  const rawHeaders = (jsonData[0] || []).map((h: any) => String(h || "").trim());
  const headers = rawHeaders.map((h: string, idx: number) => {
    let clean = h.replace(/^["'=+@-]/, "").replace(/["']$/, "").trim();
    return clean || `Column_${idx + 1}`;
  });

  const rows: Record<string, string>[] = [];
  for (let r = 1; r < jsonData.length; r++) {
    const lineValues = jsonData[r] || [];
    const rowObj: Record<string, string> = {};
    headers.forEach((h: string, idx: number) => {
      let val = String(lineValues[idx] !== undefined && lineValues[idx] !== null ? lineValues[idx] : "").trim();
      if (val.startsWith("=") || val.startsWith("+") || val.startsWith("-") || val.startsWith("@")) {
        val = val.substring(1).trim();
      }
      rowObj[h] = val;
    });
    // Only push non-empty rows
    if (Object.values(rowObj).some((v) => v.length > 0)) {
      rows.push(rowObj);
    }
  }

  return { headers, rows };
}
