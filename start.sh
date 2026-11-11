#!/usr/bin/env bash
# Rasadnik Bernat — pokreni editor jednim klikom (Linux/Mac).
# Dvoklik ili: ./start.sh
# Sve ostalo (instalacija ovisnosti, data.json, otvaranje browsera) radi se automatski.

set -e
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js nije instaliran. Instaliraj ga s https://nodejs.org (LTS verzija), pa pokreni ponovno."
  read -r -p "Pritisni Enter za izlaz…" _
  exit 1
fi

node generator/editor/server.js
