#!/usr/bin/env bash
# Capture un écran du jeu avec Edge sans fenêtre (Windows), depuis WSL.
# Le banc doit tourner : node tools/apercu/banc.mjs 8931
#   tools/apercu/capturer.sh <scenario> <sortie.png> [largeur] [hauteur] [paramètres d'URL]
# Aucun exécutable du jeu n'est lancé : c'est la page servie par le banc, rendue
# par Edge en mode headless avec un profil temporaire séparé.
set -e
scenario=$1; sortie=$(realpath -m "$2"); w=${3:-1600}; h=${4:-900}; extra=$5
edge="/mnt/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
profil="C:\Users\nicol\AppData\Local\Temp\eyb-apercu-$scenario"
timeout 240 "$edge" --headless=new --no-first-run --disable-extensions --hide-scrollbars \
  --enable-unsafe-swiftshader --use-angle=swiftshader --mute-audio --user-data-dir="$profil" \
  --window-size="$w,$h" --virtual-time-budget=90000 --screenshot="$(wslpath -w "$sortie")" \
  "http://localhost:8931/apercu.html?scenario=$scenario$extra" >/dev/null 2>&1
[ -s "$sortie" ] && echo "$sortie"
