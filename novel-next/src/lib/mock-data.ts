// ============ ข้อมูลตัวอย่าง (พอร์ตจาก data.jsx) — รูปทรงดีไซน์เดิม ============
// ใช้เป็น "seed" ตอน DB ว่างเท่านั้น (ดู seed.ts ที่ map → Story shape)
// types ที่นี่เป็นของ mock เอง (ไม่ใช่โมเดลจริงใน types.ts)
import type { ColorKey } from './theme';
import type { ArcBeat, RelBeat, EventImportance } from './types';

interface Character {
  id: string; name: string; role: string; color: ColorKey; initial: string;
  appearance: string; bio: string; skill: string; mindset: string; behavior: string;
  selfP: string; otherP: string; tone: string; sample: string;
  anchor: string; neg: string; outfit: string; mode: 'anime' | 'photoreal';
}
interface Plot { genre: string; theme: string; premise: string; plot: string; rules: string; style: string; vocab: string; donts: string }
interface Chapter { id: string; title: string; words: number; status: 'done' | 'draft' | 'empty'; body: string }
interface TimelineEvent { when: string; title: string; detail: string; chapter: string; color: ColorKey }
interface Relation { id: string; from: string; to: string; type: string; feeling: string }
interface Location { id: string; name: string; zone: string; color: ColorKey; mood: string; desc: string }
interface AILog { id: number; time: string; endpoint: string; provider: string; model: string; status: 'ok' | 'error'; ms: number }
interface NodePos { x: number; y: number }

export const STORIES = ['The Ashfall Saga', 'Tideglass', 'Marrow & Moonlight'];

export const CHARACTERS: Character[] = [
  { id: 'kaelen', name: 'Kaelen Ash', role: 'Protagonist', color: 'grape', initial: 'K',
    appearance: 'Lean and soot-streaked, with eyes like banked coals and a burn-scar curling up one wrist.',
    bio: 'Orphaned by the first ashfall, raised by the cinder-monks who feared the spark in her hands.',
    skill: 'Ember-shaping — can coax living flame from the smallest heat.',
    mindset: 'Reckless hope; would rather burn bright than fade slow.',
    behavior: 'Acts first, grieves later. Fidgets with a flint when nervous.',
    selfP: 'I / me', otherP: 'you', tone: 'Warm, impulsive, quick to joke when scared.',
    sample: '"If the world won\'t spare a flame, then fine — I\'ll carry my own."',
    anchor: '1girl, ember sparks, ash-grey coat, warm rim light', neg: 'lowres, extra fingers, watermark',
    outfit: 'Patched travel coat, long scarf, fingerless gloves', mode: 'anime' },
  { id: 'mira', name: 'Mira Vale', role: 'Deuteragonist', color: 'sky', initial: 'M',
    appearance: 'Sharp-eyed and ink-stained, hair always escaping its tie.',
    bio: 'A cartographer mapping a world that keeps rearranging itself under the falling ash.',
    skill: 'Reads ley-lines; never truly lost.',
    mindset: 'Trusts maps more than people — for now.',
    behavior: 'Catalogs everything. Hates surprises, loves a good footnote.',
    selfP: 'I', otherP: 'you', tone: 'Dry, precise, secretly fond.',
    sample: '"North is a rumour today. Stay close and try not to die scenically."',
    anchor: '1girl, cartographer, rolled maps, freckles, lantern glow', neg: 'blurry, deformed',
    outfit: 'Vest of map-pockets, brass compass, rolled charts', mode: 'anime' },
  { id: 'vorst', name: 'Lord Vorst', role: 'Antagonist', color: 'coral', initial: 'V',
    appearance: 'Tall, immaculate, a voice like cooling iron.',
    bio: 'The Ash Baron who sells shelter from the fall — at a price measured in years.',
    skill: 'Bargains bound in soot-ink; words that bite.',
    mindset: 'Order at any cost. Believes mercy is just slow ruin.',
    behavior: 'Never raises his voice. Smiles before the worst of it.',
    selfP: 'one', otherP: 'child', tone: 'Cold, courtly, patient.',
    sample: '"I am not your enemy, child. I am simply the bill that always comes due."',
    anchor: '1man, ash-baron, black lacquer armor, candlelight', neg: 'cartoonish, smiling teeth',
    outfit: 'Lacquered black coat, signet of cold iron', mode: 'photoreal' },
  { id: 'sela', name: 'Old Sela', role: 'Mentor', color: 'mint', initial: 'S',
    appearance: 'Stooped and bright-eyed, hands forever warm.',
    bio: 'Keeper of the Last Hearth, the only flame the ash has never smothered.',
    skill: 'Hearth-binding; remembers fires long dead.',
    mindset: 'Patience as a kind of stubbornness.',
    behavior: 'Answers questions with tea and riddles.',
    selfP: 'I', otherP: 'little spark', tone: 'Gentle, teasing, ancient.',
    sample: '"A fire isn\'t brave, little spark. It just refuses to be talked out of burning."',
    anchor: 'old woman, hearthkeeper, shawl, warm firelight', neg: 'young, glamorous',
    outfit: 'Layered shawls, hearth-iron pendant', mode: 'anime' },
  { id: 'tam', name: 'Tam Vale', role: 'Support', color: 'sun', initial: 'T',
    appearance: 'All elbows and enthusiasm, a smear of charcoal on his cheek.',
    bio: 'Mira\'s younger brother; collects rumours and broken clockwork.',
    skill: 'Tinkering — can fix (or worsen) anything mechanical.',
    mindset: 'Certain everything will be fine, against all evidence.',
    behavior: 'Talks with his hands. Names every gadget.',
    selfP: 'I', otherP: 'you', tone: 'Bouncy, loyal, easily distracted.',
    sample: '"I call her Gertrude. She only explodes a little now!"',
    anchor: 'young boy, goggles, brass gadgets, cheerful', neg: 'gritty, somber',
    outfit: 'Oversized goggles, tool-belt, patched jacket', mode: 'anime' },
  { id: 'warden', name: 'The Warden', role: 'Minor', color: 'slate', initial: 'W',
    appearance: 'A silhouette of stone and slow-moving light.',
    bio: 'An ancient guardian that wakes only when the ash runs deepest.',
    skill: 'Unmaking — returns things to the quiet they came from.',
    mindset: 'Beyond want. Keeps a promise older than language.',
    behavior: 'Speaks rarely, and the ground listens when it does.',
    selfP: 'we', otherP: 'small flame', tone: 'Vast, tectonic, unhurried.',
    sample: '"We have slept through kinder centuries. Do not make us sorry to wake."',
    anchor: 'stone guardian, glowing seams, monumental', neg: 'cute, small',
    outfit: 'Living stone, moss-lit runes', mode: 'photoreal' },
];

export const PLOT: Plot = {
  genre: 'Hopepunk fantasy with a slow-burning mystery.',
  theme: 'What we choose to keep warm when the world tells us to let it go cold.',
  premise: 'When ash begins to fall and snuff out every flame on the continent, a young ember-mage discovers she is the last fire the sky cannot smother — and the only currency the Ash Baron cannot buy.',
  plot: "Act I: Kaelen flees the cinder-monks after her spark refuses to die. Act II: She and Mira map a path to the Last Hearth while Vorst's bargains close around their friends. Act III: Waking the Warden costs more than anyone wants to pay; Kaelen learns the fall can be ended, but not without a flame given freely.",
  rules: 'Fire is memory made visible. Ash erases — flame remembers. Bargains written in soot-ink are physically binding. The deeper the ash, the closer the Warden to waking.',
  style: 'Warm, sensory, present-tense in moments of danger. Short sentences when the fire is low. Let silences breathe.',
  vocab: 'ashfall, ember, cinder, hearth, soot-ink, the Reach, banked, kindle, smother, the Last Hearth',
  donts: 'No grimdark nihilism. No flame metaphors that turn purple. Avoid prophecy clichés. Vorst is never cartoonish — he is reasonable, which is the horror.',
};

export const CHAPTERS: Chapter[] = [
  { id: 'c1', title: 'The Ashfall', words: 2180, status: 'done',
    body: `The first flake of ash landed on Kaelen's tongue like a word she wasn't allowed to say.\n\nAround her the cinder-monks went still, their candles guttering one by one, as if the dark had learned their names. Only the flame in her cupped hands refused to listen. It leaned toward her, stubborn and gold, and would not go out.\n\n"Smother it," Brother Pell whispered. "Before it tells the sky where we are."` },
  { id: 'c2', title: 'Crossing the Reach', words: 1940, status: 'done',
    body: `Mira's maps were lying again.\n\n"North is a rumour today," she said, folding a chart that no longer matched the hills. "Stay close, ember-girl, and try not to die scenically."\n\nThe Reach stretched grey before them, an ocean of fallen ash that drank footprints whole.` },
  { id: 'c3', title: "Vorst's Bargain", words: 2140, status: 'draft',
    body: `Lord Vorst did not rise when they entered. He simply set down his pen, and the soot-ink on the page kept moving without him.\n\n"I am not your enemy, child," he said. "I am the bill that always comes due."` },
  { id: 'c4', title: 'Embers', words: 860, status: 'draft',
    body: `Tam got the lantern working on the third try, which he insisted was the first try that counted.\n\n"I call her Gertrude," he said proudly. "She only explodes a little now."` },
  { id: 'c5', title: 'The Warden Wakes', words: 0, status: 'empty', body: '' },
];

export const EVENTS: TimelineEvent[] = [
  { when: 'Day 0', title: 'The first ashfall', detail: "Kaelen's flame refuses to die; the monks turn on her.", chapter: 'c1', color: 'grape' },
  { when: 'Day 3', title: 'Into the Reach', detail: 'Kaelen and Mira cross the grey waste together.', chapter: 'c2', color: 'sky' },
  { when: 'Day 8', title: "Vorst's bargain", detail: 'A soot-ink deal binds one of their own.', chapter: 'c3', color: 'coral' },
  { when: 'Week 3', title: 'Embers rekindled', detail: 'Tam restores the old hearth-lantern; hope returns.', chapter: 'c4', color: 'sun' },
  { when: 'Week 5', title: 'The Warden wakes', detail: 'The ash runs deepest; ancient stone stirs.', chapter: 'c5', color: 'slate' },
];

// ---- Timeline digest: จุดเปลี่ยนรายบท (ch = เลขบท 1-based ตามลำดับ CHAPTERS) ----
// "introduced by" = บทแรกที่ตัวละครมี beat → ค่อยๆ โผล่ทีละบท
export const ARCS: Record<string, ArcBeat[]> = {
  kaelen: [
    { ch: 1, kind: 'status', label: 'Outcast', why: 'The cinder-monks turn on her when her flame refuses to die.' },
    { ch: 1, kind: 'skill', label: 'Ember-shaping' },
    { ch: 1, kind: 'look', label: 'Patched travel coat', sub: 'outfit' },
    { ch: 2, kind: 'mindset', label: 'Wary hope', why: 'Learning to lean on Mira out on the Reach.' },
    { ch: 3, kind: 'mindset', label: 'Defiant', why: "Refuses Vorst's soot-ink bargain." },
    { ch: 5, kind: 'milestone', label: 'Wakes the Warden', why: 'Pays the price to stir the ancient stone.' },
  ],
  mira: [
    { ch: 2, kind: 'skill', label: 'Ley-line reading' },
    { ch: 2, kind: 'status', label: 'Guide' },
    { ch: 3, kind: 'mindset', label: 'Torn', why: "Vorst's deal closes around her brother." },
    { ch: 4, kind: 'look', label: 'Map-pocket vest', sub: 'outfit' },
  ],
  vorst: [
    { ch: 3, kind: 'status', label: 'Ash Baron' },
    { ch: 3, kind: 'milestone', label: 'Seals the soot-ink bargain', why: 'Binds one of the company by contract.' },
    { ch: 3, kind: 'look', label: 'Lacquered black coat', sub: 'outfit' },
  ],
  sela: [
    { ch: 4, kind: 'status', label: 'Hearthkeeper' },
    { ch: 4, kind: 'skill', label: 'Hearth-binding' },
  ],
  tam: [
    { ch: 3, kind: 'status', label: 'Bound by debt', why: "Vorst's bargain falls on his shoulders." },
    { ch: 4, kind: 'skill', label: 'Tinkering' },
    { ch: 4, kind: 'milestone', label: 'Restores the hearth-lantern', why: 'Hope flickers back to life.' },
  ],
  warden: [
    { ch: 5, kind: 'status', label: 'Waking' },
    { ch: 5, kind: 'milestone', label: 'Stirs awake', why: 'Rouses when the ash runs deepest.' },
  ],
};

// จุดเปลี่ยนความสัมพันธ์รายบท (อ้างอิง RELATIONS[].id)
export const REL_BEATS: Record<string, RelBeat[]> = {
  r1: [{ ch: 2, type: 'allies', intensity: 40 }, { ch: 4, type: 'allies', intensity: 72 }],
  r2: [{ ch: 3, type: 'rivals', intensity: -55 }],
  r3: [{ ch: 4, type: 'mentored by', intensity: 50 }],
  r4: [{ ch: 3, type: 'sibling', intensity: 65 }],
  r5: [{ ch: 3, type: 'employs', intensity: -30 }],
  r6: [{ ch: 4, type: 'keeps watch', intensity: 35 }],
};

// ความสำคัญของเหตุการณ์ (อ้างอิง chapter id)
export const EVENT_IMP: Record<string, EventImportance> = {
  c1: 'pivotal', c2: 'minor', c3: 'major', c4: 'minor', c5: 'pivotal',
};

export const RELATIONS: Relation[] = [
  { id: 'r1', from: 'kaelen', to: 'mira', type: 'allies', feeling: 'Wary trust warming into something steadier.' },
  { id: 'r2', from: 'kaelen', to: 'vorst', type: 'rivals', feeling: 'He wants to own her flame; she refuses to be spent.' },
  { id: 'r3', from: 'kaelen', to: 'sela', type: 'mentored by', feeling: 'Sela sees the spark Kaelen is afraid of.' },
  { id: 'r4', from: 'mira', to: 'tam', type: 'sibling', feeling: 'Fiercely protective; endlessly exasperated.' },
  { id: 'r5', from: 'vorst', to: 'tam', type: 'employs', feeling: "Holds Tam's debt as leverage over Mira." },
  { id: 'r6', from: 'sela', to: 'warden', type: 'keeps watch', feeling: 'Sela alone remembers why it sleeps.' },
];

export const NODE_POS: Record<string, NodePos> = {
  kaelen: { x: 300, y: 120 }, mira: { x: 520, y: 90 }, vorst: { x: 560, y: 300 },
  sela: { x: 150, y: 280 }, tam: { x: 360, y: 340 }, warden: { x: 120, y: 120 },
};

export const LOCATIONS: Location[] = [
  { id: 'l1', name: 'The Cinder Wastes', zone: 'Frontier', color: 'slate', mood: 'Desolate, hushed', desc: 'An endless grey sea of fallen ash that swallows sound and footprints alike.' },
  { id: 'l2', name: "Vale's Map-house", zone: 'Haven', color: 'sky', mood: 'Cozy, cluttered', desc: 'A leaning tower of charts and lantern-light where Mira and Tam grew up.' },
  { id: 'l3', name: "Vorst's Keep", zone: 'Stronghold', color: 'coral', mood: 'Cold, immaculate', desc: 'Black lacquer halls where every comfort comes with a contract.' },
  { id: 'l4', name: 'The Last Hearth', zone: 'Sanctum', color: 'mint', mood: 'Warm, sacred', desc: 'The one flame the ash has never smothered, tended by Old Sela.' },
  { id: 'l5', name: 'The Reach', zone: 'Frontier', color: 'sun', mood: 'Vast, shifting', desc: 'A borderland that rearranges itself daily beneath the falling ash.' },
];

export const LOGS: AILog[] = [
  { id: 1, time: '14:02:11', endpoint: '/continue', provider: 'NovelAI', model: 'kayra-v1', status: 'ok', ms: 1240 },
  { id: 2, time: '13:51:48', endpoint: '/review', provider: 'OpenAI', model: 'gpt-4o', status: 'ok', ms: 880 },
  { id: 3, time: '13:44:02', endpoint: '/summary', provider: 'Claude', model: 'sonnet-4', status: 'ok', ms: 610 },
  { id: 4, time: '13:30:19', endpoint: '/continue', provider: 'NovelAI', model: 'kayra-v1', status: 'error', ms: 0 },
  { id: 5, time: '13:12:55', endpoint: '/scene-prompt', provider: 'Claude', model: 'sonnet-4', status: 'ok', ms: 420 },
  { id: 6, time: '12:58:03', endpoint: '/review', provider: 'OpenAI', model: 'gpt-4o', status: 'ok', ms: 1015 },
];
