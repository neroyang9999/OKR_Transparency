import { promises as fs } from "node:fs";
import path from "node:path";

const write = process.argv.includes("--write");
const dataDir = path.join(process.cwd(), "data");
const files = ["okr-snapshot.json", "okr-admin-rollback-snapshot.json", "okr-period-snapshots.json", "okr-snapshot-versions.json"];
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupDir = path.join(dataDir, "repair-backups", `alignment-${stamp}`);
let total = 0;

for (const fileName of files) {
  const filePath = path.join(dataDir, fileName);
  let source;
  try {
    source = await fs.readFile(filePath, "utf8");
  } catch {
    continue;
  }
  const parsed = JSON.parse(source);
  const groups = Array.isArray(parsed.records)
    ? [parsed.records]
    : Array.isArray(parsed.periods)
      ? parsed.periods.map((period) => period.records).filter(Array.isArray)
      : Array.isArray(parsed.versions)
        ? parsed.versions.map((version) => version.records).filter(Array.isArray)
        : [];
  let migrated = 0;
  for (const records of groups) {
    for (const record of records) {
      if (record.kr || !record.parent_id) continue;
      record.aligned_to_id ||= record.parent_id;
      record.parent_id = "";
      migrated += 1;
    }
  }
  total += migrated;
  if (write && migrated > 0) {
    await fs.mkdir(backupDir, { recursive: true });
    await fs.writeFile(path.join(backupDir, fileName), source, "utf8");
    await fs.writeFile(filePath, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
  }
  console.log(`${fileName}: ${migrated} alignment edge(s)${write && migrated > 0 ? " written" : ""}`);
}

console.log(`Total: ${total}.${write ? ` Backup: ${backupDir}` : " Run with --write to apply."}`);
