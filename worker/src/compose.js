/* Playbook grounding + deterministic composer (ported from functions/index.js). */
import { num } from "./qloo.js";

export const SYSTEM_PROMPT =
  "You are Attune's playbook agent: a venue-operations planner for independent " +
  "bar and restaurant owners. You receive JSON grounding from Qloo's Taste AI " +
  "(the venue, its block anchor venue, nearby place affinities, artist " +
  "affinities, audience segments, palate tags — all real, all cited).\n" +
  "Rules:\n" +
  "- Use ONLY entities present in the data. Never invent metrics, names, or numbers.\n" +
  "- Every line you write must name at least one grounded entity (place, artist, audience, or palate tag).\n" +
  "- Write operator-facing copy: concrete, physical, zero marketing fluff, under 120 words total.\n" +
  "- Format exactly as these lines, no markdown, no extra lines:\n" +
  "PERSONA: <one full sentence, under 16 words, naming the dominant audience segment and what they crave>\n" +
  "ROASTERS 07-11: <morning action>\n" +
  "LINGER 11-16: <midday action>\n" +
  "GOLDEN 16-20: <golden-hour action>\n" +
  "NIGHT 20-02: <late action>\n" +
  "PLAYLIST: <anchor artist> <BPM band like 105-120 BPM>\n" +
  "MENU: <one concrete dish or drink callout inspired by a palate tag — never an abstract label>";

/* Merge app artists with Qloo-enriched artists, keeping the highest affinity per name. */
export function mergedArtists(ctx, extra) {
  const byName = new Map();
  const push = (name, affinity) => {
    if (!name) return;
    const k = String(name).trim().toLowerCase();
    const a = num(affinity);
    if (!k || a <= 0) return;
    const prev = byName.get(k);
    if (!prev || a > prev.affinity) byName.set(k, { name: String(name).trim(), affinity: a });
  };
  (ctx.artist_affinities || []).forEach((a) => push(a.name, a.affinity));
  (extra || []).forEach((a) => push(a.name, a.affinity));
  return Array.from(byName.values()).sort((x, y) => y.affinity - x.affinity);
}

export function computeDrivers(ctx, artists) {
  const d = [];
  (ctx.nearby_place_affinities || []).slice(0, 10).forEach((p) =>
    d.push({ name: p.name, kind: "place", score: num(p.affinity) }));
  artists.slice(0, 6).forEach((a) => d.push({ name: a.name, kind: "artist", score: num(a.affinity) }));
  (ctx.micro_tribes || []).slice(0, 5).forEach((t) => d.push({ name: t.name, kind: "audience", score: num(t.affinity) }));
  return d.sort((a, b) => b.score - a.score).slice(0, 5);
}

export function compactGrounding(ctx, artists) {
  return {
    venue: ctx.venue || null,
    focus_daypart: ctx.focus_daypart || null,
    block_anchor: ctx.anchor ? { name: ctx.anchor.name, radius_ft: ctx.block_radius_ft || 800 } : null,
    anchor_pull: ctx.anchor_pull || null,
    top_places: (ctx.nearby_place_affinities || []).slice(0, 6),
    top_artists: artists.slice(0, 5).map((a) => ({ name: a.name, affinity: Number(a.affinity.toFixed(2)) })),
    audiences: (ctx.micro_tribes || []).slice(0, 4),
    palate_tags: (ctx.palate_signals || []).slice(0, 4),
    live_feed: ctx.feed || "demo",
  };
}

export function validPlaybook(text) {
  if (!text) return false;
  const t = String(text);
  return /PERSONA:/i.test(t) && /ROASTERS/i.test(t) && /LINGER/i.test(t) &&
    /GOLDEN/i.test(t) && /NIGHT/i.test(t) && t.length < 2000;
}

/* Deterministic composer — data in, copy out; cites real entities only. */
export function composeLocal(g) {
  const place = (g.top_places && g.top_places[0] && g.top_places[0].name) || "the anchor venue down the block";
  const place2 = (g.top_places && g.top_places[1] && g.top_places[1].name) || null;
  const artist = (g.top_artists && g.top_artists[0] && g.top_artists[0].name) || null;
  const artist2 = (g.top_artists && g.top_artists[1] && g.top_artists[1].name) || null;
  const tribe = (g.audiences && g.audiences[0] && g.audiences[0].name) || "regulars";
  const palate = (g.palate_tags && g.palate_tags[0]) || null;
  const palate2 = (g.palate_tags && g.palate_tags[1]) || null;
  const text = [
    "PERSONA: " + tribe + " who " + (palate ? "order the " + palate + " and " : "") +
      (artist ? "stream " + artist : "lean on the block's favourites") + ".",
    "ROASTERS 07-11: Early doors — fast coffee rotation and window seats to catch the " + place + " brunch queue spillover.",
    "LINGER 11-16: Lunch linger — keep " + (palate || "the day's feature") + " on the specials board; hold the room bright and unhurried.",
    "GOLDEN 16-20: Golden hour — build the set around " + (artist || place) +
      (artist2 ? " into " + artist2 : "") + (place2 ? " as the " + place2 + " crowd drifts over" : "") + ".",
    "NIGHT 20-02: After dark — dim to candlelight and ride the " + place + " after-party energy" +
      (palate2 ? " — keep the " + palate2 + " pours coming" : "") + ".",
    "PLAYLIST: " + (artist || "Block favourites") + " 100-120 BPM",
    "MENU: " + (palate ? palate.charAt(0).toUpperCase() + palate.slice(1) : "Seasonal feature") + " plate + by-the-glass pour.",
  ].join("\n");
  return { text, model: "attune-composer", provider: "local" };
}
