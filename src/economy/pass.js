// CranPass — the free reward roadmap. Every level you reach (XP from playing) pays Cranberries; every 5th level
// adds Crowns, and milestones hand out items — including colours you can only get here. Rewards are claimed on
// the CranPass screen; claiming is idempotent (offline: profile.passClaimed, online: ledger refs 'pass:<level>').
import { itemById, RARITY, levelForXp } from './cosmetics.js';
const PASS_SHOWN = 100;             // the roadmap shows 100 levels (rewards keep coming after that)
const PASS_ITEMS = {
  3: 'f_wink', 6: 'p_polka', 10: 'c_neon', 15: 'p_stars', 20: 'c_electric', 25: 'h_halo', 30: 'c_magenta',
  35: 'f_starry', 40: 'c_midnight', 45: 'p_hearts', 50: 'c_glacier', 60: 'h_viking', 75: 'h_pirate', 100: 'h_wings', // level 100: CranPass-only Champion Wings
};

// What level `lv` pays. `owned` (a Set) turns an item you already have into Cranberries (or Crowns) instead.
function passReward(lv, owned = null) {
  lv |= 0; if (lv < 2) return null;
  const r = { lv, berries: Math.min(600, 140 + lv * 10), crowns: 0, item: null };
  if (lv % 5 === 0) { r.crowns = lv % 25 === 0 ? 3 : 1; r.berries += 100; }
  const id = PASS_ITEMS[lv], it = id && itemById(id);
  if (it) {
    if (owned && owned.has(id)) { const pr = RARITY[it.rarity].price; r.berries += pr.b ? Math.round(pr.b / 2) : pr.c ? 0 : 300; r.crowns += pr.c ? Math.ceil(pr.c / 2) : 0; r.dupe = id; } // already have it: half its value instead
    else r.item = id;
  }
  return r;
}

// Everything between `claimed` (exclusive) and the level for `xp` (inclusive), summed, plus the item list.
function passClaimable(xp, claimed, owned) {
  const lv = levelForXp(xp | 0), from = Math.max(1, claimed | 0) + 1;
  const out = { from, to: lv, berries: 0, crowns: 0, items: [], levels: [] };
  const have = new Set(owned || []);
  for (let l = from; l <= lv; l++) {
    const r = passReward(l, have); if (!r) continue;
    out.berries += r.berries; out.crowns += r.crowns; out.levels.push(r);
    if (r.item) { out.items.push(r.item); have.add(r.item); }
  }
  return out;
}


export { PASS_SHOWN, PASS_ITEMS, passReward, passClaimable };
