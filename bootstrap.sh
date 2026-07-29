#!/usr/bin/env bash
#
# consort - one-line bootstrap.
#
# Consort runs against a real Lakebase database (no mock mode), so a handful of
# tools plus a Lakebase-enabled workspace must be in place before the first run.
# This script does the "assemble five tools by hand" work for you: it detects
# each required tool, offers to install or upgrade the ones that are missing or
# too old, then runs the environment doctor so the one hard requirement (a
# Lakebase workspace) is the single thing you have to arrange yourself.
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
# Exit codes: 0 = environment ready (doctor passed); 1 = a hard prerequisite is
# still missing after the run (doctor reported a blocker).

set -euo pipefail

KIT_REF="${LAKEBASE_KIT_REF:-v0.1.0-beta.10}"
SCM_UTILS_PKG="github:databricks-solutions/lakebase-scm-utils#${KIT_REF}"

ASSUME_YES=false
CHECK_ONLY=false
while [ $# -gt 0 ]; do
  case "$1" in
    --yes|-y) ASSUME_YES=true; shift ;;
    --check-only) CHECK_ONLY=true; shift ;;
    -h|--help)
      sed -n '2,22p' "$0" | sed 's/^# \{0,1\}//'
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

# gh (present + authenticated)
if have gh; then
  if gh auth status >/dev/null 2>&1; then
    echo -e "  ${GREEN}✓${NC} GitHub CLI (authenticated)"
  else
    echo -e "  ${YELLOW}!${NC} GitHub CLI present but not authenticated - run: gh auth login"
    MISSING=$((MISSING+1))
  fi
else
  echo -e "  ${RED}✗${NC} GitHub CLI not found"
  offer_brew_install "GitHub CLI" "gh" "https://cli.github.com" || MISSING=$((MISSING+1))
fi

# databricks CLI (the doctor version-gates it; we only ensure it exists here)
if have databricks; then
  echo -e "  ${GREEN}✓${NC} Databricks CLI $(databricks --version 2>/dev/null | tail -1)"
else
  echo -e "  ${RED}✗${NC} Databricks CLI not found"
  offer_brew_install "Databricks CLI" "databricks/tap/databricks" "https://docs.databricks.com/dev-tools/cli/install.html" || MISSING=$((MISSING+1))
fi

echo
if [ "$CHECK_ONLY" = true ]; then
  if [ "$MISSING" -gt 0 ]; then
    echo -e "${YELLOW}$MISSING prerequisite(s) missing (check-only; nothing installed).${NC}"
    exit 1
  fi
  echo -e "${GREEN}All tool prerequisites present.${NC}"
  exit 0
fi

# Hand off to the environment doctor, which version-gates every tool AND probes
# that the target workspace has Lakebase enabled (the one requirement this
# script cannot install for you).
echo -e "${BLUE}Running the environment doctor (npx lakebase-doctor)...${NC}"
if ! have npx; then
  echo -e "${RED}npx not available (install Node.js 20+ first), cannot run the doctor.${NC}"
  exit 1
fi
if npx --yes --package="$SCM_UTILS_PKG" lakebase-doctor; then
  echo
  echo -e "${GREEN}Environment ready.${NC} Next: install the Claude Code plugin:"
  echo "  claude plugin marketplace add databricks-solutions/consort"
  echo "  claude plugin install consort@databricks-solutions"
  echo "Then run /consort:start in a fresh folder."
  exit 0
else
  echo
  echo -e "${YELLOW}The doctor reported blockers above. Fix them (a common one: the workspace does not have Lakebase enabled), then re-run.${NC}"
  exit 1
fi
