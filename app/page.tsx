'use client';

import React, { useCallback, useRef, useState, useSyncExternalStore } from 'react';
import ChessScene3D, { type ChessSceneControls, type HudSnapshot } from '@/components/ChessScene3D';
import ChessHUD from '@/components/ChessHUD';
import type { PieceColor } from '@/lib/chess-engine';
import {
  getLeaderboardServerSnapshot,
  getLeaderboardSnapshot,
  recordLeaderboardMatch,
  resetLeaderboard,
  subscribeLeaderboard,
  WIN_ELO_STEP,
} from '@/lib/chess-leaderboard';
import { getGrandmasterById } from '@/lib/chess-players';

const INITIAL_HUD: HudSnapshot = {
  status: 'ready',
  whiteTime: 600,
  blackTime: 600,
  activeClock: 'w',
  turnText: 'Press Start to play',
  gameOverReason: '',
  outcomeTitle: '',
  outcomeDetail: '',
  isCheck: false,
  whiteName: 'Fischer',
  blackName: 'Carlsen',
  whitePresetId: 'fischer',
  blackPresetId: 'carlsen',
  board: Array.from({ length: 8 }, () => Array(8).fill(null)),
  history: [],
  qualities: [],
  lastQuality: null,
  bestMoves: [],
  showBestArrows: false,
  lastMatchResult: null,
};

export default function HomePage() {
  const [hud, setHud] = useState<HudSnapshot>(INITIAL_HUD);
  const [streaks, setStreaks] = useState<{ fischer: number; carlsen: number }>({
    fischer: 0,
    carlsen: 0,
  });
  const [manualWhiteElo, setManualWhiteElo] = useState<number | null>(null);
  const [manualBlackElo, setManualBlackElo] = useState<number | null>(null);

  const manualWhiteEloRef = useRef<number | null>(null);
  const manualBlackEloRef = useRef<number | null>(null);
  const controlsRef = useRef<ChessSceneControls | null>(null);
  const processedMatchIdRef = useRef<number>(0);

  const leaderboard = useSyncExternalStore(
    subscribeLeaderboard,
    getLeaderboardSnapshot,
    getLeaderboardServerSnapshot
  );

  const whiteLeaderboardElo =
    leaderboard.find((e) => e.id === hud.whitePresetId)?.elo ??
    getGrandmasterById(hud.whitePresetId).elo;
  const blackLeaderboardElo =
    leaderboard.find((e) => e.id === hud.blackPresetId)?.elo ??
    getGrandmasterById(hud.blackPresetId).elo;

  const whiteElo = manualWhiteElo ?? whiteLeaderboardElo;
  const blackElo = manualBlackElo ?? blackLeaderboardElo;

  const handleWhiteEloChange = useCallback((val: number) => {
    manualWhiteEloRef.current = val;
    setManualWhiteElo(val);
    controlsRef.current?.setWhiteElo(val);
  }, []);

  const handleBlackEloChange = useCallback((val: number) => {
    manualBlackEloRef.current = val;
    setManualBlackElo(val);
    controlsRef.current?.setBlackElo(val);
  }, []);

  const handleSelectPlayer = useCallback((side: PieceColor, presetId: string) => {
    controlsRef.current?.replacePlayer(side, presetId);
    if (side === 'w') {
      manualWhiteEloRef.current = null;
      setManualWhiteElo(null);
    } else {
      manualBlackEloRef.current = null;
      setManualBlackElo(null);
    }
  }, []);

  const handleSwapSides = useCallback(() => {
    const curW = hud.whitePresetId;
    const curB = hud.blackPresetId;
    controlsRef.current?.replacePlayer('w', curB);
    controlsRef.current?.replacePlayer('b', curW);

    const prevManualW = manualWhiteEloRef.current;
    const prevManualB = manualBlackEloRef.current;
    manualWhiteEloRef.current = prevManualB;
    manualBlackEloRef.current = prevManualW;
    setManualWhiteElo(prevManualB);
    setManualBlackElo(prevManualW);

    if (prevManualB !== null) {
      controlsRef.current?.setWhiteElo(prevManualB);
    }
    if (prevManualW !== null) {
      controlsRef.current?.setBlackElo(prevManualW);
    }
  }, [hud.whitePresetId, hud.blackPresetId]);

  const handleResetStats = useCallback(() => {
    resetLeaderboard();
    manualWhiteEloRef.current = null;
    manualBlackEloRef.current = null;
    setManualWhiteElo(null);
    setManualBlackElo(null);
    controlsRef.current?.setWhiteElo(getGrandmasterById(hud.whitePresetId).elo);
    controlsRef.current?.setBlackElo(getGrandmasterById(hud.blackPresetId).elo);
  }, [hud.whitePresetId, hud.blackPresetId]);

  const handleHudUpdate = useCallback((snapshot: HudSnapshot) => {
    setHud(snapshot);
    const res = snapshot.lastMatchResult;
    if (res && res.matchId > processedMatchIdRef.current) {
      processedMatchIdRef.current = res.matchId;
      setStreaks((prev) => {
        const next = { ...prev };
        if (res.isDraw) {
          if (res.whitePresetId === 'fischer' || res.blackPresetId === 'fischer') next.fischer = 0;
          if (res.whitePresetId === 'carlsen' || res.blackPresetId === 'carlsen') next.carlsen = 0;
        } else {
          if (res.winnerPresetId === 'fischer') next.fischer += 1;
          else if (res.loserPresetId === 'fischer') next.fischer = 0;

          if (res.winnerPresetId === 'carlsen') next.carlsen += 1;
          else if (res.loserPresetId === 'carlsen') next.carlsen = 0;
        }
        return next;
      });
      const updatedEntries = recordLeaderboardMatch(
        res.winnerPresetId,
        res.loserPresetId,
        res.isDraw,
        res.whitePresetId,
        res.blackPresetId
      );

      if (!res.isDraw && res.winnerColor) {
        if (res.winnerColor === 'w') {
          if (manualWhiteEloRef.current !== null) {
            const nextElo = manualWhiteEloRef.current + WIN_ELO_STEP;
            manualWhiteEloRef.current = nextElo;
            setManualWhiteElo(nextElo);
            controlsRef.current?.setWhiteElo(nextElo);
          } else {
            const entry = updatedEntries.find((e) => e.id === res.whitePresetId);
            if (entry) controlsRef.current?.setWhiteElo(entry.elo);
          }
        } else {
          if (manualBlackEloRef.current !== null) {
            const nextElo = manualBlackEloRef.current + WIN_ELO_STEP;
            manualBlackEloRef.current = nextElo;
            setManualBlackElo(nextElo);
            controlsRef.current?.setBlackElo(nextElo);
          } else {
            const entry = updatedEntries.find((e) => e.id === res.blackPresetId);
            if (entry) controlsRef.current?.setBlackElo(entry.elo);
          }
        }
      }
    }
  }, []);

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-[#0d0e18]">
      <ChessScene3D onHudUpdate={handleHudUpdate} controlsRef={controlsRef} />
      <ChessHUD
        hud={hud}
        streaks={streaks}
        leaderboard={leaderboard}
        whiteElo={whiteElo}
        blackElo={blackElo}
        onWhiteEloChange={handleWhiteEloChange}
        onBlackEloChange={handleBlackEloChange}
        onSelectPlayer={handleSelectPlayer}
        onSwapSides={handleSwapSides}
        onResetLeaderboard={handleResetStats}
        controlsRef={controlsRef}
      />
    </main>
  );
}
