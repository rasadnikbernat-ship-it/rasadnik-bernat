#!/usr/bin/bash
read -p "Commit description: " desc
node ./generator/generator.js
git add -A
git commit -m "$desc"
git pull --rebase
git push