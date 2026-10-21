#!/usr/bin/env bash
# Brings the server to origin's main and restarts it when the change needs it.
# Run as root by either burrow-update.timer or the OpenRC updater service; git
# itself runs as the server's user.
set -euo pipefail

dir=${BURROW_DIR:-/home/aj/ajc-private-server}
user=${BURROW_USER:-aj}
service=${BURROW_SERVICE:-burrow}
branch=${BURROW_BRANCH:-main}
init=${BURROW_INIT:-}

git() { runuser -u "$user" -- git -C "$dir" "$@"; }

restart_service() {
  case "$init" in
    systemd) systemctl restart "$service" ;;
    openrc) rc-service "$service" restart ;;
    "")
      if [ -d /run/openrc ] || [ -n "${RC_SVCNAME:-}" ]; then
        rc-service "$service" restart
      else
        systemctl restart "$service"
      fi
      ;;
    *)
      echo "unknown BURROW_INIT value: $init (expected systemd or openrc)" >&2
      return 2
      ;;
  esac
}

git fetch --quiet origin "$branch"
old=$(git rev-parse HEAD)
new=$(git rev-parse "origin/$branch")
[ "$old" != "$new" ] || exit 0

# only a fast-forward: a server that was edited by hand is left for a person
git merge --quiet --ff-only "origin/$branch"

# a file that does not parse would take the game down on restart
for file in $(git diff --name-only "$old" "$new" -- '*.js'); do
  if [ -f "$dir/$file" ] && ! runuser -u "$user" -- node --check "$dir/$file"; then
    git reset --quiet --hard "$old"
    echo "update to $new refused: $file does not parse; staying on $old" >&2
    exit 1
  fi
done

# the npm packages (only discord.js, for the optional Discord bot): installed
# again when the lockfile changed, or when they never were. a failed install
# leaves the bot off; the game itself needs none of them.
if [ -f "$dir/package-lock.json" ] && { ! git diff --quiet "$old" "$new" -- package-lock.json || [ ! -d "$dir/node_modules" ]; }; then
  if command -v npm >/dev/null && runuser -u "$user" -- npm --prefix "$dir" ci --omit=dev --no-audit --no-fund; then
    echo "npm packages installed"
  else
    echo "npm packages could not be installed; the Discord bot stays off" >&2
  fi
fi

# public/ is read from disk on every request; the rest is loaded once, at start.
# the list is taken whole first: piped straight into grep -q, a long one (a
# push of many files) had git cut off mid-write ("Broken pipe"), which
# pipefail read as nothing to restart for.
changed=$(git diff --name-only "$old" "$new")
if grep -qvE '^(public/|client-updates/|test/|tools/|deploy/|[^/]+\.md$|\.gitignore$)' <<<"$changed"; then
  restart_service
  echo "updated $old -> $new, restarted $service"
else
  echo "updated $old -> $new, no restart needed"
fi
