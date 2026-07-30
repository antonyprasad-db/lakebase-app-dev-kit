#!/usr/bin/env bash
#
# consort - one-line bootstrap: get the tools in place, then point you at /consort:start.
#
# Consort runs against a real Lakebase database (no mock mode). This script does
# the "assemble the tools by hand" work for you: it detects each required tool
# (Node, npm, Python, JDK, gh, the Databricks CLI), offers to install or upgrade
# what is missing, and checks that gh and the Databricks CLI are authenticated.
#
# It deliberately does NOT probe whether your workspace has Lakebase enabled.
# That check needs a specific workspace target, and there is no target until you
# create a project. /consort:start (and lakebase-create-project) run the full
# environment doctor, INCLUDING the Lakebase-enabled probe, against your chosen
# workspace before provisioning anything. So a green result here means "tools
# ready"; the workspace check happens at create time, when there is something to
# check against. Running that probe now, in an empty folder, would only report
# "no workspace target yet", which is expected, not a problem to fix.
#
# Usage:
#   bash <(curl -sL https://raw.githubusercontent.com/databricks-solutions/consort/main/bootstrap.sh)
#
#   # Non-interactive: attempt every missing install without prompting.
#   bash <(curl -sL .../bootstrap.sh) --yes
#
#   # Only report what is missing; install nothing.
#   bash <(curl -sL .../bootstrap.sh) --check-only
#
# Exit codes: 0 = all required tools present (any remaining auth step is printed
# as a reminder, not a failure); 1 = a required tool is still missing.

set -euo pipefail

ASSUME_YES=false
CHECK_ONLY=false
while [ $# -gt 0 ]; do
  case "$1" in
    --yes|-y) ASSUME_YES=true; shift ;;
    --check-only) CHECK_ONLY=true; shift ;;
    -h|--help)
      sed -n '2,30p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
done

if [ -t 1 ]; then
  RED=$'\033[0;31m'; GREEN=$'\033[0;32m'; YELLOW=$'\033[1;33m'; BLUE=$'\033[0;34m'; NC=$'\033[0m'
else
  RED=""; GREEN=""; YELLOW=""; BLUE=""; NC=""
fi

have() { command -v "$1" >/dev/null 2>&1; }

OS="$(uname -s)"
BREW=false
if have brew; then BREW=true; fi

# Ask (or auto-yes / auto-no) before an install.
confirm() {
  local prompt="$1"
  if [ "$CHECK_ONLY" = true ]; then return 1; fi
  if [ "$ASSUME_YES" = true ]; then return 0; fi
  if [ ! -t 0 ]; then return 1; fi  # non-interactive stdin: do not install
  printf '%s [y/N] ' "$prompt"
  local reply; read -r reply
  case "$reply" in [yY]|[yY][eE][sS]) return 0 ;; *) return 1 ;; esac
}

# Offer a brew install (macOS / linuxbrew). Returns non-zero if not installed.
offer_brew_install() {
  local label="$1" formula="$2"
  # In check-only mode we just report; do not offer or print a skip line.
  if [ "$CHECK_ONLY" = true ]; then return 1; fi
  if [ "$BREW" != true ]; then
    echo -e "  ${YELLOW}→ Install $label manually (no Homebrew detected): $3${NC}"
    return 1
  fi
  if confirm "  Install $label via 'brew install $formula'?"; then
    brew install "$formula"
  else
    echo -e "  ${YELLOW}→ Skipped. Install $label yourself: $3${NC}"
    return 1
  fi
}

echo -e "${BLUE}consort bootstrap: checking prerequisites${NC}"
echo

MISSING=0
AUTH_REMINDERS=()

# node + npm (npm ships with node)
if have node; then
  NODE_MAJOR="$(node -v 2>/dev/null | sed -E 's/^v?([0-9]+).*/\1/')"
  if [ "${NODE_MAJOR:-0}" -ge 20 ]; then
    echo -e "  ${GREEN}✓${NC} Node.js $(node -v)"
  else
    echo -e "  ${YELLOW}!${NC} Node.js $(node -v) - Consort needs 20+"
    offer_brew_install "Node.js 20" "node@20" "https://nodejs.org" || MISSING=$((MISSING+1))
  fi
else
  echo -e "  ${RED}✗${NC} Node.js not found"
  offer_brew_install "Node.js" "node" "https://nodejs.org" || MISSING=$((MISSING+1))
fi
have npm && echo -e "  ${GREEN}✓${NC} npm $(npm -v)" || { echo -e "  ${RED}✗${NC} npm not found (ships with Node.js)"; MISSING=$((MISSING+1)); }

# python 3.10+
if have python3; then
  echo -e "  ${GREEN}✓${NC} $(python3 --version 2>&1)"
else
  echo -e "  ${RED}✗${NC} Python 3 not found"
  offer_brew_install "Python 3.11" "python@3.11" "https://www.python.org/downloads" || MISSING=$((MISSING+1))
fi

# jdk 17+. `have java` is not enough: macOS ships a /usr/bin/java stub that
# exists on PATH but errors ("Unable to locate a Java Runtime") when no JDK is
# installed. Require `java -version` to actually succeed.
# `|| true`: java exits non-zero when no runtime is installed, and with
# `set -e`/pipefail that would abort the script mid-check.
JAVA_VER="$( { java -version 2>&1 | head -1; } || true )"
if have java && printf '%s' "$JAVA_VER" | grep -qiE 'version|openjdk'; then
  echo -e "  ${GREEN}✓${NC} $JAVA_VER"
else
  echo -e "  ${YELLOW}!${NC} JDK not found (needed for the Flyway live path)"
  offer_brew_install "JDK 17" "openjdk@17" "https://adoptium.net" || MISSING=$((MISSING+1))
fi

# gh: presence is the tool requirement; authentication is a reminder, not a
# blocker (the tool is installed; `gh auth login` is a one-liner run later).
if have gh; then
  if gh auth status >/dev/null 2>&1; then
    echo -e "  ${GREEN}✓${NC} GitHub CLI (authenticated)"
  else
    echo -e "  ${GREEN}✓${NC} GitHub CLI (installed; not yet authenticated)"
    AUTH_REMINDERS+=("gh auth login   # authenticate the GitHub CLI")
  fi
else
  echo -e "  ${RED}✗${NC} GitHub CLI not found"
  offer_brew_install "GitHub CLI" "gh" "https://cli.github.com" || MISSING=$((MISSING+1))
fi

# databricks CLI: presence is the tool requirement. Whether it is authenticated
# to a Lakebase-enabled workspace is verified by the doctor at /consort:start
# (which has a workspace target); here we only nudge if no auth exists at all.
if have databricks; then
  echo -e "  ${GREEN}✓${NC} Databricks CLI $(databricks --version 2>/dev/null | tail -1)"
  if ! databricks auth describe >/dev/null 2>&1; then
    AUTH_REMINDERS+=("databricks auth login --host <your-lakebase-workspace>   # authenticate the Databricks CLI")
  fi
else
  echo -e "  ${RED}✗${NC} Databricks CLI not found"
  offer_brew_install "Databricks CLI" "databricks/tap/databricks" "https://docs.databricks.com/dev-tools/cli/install.html" || MISSING=$((MISSING+1))
fi

echo
if [ "$MISSING" -gt 0 ]; then
  echo -e "${YELLOW}$MISSING required tool(s) still missing. Install them (see above), then re-run.${NC}"
  exit 1
fi

echo -e "${GREEN}All required tools are present.${NC}"

# Auth reminders are NOT failures: the tools are installed, and these one-liners
# are quick to run whenever you are ready.
if [ "${#AUTH_REMINDERS[@]}" -gt 0 ]; then
  echo
  echo -e "${YELLOW}Before your first project, authenticate:${NC}"
  for r in "${AUTH_REMINDERS[@]}"; do echo "  $r"; done
fi

echo
echo -e "${BLUE}Next:${NC}"
echo "  claude plugin marketplace add databricks-solutions/consort"
echo "  claude plugin install consort@databricks-solutions"
echo "  # then, in the folder for your project:"
echo "  /consort:start"
echo
echo "/consort:start runs the full environment doctor against your chosen"
echo "workspace, INCLUDING the check that it has Lakebase enabled, before it"
echo "provisions anything. That workspace check belongs there, not here: it needs"
echo "a target, and there is no target until you pick a workspace at create time."
exit 0
