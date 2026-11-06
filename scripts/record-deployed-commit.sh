#!/bin/bash
# record-deployed-commit.sh <upstream-ref> <out-file> — which code a deploy pulled (G1.2, spec §5.12).
# deploy.sh runs it right after `git pull --rebase origin main`, with FETCH_HEAD: the upstream commit is the code
# the server runs; HEAD also carries the content cron's commits rebased on top. server/lib/serverCommit.js reads
# the file once at boot. The old file is deleted FIRST, so a failure here leaves no stale commit behind and the
# server falls back to `git rev-parse HEAD` (commit_source git-head).
set -euo pipefail
ref="${1:?usage: record-deployed-commit.sh <upstream-ref> <out-file>}"
out="${2:?usage: record-deployed-commit.sh <upstream-ref> <out-file>}"
rm -f "$out"
upstream="$(git rev-parse --verify --quiet "${ref}^{commit}")"
head="$(git rev-parse --verify --quiet 'HEAD^{commit}')"
tmp="${out}.tmp.$$"
printf '{"upstream":"%s","head":"%s"}\n' "$upstream" "$head" > "$tmp"
mv -f "$tmp" "$out"
