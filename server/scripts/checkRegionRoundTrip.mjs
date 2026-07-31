// Assert that re-serializing every RegionData file reproduces it byte for byte, which is
// what makes a full-file rewrite safe: without it, editing one citizen silently reformats
// every other entry in the file.
//
// Compares against git HEAD rather than the working tree. HEAD is the canonical reference -
// those files were written by the Java plugin's own Gson save path - whereas the working
// tree may hold in-progress edits, including ones made by older versions of this tool that
// had the float-formatting bug this check now guards against.
//
// Content is read via `git show`, which yields the stored LF form directly and sidesteps
// the plugin repo's core.autocrlf=true CRLF checkout.
import { execFileSync } from "child_process";
import path from "path";
import { serializeRegionFile } from "../src/regionRepo.ts";
import dotenv from "dotenv";
dotenv.config({ path: new URL("../../.env", import.meta.url) });

const repo = process.env.CITIZENS_REPO_PATH;
const relDir = "src/main/resources/RegionData";

const git = (...args) => execFileSync("git", ["-C", repo, ...args], { encoding: "utf-8", maxBuffer: 64 * 1024 * 1024 });

const files = git("ls-tree", "--name-only", "HEAD", `${relDir}/`)
  .split("\n")
  .filter((l) => l.endsWith(".json"))
  .map((l) => path.posix.basename(l));

let same = 0;
const diffs = [];
for (const f of files) {
  const original = git("show", `HEAD:${relDir}/${f}`);
  const parsed = JSON.parse(original);
  const rewritten = serializeRegionFile(parsed.regionId, parsed);
  if (rewritten === original) {
    same++;
  } else {
    const o = original.split("\n");
    const r = rewritten.split("\n");
    const at = o.findIndex((l, i) => l !== r[i]);
    diffs.push({ f, at, was: o[at], got: r[at], lenO: o.length, lenR: r.length, original, rewritten });
  }
}

console.log(`identical: ${same}/${files.length}`);
for (const d of diffs.slice(0, 12)) {
  console.log(`  ${d.f}: first diff at line ${d.at} (${d.lenO} -> ${d.lenR} lines)`);
  console.log(`     was: ${JSON.stringify(d.was)}`);
  console.log(`     got: ${JSON.stringify(d.got)}`);
}

// Some checked-in files carry a literal apostrophe where Gson's default htmlSafe mode
// writes ' - the repo is genuinely inconsistent about it, and 12853.json manages to
// use both forms within a single file. This tool follows Gson, so those files normalize
// the first time anything saves them. Both forms are valid JSON and parse identically.
//
// Checked as a *property* rather than an allowlist of filenames: an allowlist would encode
// whichever files happen to be edited in the working tree today. A diff is acceptable only
// if it disappears once both sides are compared with apostrophes written the same way -
// anything else means the serializer has genuinely drifted from Gson's output.
const sameIgnoringApostropheEscaping = (a, b) =>
  a.split("\\u0027").join("'") === b.split("\\u0027").join("'");

const unexpected = diffs.filter((d) => !sameIgnoringApostropheEscaping(d.original, d.rewritten));
if (unexpected.length > 0) {
  console.error(`\nFAIL: ${unexpected.length} file(s) differ beyond apostrophe escaping: ${unexpected.map((d) => d.f).join(", ")}`);
  process.exit(1);
}
console.log(`\nOK - ${diffs.length} file(s) differ on apostrophe escaping only; no structural drift.`);
