#!/bin/sh
# The engine command for isla-axiomatic: --engine coln-engine/run.sh
# isla runs it as `run.sh FACTS_DIR OUT_DIR` for every execution that z3 proposes.
exec node "$(dirname "$0")/dist/engine.js" "$1" "$2"
