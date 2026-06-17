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

// Ground surfaces (Moonless-inspired): non-colliding floor patches that change how the
// boots feel. Returns the surface kind under a point on a given level, else null.
//  slick — frictionless chrome/ice: you keep momentum and drift
//  tar   — sticky sludge: drags you down (a dash glides over it)
//  charge— boost plate: shoves you along and lifts your top speed
export function surfaceAt(room, x, y, level = 0) {
  const surf = room.surfaces;
  if (!surf || !surf.length) return null;
  for (const s of surf) {
    if ((s.level || 0) !== (level || 0)) continue;
    if (s.rad) { const dx = x - s.x, dy = y - s.y; if (dx * dx + dy * dy <= s.rad * s.rad) return s.kind; }
    else if (x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h) return s.kind;
  }
  return null;
}
