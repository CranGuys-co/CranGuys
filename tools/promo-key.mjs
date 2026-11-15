// Prints the fingerprint the game stores for a promo code, ready to paste into PROMOS in src/economy/promo.js.
// usage: node tools/promo-key.mjs THECODE   (or: npm run promo-key -- THECODE)
import { cleanPromo, promoKey, promoFor } from '../src/economy/promo.js';

const code = process.argv[2];
if (!code) {
  console.error('usage: node tools/promo-key.mjs THECODE');
  process.exit(1);
}
const key = promoKey(code), taken = promoFor(code);
console.log(`${cleanPromo(code)} -> ${key}`);
console.log(taken ? `already in use: ${taken.title}` : `add to PROMOS: '${key}': { items: ['h_...'], title: '...', note: '...' },`);
