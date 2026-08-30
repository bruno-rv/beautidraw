#!/bin/zsh
# usage: run-batch.sh <batch-number>
# v3: provenance = LAST SOURCE: line from the codex invocation; copy + source checksums must
# match byte-for-byte. Codex agents sometimes emit multiple SOURCE: lines because they stage an
# intermediate copy; the last one is the terminal generation.
B=$1
BATCH="decks/command-blackboard-library/shards/batch-$B.txt"
mkdir -p /tmp/bb-raw
PREFIX="Create a cohesive presentation illustration in a colored-blackboard drawing style: dark charcoal-green chalkboard background, subtle chalk dust and hand-drawn texture, bright restrained chalk marks in powder blue, mint green, lavender violet, warm amber, coral red, and off-white. Use simple clean hand-drawn line art, generous margins, no photorealism, no logos, no interface screenshots, no readable words, no letters, no numbers. The illustration should feel practical, intelligent, friendly, and human-centred. Compose the scene edge to edge - layered foreground, midground and background filling the whole board, with only a slim crop-safe border, never a lone object centered on empty board with wide empty margins."

verify() { # name -> 0 if copy exists, >50KB, and matches sha of $srcfile
  local name=$1 srcfile=$2
  [[ -f /tmp/bb-raw/$name.png ]] || return 1
  local -i sz=$(stat -f%z /tmp/bb-raw/$name.png 2>/dev/null || echo 0)
  [[ $sz -gt 50000 ]] || return 1
  [[ -n "$srcfile" && -f "$srcfile" ]] || return 0  # no source line: accept copy only
  [[ "$(shasum -a 256 "$srcfile" | awk '{print $1}')" == "$(shasum -a 256 /tmp/bb-raw/$name.png | awk '{print $1}')" ]]
}

gen_one() { # name motif -> emits 'ok' or 'fail'
  local name=$1 motif=$2
  local PROMPT="${PREFIX} Subject: ${motif} Fill the frame with a complete layered SCENE: an environment (ground, sky, walls, furniture or landscape) with several interacting elements around the focal metaphor - never a single lone object or sparse floating items on an empty board; compose edge to edge with only a slim crop-safe border. Generate the image at 1536x864 landscape. First decide the exact full path of a PNG file YOUR session just created under ~/.codex/generated_images (the built-in tool's own output, not any copy you made). Print exactly one line: SOURCE: <that path>. Then copy THAT exact file to /tmp/bb-raw/${name}.png and verify the copy succeeded. Then output DONE ${name} and stop. Do not write any other files."
  local out src
  out=$(codex exec --skip-git-repo-check -C /tmp --sandbox workspace-write "$PROMPT" </dev/null 2>&1)
  src=$(echo "$out" | grep '^SOURCE:' | tail -1 | sed 's/^SOURCE:[[:space:]]*//' | tr -d '`"'"'")
  src=$(echo "$src" | xargs)
  if verify "$name" "$src"; then
    echo "$src" > /tmp/bb-raw/$name.src.txt
    echo "ok"; return 0
  fi
  # one retry
  out=$(codex exec --skip-git-repo-check -C /tmp --sandbox workspace-write "$PROMPT" </dev/null 2>&1)
  src=$(echo "$out" | grep '^SOURCE:' | tail -1 | sed 's/^SOURCE:[[:space:]]*//' | tr -d '`"'"'")
  src=$(echo "$src" | xargs)
  if verify "$name" "$src"; then
    echo "$src" > /tmp/bb-raw/$name.src.txt
    echo "ok"; return 0
  fi
  rm -f /tmp/bb-raw/$name.png
  echo "fail"; return 1
}

n=0
total=$(grep -vc 'SAME-IMAGE-AS' "$BATCH")
while IFS=$'\t' read -r -u 3 name motif what; do
  [[ "$motif" == SAME-IMAGE-AS* ]] && {
    [[ "$motif" == SAME-IMAGE-AS:* ]] || { echo "REFUSED: malformed alias row for $name (expected SAME-IMAGE-AS:<target>): '$motif'"; exit 1; }
    continue
  }
  n=$((n+1))
  if [[ -f /tmp/bb-raw/$name.png && $(stat -f%z /tmp/bb-raw/$name.png 2>/dev/null || echo 0) -gt 50000 ]]; then
    echo "$name ok (cached)"
    echo "progress: $n/$total batch $B"
    continue
  fi
  res=$(gen_one "$name" "$motif")
  echo "$name $res"
  echo "progress: $n/$total batch $B"
done 3< "$BATCH"
echo "BATCH $B COMPLETE"