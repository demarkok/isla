# A rule with four variables takes n^4 

`slow.coln` has one rule, which finds paths of three edges:

```
p-def : (x y z w : G.V) -> G.e x y -> G.e y z -> G.e z w -> p x w
```

`slow.mjs N` builds a graph with N vertices and only three edges, `0 -> 1 -> 2 -> 3`.
The script prints the time of the commit.

## Run

Build the parent directory first (see `../README.md`). Then, in this directory:

```
CLI=$(cd ../coln && cabal list-bin coln-cli)
$CLI generate-ts slow.coln -o .                   # Slow.ts
$CLI generate-ir slow.coln -o .                   # Slow.json
npx tsc --module nodenext --target es2022 Slow.ts # Slow.js
node slow.mjs 20
```

## Result

| vertices | commit |
|---|---|
| 20 | 0.2 s |
| 30 | 1.1 s |
| 40 | 3.6 s |
| 60 | 18 s |

