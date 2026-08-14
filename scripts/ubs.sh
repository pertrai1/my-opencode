#!/bin/bash
# Unified Bug Scanner (UBS)

# Exit immediately if a command exits with a non-zero status.
set -e

# Initialize current stage tracking
STAGE="Initialization"

# Trap errors to show which stage failed and emit a stable result record
failure_handler() {
    local exit_code=$?
    echo "" >&2
    echo "❌ UBS FAILED on stage: $STAGE" >&2
    printf "UBS_RESULT status=failure stage=%s exit_code=%d\n" "$STAGE" "$exit_code" >&2
    echo "Please resolve the errors above before committing." >&2
    exit "$exit_code"
}
trap failure_handler ERR

# --- 1. Syntax & Type Validation ---
STAGE="TypeScript Check"
echo "Running TypeScript type check..."
npm run typecheck
echo "✅ TypeScript check passed."

# --- 2. Lint Check ---
STAGE="ESLint"
echo "Running ESLint..."
npm run lint
echo "✅ ESLint check passed."

# --- 3. Test Suite ---
STAGE="Test Suite"
echo "Running tests..."
npm run test
echo "✅ Tests passed."

# --- Success Path ---
STAGE="Complete"
printf "UBS_RESULT status=success stage=%s exit_code=0\n" "$STAGE"
echo "🎉 UBS: All checks passed successfully!"
exit 0
