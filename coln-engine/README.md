# Coln as the memory-model checker for isla-axiomatic

The same experiment as [`../souffle-engine`](../souffle-engine/README.md), with
Coln in place of Souffle. That Souffle README explains the
scheme: isla symbolically executes the litmus tests, producing execution candidates (event graphs) and an 
SMT problem that restricts this graph. These restrictions do not include the memory model axioms, so when z3 solves this SMT, it proposes `rf` and `co` which might be not memory-model-consistent, isla writes the execution (with proposed `rf` and `co`) as fact files, and the engine (Coln) says whether the memory model accepts it.

- `aarch64-offline.coln` is the memory model constraints (carved out from `aarch64.cat`) encoded in Coln. 
- `engine.ts` is the driver that starts the coln store, loads the schema (aarch64-offline.coln), reads and loads the facts, and writes one `.csv` file per *check*. 

isla runs the engine as `node dist/engine.js FACTS_DIR OUT_DIR` and assumes the following interface:
- the facts are `*.facts` files in `FACTS_DIR`. 
- it assumes that every column of every table in those files is an event
- the *checks* are the propositions whose names start with `check-false-` in the Coln model. For each of them the engine writes `OUT_DIR/NAME.csv`: an empty file if the proposition is false, the line `violated` if it is true
- the execution is consistent iff all the `.csv` files are empty.

## Build

You need Node 24, pnpm, [just](https://github.com/casey/just), GHC with cabal, and Rust.

Build Coln and the Typescript interface: 
```
cabal build coln-cli
CLI=$(cabal list-bin coln-cli)
cd packages/coln-node-runtime
just setup build-runtime-release             # pnpm install, then a release build of the store
(cd ../coln-js-interface && mkdir -p dist && npx tsc)
mkdir -p test/bindings && $CLI generate-ts test/definitions.coln -o test/bindings/
npx tsc
```

Then:
```
ln -s /path/to/Coln coln                     # package.json finds Coln through this link
pnpm install
$CLI generate-ts aarch64-offline.coln -o .   # AArch64.ts
$CLI generate-ir aarch64-offline.coln -o .   # AArch64.json
npx tsc                                      # dist/engine.js
cp AArch64.json dist/
```

## Run

From the repository root:

```
I=./target/release/isla-axiomatic
A="-A /path/to/armv8p5.ir -C configs/armv8p5.toml --cache /tmp/isla-cache" 
C="-m souffle-engine/aarch64-facts.cat --engine coln --engine-file coln-engine/dist/engine.js"
$I $A $C souffle-engine/tests/MP+dmb.sys.toml      # forbidden
$I $A $C souffle-engine/tests/MP.toml              # allowed
```

## Memory Model Axioms
`aarch64-offline.coln` has the following:

```
realm AArch64 @ Exec
    ind def derived : Derived root := init (Derived root)
    ind def axioms : Axioms root derived := init (Axioms root derived)

    ind def check-false-external : Prop := axioms.external
    ind def check-false-internal : Prop := axioms.internal
    ind def check-false-atomic : Prop := axioms.atomic
end
```

Each of the three is a proposition that says "the axiom is violated": for example,
`axioms.external` is true iff some event is on an `ob` cycle. The driver `engine.ts`
writes one `.csv` file per `check-false-` proposition to the output directory, empty
iff the proposition is false, and isla reads every produced `.csv` and checks that
they are empty.


## Benchmarks (Claude)

Small tests, median of three runs:

| test | verdict | engine calls | Souffle | Coln |
|---|---|---|---|---|
| MP | allowed | 1 | 0.6 s | 0.8 s |
| MP+dmb.sys | forbidden | 1 | 0.6 s | 0.8 s |
| MP-all `-e` | allowed 4 of 4 | 4 | 0.7 s | 1.6 s |
| CoRR | forbidden | 2 | 0.6 s | 1.2 s |
| CoRR-ok | allowed | 1 | 0.5 s | 0.8 s |
| FORK-3 `-e` | allowed 6 of 8 | 8 | 3.3 s | 4.7 s |
| ENUM-3 `-e` | allowed 8 of 8 | 8 | 1.3 s | 2.7 s |
| MPsame-4+dmb | forbidden | 24 | 3.3 s | 8.9 s |

Scaled tests, median of two runs, with the settings of the Souffle README
(`-s 60`, the tactic, `--extra-smt uniproc.smt2`). "events" is the size of one candidate:

| test | events | verdict | engine calls | Souffle | Coln |
|---|---|---|---|---|---|
| MPn-4 | 11 | allowed | 1 | 0.8 s | 1.1 s |
| MPn-8 | 19 | allowed | 1 | 1.2 s | 2.1 s |
| MPn-16 | 35 | allowed | 1 | 3.2 s | 11.0 s |
| MPn-24 | 51 | allowed | 1 | 9.2 s | 43.7 s |
| MPsame-4 | 11 | allowed | 1 | 0.9 s | 1.3 s |
| MPsame-8 | 19 | allowed | 1 | 1.6 s | 2.5 s |
| MPsame-12 | 27 | allowed | 1 | 3.8 s | 6.8 s |
| MPsame-16 | 35 | allowed | 1 | 6.4 s | 14.0 s |
| MPfree-16 | 35 | allowed | 1 | 3.9 s | 11.6 s |
| MPfree-24 | 51 | allowed | 1 | 10.5 s | 43.9 s |
| FORK-4 | 7 | allowed 9 of 16 | 16 | 8.5 s | 11.2 s |
| FORK-6 | 9 | allowed 16 of 64 | 64 | 43.0 s | 57.3 s |
| ENUM-5 `-e` | 11 | allowed 32 of 32 | 32 | 7.6 s | 16.7 s |
| ENUM-7 `-e` | 15 | allowed 128 of 128 | 128 | 49.8 s | over 60 s |

ENUM-7 with Coln reaches the 60 s limit after 71 of the 128 calls.

One engine call alone, on a candidate saved from the test, without isla and z3:

| candidate from | events | facts | Souffle | Coln |
|---|---|---|---|---|
| MP | 5 | 34 | 0.05 s | 0.25 s |
| MPsame-4+dmb | 10 | 158 | 0.05 s | 0.32 s |
| MPn-8 | 19 | 468 | 0.05 s | 0.94 s |
| MPsame-12 | 27 | 1662 | 0.05 s | 3.0 s |
| MPn-16 | 35 | 1564 | 0.05 s | 8.1 s |
| MPsame-16 | 35 | 2884 | 0.05 s | 7.8 s |
| MPn-24 | 51 | 3300 | 0.05 s | 36.2 s |

What the numbers say:

- On small candidates a Coln call costs a fixed 0.2 s: starting Node, creating the store, and
  a 50 ms commit. A Souffle call costs 0.05 s at every size.
- On larger candidates the commit dominates, and it grows as the fourth power of the number
  of events, about 5 µs × n⁴. The number of facts does not matter: MPn-16 and MPsame-16 have
  the same 35 events, the second has almost twice the facts, and they take the same time.
- The power is the largest number of variables in a rule. The compiled rules start with one
  membership test per variable (`x ∈ Ev ∧ y ∈ Ev ∧ z ∈ Ev ∧ w ∈ Ev ∧ ...`), and the model has
  two rules with four variables, `dob-def-b2` and `bob-def-b2`. Splitting these two through
  helper relations, so that no rule has more than three variables, gives about 25 µs × n³:
  3.8 s instead of 36.2 s at 51 events.

