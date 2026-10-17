/**
 * FSRS-4.5 scheduler (optional, additive).
 * Default app scheduler remains Leitner (box 1..5). This module is used only
 * when studyPrefs.srs === "fsrs". Algorithm from open-spaced-repetition.
 */
export type FsrsRating = 1 | 2 | 3 | 4; // again | hard | good | easy
export type FsrsCardState = "new" | "learning" | "review" | "relearning";

export interface FsrsCard {
  stability: number;
  difficulty: number;
  elapsedDays: number;
  scheduledDays: number;
  reps: number;
  lapses: number;
  state: FsrsCardState;
  lastReview: Date | null;
  due: Date;
}

const W = [
  0.4072, 1.1829, 3.1262, 15.4722, 7.2102, 0.5316, 1.5734, 0.0507, 1.507, 0.2151,
  1.4036, 0.2272, 2.8755, 0.2267, 3.2176, 0.1967, 2.887, 0.7517, 0.4702,
];
const DECAY = -0.5;
const FACTOR = 19 / 81;
const REQUEST_RETENTION = 0.9;

export function newFsrsCard(now = new Date()): FsrsCard {
  return {
    stability: 0,
    difficulty: 0,
    elapsedDays: 0,
    scheduledDays: 0,
    reps: 0,
    lapses: 0,
    state: "new",
    lastReview: null,
    due: now,
  };
}

function constrainD(d: number) {
  return Math.min(10, Math.max(1, d));
}
function initStability(r: FsrsRating) {
  return Math.max(0.1, W[r - 1]);
}
function initDifficulty(r: FsrsRating) {
  return constrainD(W[4] - Math.exp(W[5] * (r - 1)) + 1);
}
function nextDifficulty(d: number, r: FsrsRating) {
  const next = d - W[6] * (r - 3);
  return constrainD(W[7] * initDifficulty(3) + (1 - W[7]) * next);
}
function retrievability(elapsed: number, stability: number) {
  return Math.pow(1 + (FACTOR * elapsed) / Math.max(stability, 0.1), DECAY);
}
function nextStability(d: number, s: number, r: number, rating: FsrsRating) {
  const hardPen = rating === 2 ? W[15] : 1;
  const easyBon = rating === 4 ? W[16] : 1;
  const next =
    s *
    (1 +
      Math.exp(W[8]) *
        (11 - d) *
        Math.pow(s, -W[9]) *
        (Math.exp((1 - r) * W[10]) - 1) *
        hardPen *
        easyBon);
  return Math.max(0.1, next);
}
function nextForgetStability(d: number, s: number, r: number) {
  return Math.max(
    0.1,
    W[11] * Math.pow(d, -W[12]) * (Math.pow(s + 1, W[13]) - 1) * Math.exp((1 - r) * W[14])
  );
}
function nextInterval(stability: number) {
  const ivl = (stability / FACTOR) * (Math.pow(REQUEST_RETENTION, 1 / DECAY) - 1);
  return Math.min(36500, Math.max(1, Math.round(ivl)));
}

export function fsrsSchedule(card: FsrsCard, rating: FsrsRating, now = new Date()): FsrsCard {
  const last = card.lastReview ?? now;
  const elapsed =
    card.state === "new" ? 0 : Math.max(0, (now.getTime() - last.getTime()) / 86_400_000);

  let { stability, difficulty, reps, lapses, state } = card;

  if (state === "new") {
    stability = initStability(rating);
    difficulty = initDifficulty(rating);
    reps = 1;
    state = rating === 1 ? "learning" : "review";
    if (rating === 1) lapses = 1;
  } else {
    const r = retrievability(elapsed, Math.max(stability, 0.1));
    difficulty = nextDifficulty(difficulty || initDifficulty(3), rating);
    reps += 1;
    if (rating === 1) {
      lapses += 1;
      stability = nextForgetStability(difficulty, stability, r);
      state = "relearning";
    } else {
      stability = nextStability(difficulty, stability, r, rating);
      state = "review";
    }
  }

  let scheduledDays: number;
  if (state === "learning" || state === "relearning") {
    scheduledDays = rating === 1 ? 0 : rating === 2 ? 1 : nextInterval(stability);
  } else {
    scheduledDays = nextInterval(stability);
  }
  if (rating === 1) scheduledDays = 0; // again → later today (10 min)
  const due =
    rating === 1
      ? new Date(now.getTime() + 10 * 60 * 1000)
      : new Date(now.getTime() + scheduledDays * 86_400_000);

  return {
    stability,
    difficulty,
    elapsedDays: elapsed,
    scheduledDays: rating === 1 ? 10 / (24 * 60) : scheduledDays,
    reps,
    lapses,
    state,
    lastReview: now,
    due,
  };
}

export function ratingFromLabel(s: string): FsrsRating {
  if (s === "again" || s === "wrong" || s === "1") return 1;
  if (s === "hard" || s === "2") return 2;
  if (s === "good" || s === "correct" || s === "3") return 3;
  return 4;
}
