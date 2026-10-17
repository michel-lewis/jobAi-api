#!/usr/bin/env bash
# Déplace une issue sur le projet GitHub « JobAI ».
#
#   scripts/board.sh 23 "In Progress"
#   scripts/board.sh 23 "In Review"
#
# Pré-requis une seule fois :  gh auth refresh -s project
#
# Idempotent : relancer avec le même statut ne casse rien.
# Ne tue jamais le ticket en cours — un board indisponible est un avertissement,
# pas une erreur bloquante.

set -uo pipefail

ISSUE="${1:?usage: board.sh <numéro d issue> <statut>}"
STATUS="${2:?usage: board.sh <numéro d issue> <statut>}"
OWNER="${BOARD_OWNER:-michel-lewis}"
PROJECT_TITLE="${BOARD_PROJECT:-JobAI}"

warn() { echo "board: $*" >&2; }

command -v gh >/dev/null || { warn "gh absent, board non mis à jour"; exit 0; }
command -v jq >/dev/null || { warn "jq absent, board non mis à jour"; exit 0; }

if ! gh auth status >/dev/null 2>&1; then
  warn "gh non authentifié, board non mis à jour"; exit 0
fi

PROJECT_NUMBER=$(gh project list --owner "$OWNER" --format json 2>/dev/null \
  | jq -r --arg t "$PROJECT_TITLE" '.projects[]? | select(.title==$t) | .number' | head -1)
if [ -z "$PROJECT_NUMBER" ]; then
  warn "projet « $PROJECT_TITLE » introuvable (gh auth refresh -s project ?)"; exit 0
fi

PROJECT_ID=$(gh project view "$PROJECT_NUMBER" --owner "$OWNER" --format json 2>/dev/null | jq -r '.id')

FIELD=$(gh project field-list "$PROJECT_NUMBER" --owner "$OWNER" --format json 2>/dev/null \
  | jq -r '.fields[]? | select(.name=="Status")')
FIELD_ID=$(echo "$FIELD" | jq -r '.id')
OPTION_ID=$(echo "$FIELD" | jq -r --arg s "$STATUS" '.options[]? | select(.name==$s) | .id')
if [ -z "$OPTION_ID" ] || [ "$OPTION_ID" = "null" ]; then
  warn "statut « $STATUS » absent du projet. Colonnes attendues : Todo, In Progress, In Review, Done"
  exit 0
fi

ITEM_ID=$(gh project item-list "$PROJECT_NUMBER" --owner "$OWNER" --limit 200 --format json 2>/dev/null \
  | jq -r --argjson n "$ISSUE" '.items[]? | select(.content.number==$n) | .id' | head -1)

if [ -z "$ITEM_ID" ]; then
  # L'issue n'est pas encore sur le board : on l'y ajoute, puis on relit son id.
  REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null)
  [ -n "$REPO" ] || { warn "dépôt introuvable, lance depuis le dépôt"; exit 0; }
  URL="https://github.com/$REPO/issues/$ISSUE"
  gh project item-add "$PROJECT_NUMBER" --owner "$OWNER" --url "$URL" >/dev/null 2>&1 \
    || { warn "impossible d'ajouter l'issue #$ISSUE au board"; exit 0; }
  ITEM_ID=$(gh project item-list "$PROJECT_NUMBER" --owner "$OWNER" --limit 200 --format json 2>/dev/null \
    | jq -r --argjson n "$ISSUE" '.items[]? | select(.content.number==$n) | .id' | head -1)
fi
[ -n "$ITEM_ID" ] || { warn "issue #$ISSUE introuvable sur le board"; exit 0; }

if gh project item-edit --id "$ITEM_ID" --project-id "$PROJECT_ID" \
     --field-id "$FIELD_ID" --single-select-option-id "$OPTION_ID" >/dev/null 2>&1; then
  echo "board: issue #$ISSUE → $STATUS"
else
  warn "échec du déplacement de l'issue #$ISSUE vers « $STATUS »"
fi
