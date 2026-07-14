import { promises as fs } from "node:fs";
import path from "node:path";

const write = process.argv.includes("--write");
const dataDir = path.join(process.cwd(), "data");
const files = [
  "okr-snapshot.json",
  "okr-admin-rollback-snapshot.json",
  "okr-period-snapshots.json"
];
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupDir = path.join(dataDir, "repair-backups", stamp);

let totalRepairs = 0;

for (const fileName of files) {
  const filePath = path.join(dataDir, fileName);
  const source = await fs.readFile(filePath, "utf8");
  const parsed = JSON.parse(source);
  const recordGroups = Array.isArray(parsed.records)
    ? [parsed.records]
    : Array.isArray(parsed.periods)
      ? parsed.periods.map((period) => period.records).filter(Array.isArray)
      : [];

  let fileRepairs = 0;
  for (const records of recordGroups) fileRepairs += repairRecords(records);
  totalRepairs += fileRepairs;

  if (fileRepairs > 0 && write) {
    await fs.mkdir(backupDir, { recursive: true });
    await fs.writeFile(path.join(backupDir, fileName), source, "utf8");
    if (parsed.meta) {
      parsed.meta.rowCount = parsed.records.length;
      parsed.meta.message = `${parsed.meta.message}; repaired ${fileRepairs} orphaned alignment references`;
    }
    await fs.writeFile(filePath, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
  }

  console.log(`${fileName}: ${fileRepairs} repair(s)${write && fileRepairs > 0 ? " written" : ""}`);
}

console.log(`Total: ${totalRepairs} repair(s).${write ? ` Backup: ${backupDir}` : " Run with --write to apply."}`);

function repairRecords(records) {
  const byId = new Map(records.map((record) => [record.okr_id, record]));
  let repairs = 0;

  for (const record of [...records]) {
    if (!record.parent_id || byId.has(record.parent_id)) continue;

    if (!record.kr) {
      record.parent_id = "";
      repairs += 1;
      continue;
    }

    const objectiveId = uniqueId(`RECOVERED-${slug(record.team)}-${slug(record.okr_id)}-O`, byId);
    const objective = {
      ...record,
      okr_id: objectiveId,
      parent_id: "",
      objective: record.objective || `Recovered Objective for ${record.okr_id}`,
      kr: "",
      baseline: "",
      target: "",
      actual: "",
      source_doc_url: record.source_doc_url || "recovered-legacy-structure"
    };
    record.parent_id = objectiveId;
    records.push(objective);
    byId.set(objectiveId, objective);
    repairs += 1;
  }

  return repairs;
}

function uniqueId(base, byId) {
  let candidate = base;
  let suffix = 2;
  while (byId.has(candidate)) candidate = `${base}-${suffix++}`;
  return candidate;
}

function slug(value) {
  return String(value || "OKR").toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "") || "OKR";
}
