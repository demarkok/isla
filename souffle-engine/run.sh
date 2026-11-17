#!/bin/sh
# The engine command for isla-axiomatic: --engine souffle-engine/run.sh
# isla runs it as `run.sh FACTS_DIR OUT_DIR` for every execution that z3 proposes.
exec souffle "$(dirname "$0")/aarch64-offline.dl" -F "$1" -D "$2"
