import { GRANDMASTER_PRESETS } from './chess-players';

export interface StoredPlayerStats {
  wins: number;
  losses: number;
  draws: number;
  lastWinAt: number | null;
}

export interface LeaderboardEntry {
  id: string;
  fullName: string;
  shortName: string;
  styleTag: string;
  baseElo: number;
  elo: number;
  wins: number;
  losses: number;
  draws: number;
  lastWinAt: number | null;
}

const STORAGE_KEY = 'gm_chess_leaderboard_v1';
export const WIN_ELO_STEP = 150;

function readRawStats(): Record<string, StoredPlayerStats> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, Partial<StoredPlayerStats>>;
    if (!parsed || typeof parsed !== 'object') return {};
    const out: Record<string, StoredPlayerStats> = {};
    for (const [id, entry] of Object.entries(parsed)) {
      if (!entry || typeof entry !== 'object') continue;
      out[id] = {
        wins: typeof entry.wins === 'number' && entry.wins >= 0 ? Math.floor(entry.wins) : 0,
        losses: typeof entry.losses === 'number' && entry.losses >= 0 ? Math.floor(entry.losses) : 0,
        draws: typeof entry.draws === 'number' && entry.draws >= 0 ? Math.floor(entry.draws) : 0,
        lastWinAt: typeof entry.lastWinAt === 'number' ? entry.lastWinAt : null,
      };
    }
    return out;
  } catch {
    return {};
  }
}

export function buildLeaderboardEntries(raw: Record<string, StoredPlayerStats>): LeaderboardEntry[] {
  const entries = GRANDMASTER_PRESETS.map((gm) => {
    const s = raw[gm.id] || { wins: 0, losses: 0, draws: 0, lastWinAt: null };
    const elo = gm.elo + s.wins * WIN_ELO_STEP;
    return {
      id: gm.id,
      fullName: gm.fullName,
      shortName: gm.shortName,
      styleTag: gm.styleTag,
      baseElo: gm.elo,
      elo,
      wins: s.wins,
      losses: s.losses,
      draws: s.draws,
      lastWinAt: s.lastWinAt,
    };
  });

  // Sort strictly highest Elo (which directly reflects higher wins) at the top
  entries.sort((a, b) => {
    if (b.elo !== a.elo) return b.elo - a.elo;
    if (b.wins !== a.wins) return b.wins - a.wins;
    return a.fullName.localeCompare(b.fullName);
  });

  return entries;
}

const SERVER_SNAPSHOT: LeaderboardEntry[] = buildLeaderboardEntries({});
let cachedRawJson: string | null | undefined;
let cachedEntries: LeaderboardEntry[] = SERVER_SNAPSHOT;
const listeners = new Set<() => void>();

function notifyListeners() {
  for (const listener of listeners) listener();
}

function writeRawStats(stats: Record<string, StoredPlayerStats>) {
  if (typeof window === 'undefined') return;
  try {
    const json = JSON.stringify(stats);
    window.localStorage.setItem(STORAGE_KEY, json);
    cachedRawJson = json;
    cachedEntries = buildLeaderboardEntries(stats);
  } catch {
    // Ignore storage quota or private browsing errors
  }
  notifyListeners();
}

export function subscribeLeaderboard(listener: () => void): () => void {
  listeners.add(listener);
  if (typeof window !== 'undefined') {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
        cachedRawJson = undefined;
        listener();
      }
    };
    window.addEventListener('storage', onStorage);
    return () => {
      listeners.delete(listener);
      window.removeEventListener('storage', onStorage);
    };
  }
  return () => {
    listeners.delete(listener);
  };
}

export function getLeaderboardSnapshot(): LeaderboardEntry[] {
  if (typeof window === 'undefined') return SERVER_SNAPSHOT;
  let currentRaw: string | null = null;
  try {
    currentRaw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return SERVER_SNAPSHOT;
  }
  if (cachedRawJson !== currentRaw) {
    cachedRawJson = currentRaw;
    cachedEntries = buildLeaderboardEntries(readRawStats());
  }
  return cachedEntries;
}

export function getLeaderboardServerSnapshot(): LeaderboardEntry[] {
  return SERVER_SNAPSHOT;
}

export function recordLeaderboardMatch(
  winnerPresetId: string | null,
  loserPresetId: string | null,
  isDraw: boolean,
  whitePresetId: string,
  blackPresetId: string
): LeaderboardEntry[] {
  const raw = readRawStats();
  const ensure = (id: string): StoredPlayerStats => {
    if (!raw[id]) {
      raw[id] = { wins: 0, losses: 0, draws: 0, lastWinAt: null };
    }
    return raw[id];
  };

  if (isDraw) {
    ensure(whitePresetId).draws += 1;
    if (blackPresetId !== whitePresetId) {
      ensure(blackPresetId).draws += 1;
    }
  } else if (winnerPresetId && loserPresetId) {
    const winner = ensure(winnerPresetId);
    winner.wins += 1;
    winner.lastWinAt = Date.now();
    if (loserPresetId !== winnerPresetId) {
      ensure(loserPresetId).losses += 1;
    }
  }

  writeRawStats(raw);
  return getLeaderboardSnapshot();
}

export function resetLeaderboard(): LeaderboardEntry[] {
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore storage errors
    }
  }
  cachedRawJson = null;
  cachedEntries = SERVER_SNAPSHOT;
  notifyListeners();
  return cachedEntries;
}
