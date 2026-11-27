#!/bin/sh
# usage: scripts/ci-commit.sh "message"
git add -A && git commit -q -m "$1

Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Vne2NP3oPnDnUBfvsP3s4C" && git log --oneline | head -1
