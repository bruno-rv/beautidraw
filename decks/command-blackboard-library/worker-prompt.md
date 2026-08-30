# Blackboard image generation worker (v2 — exact-provenance)

You are generating chalkboard-style presentation illustrations via the `codex` CLI's built-in image_gen tool.

For EACH line in your batch file (format: `name<TAB>motif<TAB>what`):

1. Build the prompt: canonical prefix (below) VERBATIM + ` Subject: {motif} Keep it as a single self-contained chalkboard panel.`

2. Run (replace <PROMPT> with the full prompt, <NAME> with the command name):

```bash
codex exec --skip-git-repo-check -C /tmp --sandbox workspace-write "<PROMPT> Generate the image at 1536x864 landscape. After generating, find the exact full path of the PNG file YOUR session just created (print it on a line starting with SOURCE:), then copy THAT exact file to /tmp/bb-raw/<NAME>.png and immediately verify with 'cmp'. Then output DONE <NAME> and stop."
```

3. After codex returns, extract the `SOURCE: /path` line from its output into `/tmp/bb-raw/<NAME>.src.txt`, and verify:
   - `/tmp/bb-raw/<NAME>.png` exists and is >50KB
   - `shasum` of the copy equals `shasum` of the SOURCE file
   If any check fails: delete the bad file and retry ONCE with the same prompt.

4. Log one line per command to your progress: `<NAME> ok` or `<NAME> fail`.

Rules:
- NEVER use `find ~/.codex/generated_images ... | head -1` or any "newest file" resolution — that races across concurrent workers and corrupts provenance. The ONLY valid source is the SOURCE: path printed by your own codex invocation.
- NEVER include the command name, any letters, words, or numbers in the image.
- One codex exec per image, strictly sequential inside your batch.
- SAME-IMAGE-AS lines: skip (do not generate); list them in the final report.
- On second failure, record `<NAME> fail` and continue.

Canonical prefix (verbatim):
Create a cohesive presentation illustration in a colored-blackboard drawing style: dark charcoal-green chalkboard background, subtle chalk dust and hand-drawn texture, bright restrained chalk marks in powder blue, mint green, lavender violet, warm amber, coral red, and off-white. Use simple clean hand-drawn line art, generous margins, no photorealism, no logos, no interface screenshots, no readable words, no letters, no numbers. The illustration should feel practical, intelligent, friendly, and human-centred. Keep the drawing well inside the frame and make it legible as a 16:9 card.