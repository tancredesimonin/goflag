#!/usr/bin/env bash
# The goflag step of the GitHub Action (action.yml). Every input arrives in the
# environment; nothing here is interpolated by the runner, so a value is data,
# never code.
set -euo pipefail

if [ -z "${GOFLAG_VERSION:-}" ]; then
  echo "::error::Set the action's version input: pin the goflag version you gate on." >&2
  exit 2
fi

report="${GOFLAG_REPORT:-goflag-report}"
args=("$GOFLAG_URL" --no-external --report "$report.json" --html "$report.html")

if [ -n "${GOFLAG_START:-}" ]; then
  args+=(--start "$GOFLAG_START")
fi

# A baseline that exists turns the gate into "nothing new". One that does not
# is not an error, but every finding the site carries then counts, and the
# notice says how to capture one.
if [ -n "${GOFLAG_BASELINE:-}" ] && [ -f "$GOFLAG_BASELINE" ]; then
  args+=(--baseline "$GOFLAG_BASELINE" --regressions-only)
elif [ -n "${GOFLAG_BASELINE:-}" ]; then
  echo "::notice::No baseline at $GOFLAG_BASELINE: every finding counts. Capture one with --update-baseline and commit it."
fi

if [ -n "${GOFLAG_MAX_DEBT:-}" ]; then
  args+=(--max-debt "$GOFLAG_MAX_DEBT")
fi
if [ -n "${GOFLAG_EXPECT_INDEXING:-}" ]; then
  args+=(--expect-indexing "$GOFLAG_EXPECT_INDEXING")
fi

# One header per line, each passed whole: a value may contain spaces.
while IFS= read -r header; do
  if [ -n "$header" ]; then
    args+=(--header "$header")
  fi
done <<< "${GOFLAG_HEADERS:-}"

# Split on spaces on purpose, as a shell would: `--locales en,fr --static`.
extra=()
if [ -n "${GOFLAG_ARGS:-}" ]; then
  read -r -a extra <<< "$GOFLAG_ARGS"
fi

set +e
npx --yes "@goflag/cli@$GOFLAG_VERSION" "${args[@]}" "${extra[@]}"
code=$?
set -e

echo "exit-code=$code" >> "$GITHUB_OUTPUT"
{
  echo "### goflag $GOFLAG_VERSION"
  echo
  case "$code" in
    0) echo "Passed: nothing at the gate's threshold." ;;
    1) echo "Failed the gate. The reasons are in the log and in the \`$report\` artifact." ;;
    *) echo "Could not run (exit $code): see the log." ;;
  esac
  echo
  echo "The report is the \`$report\` artifact of this run: open \`$report.html\` in a browser."
} >> "$GITHUB_STEP_SUMMARY"

exit "$code"
