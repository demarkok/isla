// usage: node slow.mjs N      adds N vertices and three edges, then times the commit
import { readFileSync } from "node:fs";
import * as runtime from "@coln-project/interface";
import { NodeStore } from "@coln-project/node-runtime/dist/src/typescript/index.js";
import { createRealm } from "./Slow.js";

const n = Number(process.argv[2]);
const ir = readFileSync(new URL("./Slow.json", import.meta.url), "utf8");
const store = new runtime.ManagedStore(new NodeStore({ ir, coln_source: "", realm_name: "Slow" }));
const root = new (createRealm(runtime))(store).root;

store.startTransaction();
const v = Array.from({ length: n }, () => root.V.add());
for (let i = 0; i < 3; i++) root.e(v[i])(v[i + 1]).makeTrue(); // v0 -> v1 -> v2 -> v3, the rest isolated
const t = performance.now();
store.endTransaction();
console.log(`${n} vertices, 3 edges: commit ${(performance.now() - t).toFixed(0)} ms`);
