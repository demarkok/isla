import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import * as path from "node:path";
import * as runtime from "@coln-project/interface";
import { NodeStore } from "@coln-project/node-runtime/dist/src/typescript/index.js";
import { createRealm } from "./AArch64.js";

const [factsDir, outDir] = process.argv.slice(2)

// Create the store and the realm
const ir = readFileSync(new URL("./AArch64.json", import.meta.url), "utf8")
const store = new runtime.ManagedStore(new NodeStore({ ir, coln_source: "", realm_name: "AArch64" }))
const realm = new (createRealm(runtime))(store)
const root = realm.root
console.log(`performance: ${performance.now().toFixed(0)} ms`)

// Read facts
const facts = new Map<string, string[][]>()
for (const f of readdirSync(factsDir)) {
  if (!f.endsWith(".facts")) continue
  const rows = readFileSync(path.join(factsDir, f), "utf8")
    .split("\n")
    .filter(l => l.length > 0)
    .map(l => l.split("\t"))
  facts.set(path.basename(f, ".facts").replace(/-/g, "_"), rows)
}

console.log(`performance (after read facts): ${performance.now().toFixed(0)} ms`)

// Add facts to the store
store.startTransaction()

const eventIds = new Map<string, runtime.RowId<"root.Ev">>()
function eventId(name: string): runtime.RowId<"root.Ev"> {
  let e = eventIds.get(name)
  if (e === undefined) {
    e = root.Ev.add()
    eventIds.set(name, e)
  }
  return e
}

for (const [name, rows] of facts) {
  if (!(name in root)) {
    console.error(`engine: no table root.${name}, ${rows.length} rows ignored`)
    continue
  }
  for (const row of rows) {
    let t = root[name] // curried table
    for (const n of row) {
        t = t(eventId(n));
    }
    t.makeTrue()
  }
}

store.endTransaction()
console.log(`engine read: ${eventIds.size} events, ${facts.size} tables, ${[...facts].reduce((acc, [_, rows]) => acc + rows.length, 0)} facts`)
console.log(`performance after transaction 1: ${performance.now().toFixed(0)} ms`)

// Convention: a proposition named check-false-NAME in the realm is a check, and the candidate
// is consistent iff every such proposition is false. Each one is written to OUT_DIR/NAME.csv:
// an empty file if it is false, the line "violated" if it is true.
// (isla takes a check as passed iff its file is blank.)
const CHECK_PREFIX = "check_false_" // generate-ts turns "-" into "_"

mkdirSync(outDir, { recursive: true })
store.startTransaction()
for (const [field, prop] of Object.entries(realm)) {
  if (!field.startsWith(CHECK_PREFIX)) continue
  const violated = (prop as runtime.Prop).isTrue()
  const name = `${field.slice(CHECK_PREFIX.length)}.csv`
  writeFileSync(path.join(outDir, name), violated ? "violated\n" : "")
  console.log(`engine wrote: ${name}, ${violated ? "violated" : "empty"}`)
}
store.endTransaction()
console.log(`performance after transaction 2: ${performance.now().toFixed(0)} ms`)