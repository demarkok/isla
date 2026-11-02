# Souffle as the memory-model checker for isla-axiomatic

Standard isla produces one SMT problem per candidate, consisting of:
- ISA semantics ()
- `rf`/`co` axioms
- .cat model (closures and acyclicity checks).

In this experiment,  we carve out the checks out of the SMT problem and run them in Souffle instead:
- isla symbolically executes the program, produces the candidate execution (events).
- z3 gets an SMT problem with relation definitions and well-formedness (e.g. same-location) but no memory-model restrictions (i.e. no irreflexivity of ob).
- z3 proposes well-formed `rf` and `co`, which, however, may violate the memory model.
- The static relations and sets (`po`, `R`, etc.) and the proposed `rf`/`co` are written as datalog facts and fed into Souffle, which checks the memory-model restrictions. 
- If the execution is rejected by Souffle, isla adds a refuctation of the proposed `rf`+`co` to the SMT problem and asks z3 for another execution.

## Files
- `aarch64-facts.cat`: the cat file without memory model restrictions, so that z3 gives `rf` and `co` without checks.
- `aarch64-offline.dl`: the memory model restrictions encoded in datalog.
- `uniproc.smt2`: optional `--extra-smt` hint to z3 to prevent it from poroposing `rf`/`co` with trivial 2-node cycles, that would be rejected by Souffle anyway.
- `tests/`: the litmus tests referred to below; `tests/benchmark/`: the scaled families of the benchmark table and the raw results.

## Running
Requires isla built, the `armv8p5.ir` snapshot, z3 and Souffle on PATH, and
AArch64 toolchain (`--toolchain macos-aarch64` on a Mac).

```
I=./target/release/isla-axiomatic
A="-A /path/to/armv8p5.ir -C configs/armv8p5.toml --cache /tmp/isla-cache"
E="-m souffle-engine/aarch64-facts.cat --engine souffle-engine/aarch64-offline.dl"
F="-m web/client/dist/aarch64.cat"      # the full model in z3, for comparison

$I $A $E souffle-engine/tests/MP+dmb.sys.toml      # forbidden, 2 rounds; --verbose shows them
$I $A $F souffle-engine/tests/MP+dmb.sys.toml      # same verdict from the full model
$I $A $E --extra-smt souffle-engine/uniproc.smt2 souffle-engine/tests/MPsame-4+dmb.toml
```

## Benchmarks (by Claude)

Scaled tests from `tests/benchmark/` (generated families; "memory events" counts loads and
stores). Three settings, same machine (M-series Mac, 2026-11-02), one worker thread (`-T 1`),
the par-or tactic for every z3 call, z3 capped at 60 s per call ("timeout"):

- **z3, closure**: upstream isla (e9b5d94) with the stock `aarch64.cat`, the acyclicity checks
  as transitive-closure axioms.
- **z3, Int clocks**: this branch's binary with the `acyclic` checks encoded as integer clocks
  (PR rems-project/isla#108, cat rewritten to `acyclic obs | dob | aob | bob as external`).
- **Souffle engine**: this branch, `-m aarch64-facts.cat --engine aarch64-offline.dl
  --extra-smt uniproc.smt2`. "rounds" is the number of z3 answers, so for FORK and ENUM it
  includes one per candidate or enumerated execution plus one per rejected proposal.

Times are isla's own per-test figure (without the ~2 s IR load), second run after the footprint
cache is warm; expect about 20% variance. Verdicts agree in all three settings on all 14 tests
(FORK-4 allowed 9 of 16, FORK-6 16 of 64, everything else allowed). Raw data:
`tests/benchmark/results-2026-11-02.tsv`.

| test | memory events | z3, closure | z3, Int clocks | Souffle engine | rounds |
|---|---|---|---|---|---|
| MPn-4 | 10 | 1.3 s | 0.9 s | 0.8 s | 1 |
| MPn-8 | 18 | 2.8 s | 1.2 s | 1.2 s | 1 |
| MPn-16 | 34 | timeout | 2.1 s | 2.8 s | 1 |
| MPn-24 | 50 | timeout | 4.7 s | 7.0 s | 1 |
| MPsame-4 | 10 | 1.7 s | 1.0 s | 0.9 s | 1 |
| MPsame-8 | 18 | 9.4 s | 5.2 s | 1.5 s | 1 |
| MPsame-12 | 26 | timeout | 26.1 s | 3.4 s | 1 |
| MPsame-16 | 34 | timeout | timeout | 5.5 s | 1 |
| MPfree-16 | 34 | 15.7 s | 2.9 s | 3.5 s | 1 |
| MPfree-24 | 50 | timeout | 7.3 s | 8.1 s | 1 |
| FORK-4 | 6 | 14.2 s | 6.6 s | 7.1 s | 23 |
| FORK-6 | 8 | 68.7 s | 35.7 s | 47.2 s | 112 |
| ENUM-5 `-e` | 10 | 27.5 s | 7.3 s | 7.2 s | 33 |
| ENUM-7 `-e` | 14 | 152.4 s | 51.8 s | 45.7 s | 129 |

What the table says:

- MPsame (N writes to one location, `co` to be solved) is where the split pays: the engine
  grows slowly with N while z3 with clocks is at 26 s for 12 writes and times out at 16.
  The hint matters here: without `uniproc.smt2`, MPsame-4+dmb (in `tests/`) needs 25 rounds.
- MPn and MPfree (many locations, `co` trivial) are solved by the clock encoding alone; the
  engine is within 1.5x of it, its cost being the facts export and the Souffle run, which grow
  with the number of events.
- FORK and ENUM are small graphs with many candidates or enumerated executions: every one is a
  round of about 0.35-0.4 s for the engine (export plus Souffle), so it gains nothing over
  clocks there and loses on FORK-6. Both beat the closure encoding by 1.5-3x.

Families: MPn-N is message passing over N locations plus a flag with every read value pinned;
MPsame-N the same with all N writes to one location; MPfree-N is MPn-N without the final
assertion (`rf` free for every read); FORK-K puts K `CBNZ` on loaded values in the reader
(2^K candidates); ENUM-N is N independent write/read pairs run with `-e` (2^N executions).

## Costs and Limitations
- In small tests, one round costs about 0.4 s; z3 itself is 25-50 ms after the first round.
- In these cases, the cost is the number of rounds: every inconsistent proposal is one more round.
- It can be sped up with provenance, when instead of the whole `rf`/`co` relation, only the problematic cycle is blocked for the next rounds, this way more bad executions are rejected in one round. 
- This approach does not speed up the MMU model (Nils's page table tests). Without the acyclicity axioms, z3 takes 10-20x time to propose a single execution (probably because the executions are rejected at a much later stage, by non-MM-specific checks). 

