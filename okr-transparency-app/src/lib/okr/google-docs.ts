import { google } from "googleapis";
import type { docs_v1 } from "googleapis";
import { requiredHeaders, type OkrHeader } from "./types";

export async function readGoogleDocRows(documentId: string): Promise<Array<Record<OkrHeader, string>>> {
  const auth = getGoogleAuth();
  const docs = google.docs({ version: "v1", auth });
  const response = await docs.documents.get({ documentId });
  const tables = response.data.body?.content?.flatMap((content) => content.table ? [content.table] : []) ?? [];

  for (const table of tables) {
    const rows = table.tableRows?.map((row) =>
      row.tableCells?.map((cell) => extractCellText(cell).trim()) ?? []
    ) ?? [];
    if (rows.length === 0) continue;

    const headers = rows[0].map((header) => header.trim());
    if (requiredHeaders.every((header) => headers.includes(header))) {
      return rows.slice(1).filter((row) => row.some(Boolean)).map((row) => {
        const item = {} as Record<OkrHeader, string>;
        for (const header of requiredHeaders) {
          item[header] = row[headers.indexOf(header)]?.trim() ?? "";
        }
        return item;
      });
    }
  }

  throw new Error("No structured OKR table found in the Google Doc");
}

function getGoogleAuth() {
  const scopes = ["https://www.googleapis.com/auth/documents.readonly"];
  const serviceAccountJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

  if (serviceAccountJson) {
    return new google.auth.GoogleAuth({
      credentials: JSON.parse(serviceAccountJson),
      scopes
    });
  }

  return new google.auth.GoogleAuth({ scopes });
}

function extractCellText(cell: docs_v1.Schema$TableCell): string {
  const parts = cell.content?.flatMap((content) =>
    content.paragraph?.elements?.map((element) => element.textRun?.content ?? "") ?? []
  ) ?? [];
  return parts.join("").replace(/\n+$/g, "");
}
