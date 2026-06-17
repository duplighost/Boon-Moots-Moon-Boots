// Elevation helper (Phase 8b/8c). Standalone (no imports) so every system can
// use it without import cycles. A tier is a raised rect with a `height`; an
// entity's level is the height of the tier containing its centre, else 0 (ground).
// Movement between levels happens only through ramps (gaps in the tier's ledge
// walls), so level only ever changes when you walk a ramp — never teleports.
export function levelAt(room, x, y) {
  const tiers = room.tiers;
  if (!tiers || tiers.length === 0) return 0;
  for (const t of tiers) {
    if (x >= t.x && x <= t.x + t.w && y >= t.y && y <= t.y + t.h) return t.height;
  }
  return 0;
}
