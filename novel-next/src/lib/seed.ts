// ============ Seed: สร้าง AppState เริ่มต้นจาก mock-data (map → Story shape) ============
// ใช้ตอน DB ยังว่าง เพื่อให้ first-run มีตัวอย่างให้เห็น (เซฟครั้งแรกจะลงจริง)
import type { AppState, Story } from './types';
import { CHARACTERS, PLOT, CHAPTERS, EVENTS, RELATIONS, NODE_POS, LOCATIONS, ARCS, REL_BEATS, EVENT_IMP } from './mock-data';

const SEED_STORY_ID = 'ashfall';

function buildSeedStory(): Story {
  return {
    name: 'The Ashfall Saga',
    genre: PLOT.genre,
    theme: PLOT.theme,
    premise: PLOT.premise,
    plot: PLOT.plot,
    worldRules: PLOT.rules,
    styleGuide: PLOT.style,
    vocabPalette: PLOT.vocab,
    dontList: PLOT.donts,
    characters: CHARACTERS.map((c) => ({
      id: c.id,
      name: c.name,
      role: c.role,
      color: c.color,
      appearance: c.appearance,
      description: c.bio,
      skill: c.skill,
      mindset: c.mindset,
      behavior: c.behavior,
      pronounSelf: c.selfP,
      pronounOther: c.otherP,
      speechTone: c.tone,
      voiceExamples: c.sample,
      arc: ARCS[c.id],
      defaultOutfit: c.outfit,
    })),
    chapters: CHAPTERS.map((c, i) => ({
      id: c.id,
      title: c.title,
      order: i,
      content: c.body,
      status: c.status,
    })),
    timeline: EVENTS.map((e, i) => ({
      id: `e${i + 1}`,
      time: e.when,
      order: i,
      label: e.title,
      description: e.detail,
      chapterId: e.chapter,
      color: e.color,
      importance: EVENT_IMP[e.chapter],
    })),
    locations: LOCATIONS.map((l) => ({
      id: l.id,
      name: l.name,
      zone: l.zone,
      mood: l.mood,
      description: l.desc,
      color: l.color,
    })),
    relations: RELATIONS.map((r) => ({ id: r.id, from: r.from, to: r.to, type: r.type, feeling: r.feeling, beats: REL_BEATS[r.id] })),
    nodePos: { ...NODE_POS },
  };
}

export function seedState(): AppState {
  return { stories: { [SEED_STORY_ID]: buildSeedStory() }, activeStoryId: SEED_STORY_ID };
}

/** สร้างเรื่องเปล่า */
export function emptyStory(name: string): Story {
  return { name, characters: [], chapters: [], timeline: [], locations: [], relations: [], nodePos: {} };
}
