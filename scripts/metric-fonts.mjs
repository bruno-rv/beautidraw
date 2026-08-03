// The font families the type ramp measures against, and how many unicode-range
// subsets each ships in the pinned @excalidraw/excalidraw build.
//
// Shared by build-bundle.mjs (which records them) and setup.mjs (which verifies
// them) so the two cannot drift: a `pnpm bundle` run that skipped the assertion
// could otherwise write a self-consistent but partial manifest that setup then
// accepted.
//
// Only these two families are validated. They are the faces docs/PLAN.md §2's
// metric tuple names, and a missing or altered subset silently shifts wrap
// points rather than failing (spike F2/F8). Excalidraw registers six more
// families that this engine never measures — Xiaolai alone is 209 CJK subsets,
// so hashing all 234 vendored files on every setup run would cost far more than
// it protects.
//
// `Cascadia` is the declared `mono` role. layout.mjs defines it in FONT but does
// not yet route any text through it (notes are prose-only), so today it is
// verified rather than exercised. It is validated anyway because the moment the
// mono role is wired, a silently-missing Cascadia would produce wrong geometry
// with no other signal.
export const EXPECTED_FONT_SUBSETS = { Nunito: 5, Cascadia: 1 };
