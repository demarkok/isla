# Coln as the memory-model checker for isla-axiomatic

The same experiment as [`../souffle-engine`](../souffle-engine), with Coln in place of Souffle.
The scheme: isla symbolically executes the litmus tests, producing execution candidates (event graphs) and an
SMT problem that restricts this graph. These restrictions do not include the memory model axioms, so when z3 solves this SMT, it proposes `rf` and `co` which might be not memory-model-consistent, isla writes the execution (with proposed `rf` and `co`) as fact files, and the engine (Coln) says whether the memory model accepts it.

- `aarch64-facts.cat` is what is left of `aarch64.cat` for z3: the definitions of the base sets and relations, and no checks. Its `show` declarations name what isla writes as fact files. Coln has no negation, so this file also defines `nonint`, the complement of `int`.
- `aarch64-offline.coln` is the memory model constraints (carved out from `aarch64.cat`) encoded in Coln. 
- `engine.ts` is the driver that starts the coln store, loads the schema (aarch64-offline.coln), reads and loads the facts, and writes one `.csv` file per *check*. 
- `run.sh` is the command given to isla.

isla runs the engine as `coln-engine/run.sh FACTS_DIR OUT_DIR` and assumes the following interface:
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
just setup build-runtime --release           # pnpm install, then a release build of the store
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
C="-m coln-engine/aarch64-facts.cat --engine coln-engine/run.sh"
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


## Benchmarks

See the README of this folder on the branch
[`souffle-engine`](https://github.com/demarkok/isla/tree/souffle-engine/coln-engine).
