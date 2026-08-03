// Probe 8 — prove the font gate must be glyph-driven (PLAN.md §2).
//
// Found by a post-spike consistency sweep, which argued from the Excalidraw
// sources that `document.fonts.check(font)` WITHOUT a text argument probes the
// spec default (" ") and therefore passes as soon as any latin subset is present.
// This measures it instead of arguing it: load Latin only, then ask both forms of
// check, and measure a Cyrillic string in that window.
//
// Measured scope: the bare form returns true for all three repertoires below, but
// it is only VACUOUS — i.e. disagreeing with the honest form, over a measurement
// that is actually wrong — for Cyrillic and Vietnamese. LATIN_EXT rides along with
// LATIN, both checks agree, and the width is already correct. The earlier claim
// that LATIN_EXT moves a wrap point did not reproduce.
//
// If bareCheckIsVacuous is ever false on a future runtime, the §2 rule can be
// relaxed. Until then it is load-bearing.

import { withHarness } from "../harness-runner.mjs";

const CYRILLIC = "Быстрая коричневая лиса";
const VIETNAMESE = "Tiếng Việt vượt qua";
const LATIN_EXT = "Łódź ā ē ī ō ū ș ț ℓ †";

const result = await withHarness(async ({ page }) => {
  return page.evaluate(
    async ({ cyrillic, vietnamese, latinExt }) => {
      const ctx = document.createElement("canvas").getContext("2d");
      const w = (family, text) => {
        ctx.font = `20px "${family}"`;
        return +ctx.measureText(text).width.toFixed(3);
      };

      const probe = async (family, text, label) => {
        // Fresh-ish state: load only Latin for this family first.
        await document.fonts.load(`20px "${family}"`, "The quick brown fox");
        await document.fonts.ready;
        const before = {
          bareCheck: document.fonts.check(`20px "${family}"`),
          textCheck: document.fonts.check(`20px "${family}"`, text),
          width: w(family, text),
        };
        await document.fonts.load(`20px "${family}"`, text);
        await document.fonts.ready;
        const after = {
          bareCheck: document.fonts.check(`20px "${family}"`),
          textCheck: document.fonts.check(`20px "${family}"`, text),
          width: w(family, text),
        };
        return {
          label,
          before,
          after,
          // Vacuous means: the bare form says "loaded" while the honest form says
          // "not loaded". Only then is the measurement in that window wrong.
          // A `true`/`true` pair is not vacuous — it is a correct pass.
          bareCheckIsVacuous: before.bareCheck === true && before.textCheck === false,
          widthErrorPct:
            before.width === after.width
              ? 0
              : +(((after.width - before.width) / before.width) * 100).toFixed(2),
        };
      };

      const results = [
        await probe("Nunito", cyrillic, "Nunito/cyrillic"),
        await probe("Nunito", vietnamese, "Nunito/vietnamese"),
        await probe("Nunito", latinExt, "Nunito/latinExt"),
      ];

      return {
        results,
        assertions: {
          // At least one repertoire must expose the vacuous bare check, or the
          // §2 rule is over-engineering and should be revisited.
          bareCheckIsVacuousSomewhere: results.some((r) => r.bareCheckIsVacuous),
          // Wherever it is vacuous, the measurement in that window must be wrong
          // — that is what makes it a correctness gate rather than hygiene.
          vacuousImpliesWrongWidth: results
            .filter((r) => r.bareCheckIsVacuous)
            .every((r) => r.widthErrorPct !== 0),
          // The text-argument form must be honest in every case.
          textCheckAlwaysHonest: results.every(
            (r) => r.after.textCheck === true,
          ),
        },
      };
    },
    { cyrillic: CYRILLIC, vietnamese: VIETNAMESE, latinExt: LATIN_EXT },
  );
});

console.log(JSON.stringify(result, null, 2));

const failed = Object.entries(result.assertions).filter(([, v]) => v !== true);
if (failed.length) {
  console.error("FAILED assertions:", failed.map(([k]) => k).join(", "));
  process.exit(1);
}
console.error("all assertions hold");
