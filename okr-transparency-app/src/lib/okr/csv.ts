import { requiredHeaders, type OkrHeader } from "./types";

export function parseCsv(csvText: string): Array<Record<OkrHeader, string>> {
  const rows = readCsvRows(csvText.trim());
  if (rows.length === 0) return [];

  const headers = rows[0].map((header) => header.trim());
  const missingHeaders = requiredHeaders.filter((header) => !headers.includes(header));
  if (missingHeaders.length > 0) {
    throw new Error(`Missing required headers: ${missingHeaders.join(", ")}`);
  }

  return rows.slice(1).filter((row) => row.some(Boolean)).map((row) => {
    const item = {} as Record<OkrHeader, string>;
    for (const header of requiredHeaders) {
      const index = headers.indexOf(header);
      item[header] = (row[index] ?? "").trim();
    }
    return item;
  });
}

function readCsvRows(input: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    const next = input[index + 1];

    if (char === '"' && inQuotes && next === '"') {
      field += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(field);
      field = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      continue;
    }

    field += char;
  }

  row.push(field);
  rows.push(row);
  return rows;
}
