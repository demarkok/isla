Overall, it's all great, with some tweaks it is enough to express the user-level AArch64 memory model.
Below are some of the observations/comments from using Coln.

## [Store/Language] It would be nice to have a simpler way to run Coln for common (Souffle-like) usecases than through the Typescript interface.

The interface between Coln and Isla was:
1. isla writes the facts (`rf.facts`, `co.facts`) to `FACTS_DIR/*`.
2. coln imports those facts and populates its store.
3. coln exports some of its inferred views to `OUT_DIR/*.csv`.
4. isla reads those tables and checks that they are empty.

The coln steps (2 and 3) aren't supported natively,
so I needed to write a Typescript driver (`engine.ts`) that does them, and it required some work (although I delegated it to Claude), node, pnpm, etc.

So maybe it would be nice to have a simpler way to run Coln for this usecase. For instance, in souffle, 
the same problem is solved natively:
```
souffle -F FACTS_DIR -D OUT_DIR aarch64-offline.dl
```
where the input and output tables are marked .input and .output in the .dl file itself. Even if changing Coln language to support those commands is not desirable, maybe there could be a script like
```
coln-run-io -IO specs.toml aarch64-offline.coln
```
with `specs.toml` be like
```
[facts]
dir = FACTS_DIR
tables = ["rf", "co"]
[output]
dir = OUT_DIR
tables = ["check-false-external", "check-false-internal", "check-false-atomic"]
```

## [Store] Deleting rows not supported yet

Currently when isla goes over the executions, for each of them it starts Node
and builds a new store.

I'm curious, maybe it would be more efficient to use incrementality: keep the
store, and for each new execution take the diff: remove some of the rf and co
edges and add some new ones. It would save some time on small candidates, when 
node startup + store build takes 0.17s out of 0.2s for the whole call.


## [Store] Some of the chased rules aren't efficient in time complexity

(see the minimal example in `./slow-test/README.md`) 

In the memory model encoding I had a rule like this:
```
    dob-def-b2 : (x y z w : X.Ev) -> X.addr x y -> X.po y z -> X.ISB z -> X.po z w -> X.R w -> dob x w
```
which produces 

```
chased init.derived.dob-def-b2 x y z w := x ∈ root.Ev [] ∧ y ∈ root.Ev [] ∧ z ∈ root.Ev [] ∧ w ∈ root.Ev [] ∧ root.addr [
    a ↦ x,
    b ↦ y
] ∧ root.po [a ↦ y, b ↦ z] ∧ root.ISB [a ↦ z] ∧ root.po [
    a ↦ z,
    b ↦ w
] ∧ root.R [a ↦ w] ⊢ init.derived.dob [a ↦ x, b ↦ w]
```

I think because of the 4 membership checks in the beginning, ` x ∈ root.Ev [] ∧ y ∈ root.Ev [] ∧ z ∈ root.Ev [] ∧ w ∈ root.Ev []...`, one call grows as `Ω(n^4)` for `n` events. Even though these checks are redundant as they follow from the foreign key constraint of `root.po [a ↦ y, b ↦ z]`.

In Souffle, the same rule doesn't blow up the time. 

## [Language] Implicit arguments?
almost all definitions in `aarch64-offline.coln`
start with something like  `(x y z w : X.Ev)`, 
for instance, 

```
    dob-def-b2 : (x y z w : X.Ev) -> X.addr x y -> X.po y z -> X.ISB z -> X.po z w -> X.R w -> dob x w
```

Maybe those can be inferred implicitly (haskell-style):
```
    dob-def-b2 : X.addr x y -> X.po y z -> X.ISB z -> X.po z w -> X.R w -> dob x w
```


## [Language] Namespaces?

The model I wrote in .coln has the following constructions:

```
...
theory Derived (^i X : Exec) := sig
    fre : X.Ev -> X.Ev -> Prop
    fre-def : (x y : X.Ev) -> fr x y -> X.nonint x y -> fre x y
...
```
or

```
...
theory Axioms (^i X : Exec) (^i D : Derived X) := sig
    atomic : (x y : X.Ev) -> Prop
    atomic-def : (x y z : X.Ev) -> X.rmw x z -> D.fre x y -> D.coe y z -> atomic x z
...
```


What was a bit inconvenient is that I needed to remember if a certain field is
the one given (`X.rmw`) or derived (`D.fre`)
to decide whether to write `X.` or `D.` or no prefix. 
Maybe these `X.` and `D.` could be somehow inferred so one could write

```
...
theory Axioms (^i X : Exec) (^i D : Derived X) := sig
    atomic : (x y : Ev) -> Prop
    atomic-def : rmw x z -> fre x y -> coe y z -> atomic x z
...
```


## [Language] Logic operations on Prop (|, ×) in arguments?
Another way to make the definitions shorter would be disjunction/conjunction in the arguments.
Without them, I would need to rewrite the expressions in some sort of DNF. 

We have the following .cat definition:
```
(* Dependency-ordered-before *)
let dob = addr | data
    | ctrl; [W]
    | (ctrl | (addr; po)); [ISB]; po; [R]
    | addr; po; [W]
    | (ctrl | data); coi
    | (addr | data); rfi
```
The corresponding .coln encoding is:

```
dob : X.Ev -> X.Ev -> Prop
dob-def-addr : (x y : X.Ev) -> X.addr x y -> dob x y
dob-def-data : (x y : X.Ev) -> X.data x y -> dob x y
dob-def-ctrlW : (x y : X.Ev) -> X.ctrl x y -> X.W y -> dob x y
dob-def-b1 : (x y z : X.Ev) -> X.ctrl x y -> X.ISB y -> X.po y z -> X.R z -> dob x z
dob-def-b2 : (x y z w : X.Ev) -> X.addr x y -> X.po y z -> X.ISB z -> X.po z w -> X.R w -> dob x w
dob-def-apo : (x y z : X.Ev) -> X.addr x y -> X.po y z -> X.W z -> dob x z
dob-def-coi1 : (x y z : X.Ev) -> X.ctrl x y -> coi y z -> dob x z
dob-def-coi2 : (x y z : X.Ev) -> X.data x y -> coi y z -> dob x z
dob-def-rfi1 : (x y z : X.Ev) -> X.addr x y -> rfi y z -> dob x z
dob-def-rfi2 : (x y z : X.Ev) -> X.data x y -> rfi y z -> dob x z
```

With implicit arguments and namespaces, it could look something like

```
dob : Ev -> Ev -> Prop
dob-def-addr : addr x y -> dob x y
dob-def-data : data x y -> dob x y
dob-def-ctrlW : ctrl x y -> W y -> dob x y
dob-def-b : (ctrl x y | addr x w × po w y) -> ISB y -> po y z -> R z -> dob x z
dob-def-apo : addr x y -> po y z -> W z -> dob x z
dob-def-coi1 : (ctrl x y | data x y) -> coi y z -> dob x z
dob-def-rfi1 : (addr x y | data x y) -> rfi y z -> dob x z
```



## [Language] Negation


The .cat definitions for "reads-from internal" and "reads-from external" are:
```
let rfi = rf & int
let rfe = rf \ rfi
```

Because there is no negation in Coln, I import `nonint` -- negation of `int` -- from the outside (from isla) and write:

```
rfi-def : (x y : X.Ev) -> X.rf x y -> X.int x y -> rfi x y
rfe-def : (x y : X.Ev) -> X.rf x y -> X.nonint x y -> rfe x y
```
But this workaround wouldn't work if `int` was a derived relation.

It would be nice to be able to write something like 

```
rfe-def : (x y : X.Ev) -> X.rf x y -> !X.nint x y -> rfe x y
```
