/**
 * layout.js — Pure geometry for the touch strip (kept separate from sharp so it can be unit tested).
 *
 * Outer icons sit flush with the strip edges (plus optional padding) so they line up with the dials below;
 * inner icons are spread evenly between them. The strip is rotated 180°, so zone 0 (leftmost on the glass
 * after rotation) is drawn at the highest x.
 */
'use strict';

/** Left x of each zone's icon on the strip canvas, indexed by zone (touch_1 = zone 0). */
function stripIconX({ width, iconSize, zones }, padding = 0) {
  const span = width - iconSize - 2 * padding;
  const xs = [];
  for (let i = 0; i < zones; i++) {
    xs.push(zones === 1 ? Math.round((width - iconSize) / 2) : Math.round(padding + (i * span) / (zones - 1)));
  }
  return xs.reverse();
}

module.exports = { stripIconX };
