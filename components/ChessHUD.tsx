'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeftRight,
  ArrowUpRight,
  BarChart3,
  ChevronDown,
  ChevronUp,
  Clock,
  Crown,
  Eye,
  EyeOff,
  LayoutGrid,
  Pause,
  Play,
  RotateCcw,
  Scale,
  Trophy,
  Users,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { QUALITY_CONFIG, type PieceColor } from '@/lib/chess-engine';
import type { LeaderboardEntry } from '@/lib/chess-leaderboard';
import { detectChessOpening } from '@/lib/chess-openings';
import { GRANDMASTER_PRESETS } from '@/lib/chess-players';
import { soundEngine } from '@/lib/sound-effects';
import type { ChessSceneControls, HudSnapshot } from './ChessScene3D';
import EloLeaderboardChart from './EloLeaderboardChart';

interface ChessHUDProps {
  hud: HudSnapshot;
  streaks: { fischer: number; carlsen: number };
  leaderboard: LeaderboardEntry[];
  whiteElo: number;
  blackElo: number;
  onWhiteEloChange: (val: number) => void;
  onBlackEloChange: (val: number) => void;
  onSelectPlayer: (side: PieceColor, presetId: string) => void;
  onSwapSides: () => void;
  onResetLeaderboard: () => void;
  controlsRef: React.MutableRefObject<ChessSceneControls | null>;
}

const PIECE_SYMBOLS: Record<string, string> = {
  wp: '♙',
  wn: '♘',
  wb: '♗',
  wr: '♖',
  wq: '♕',
  wk: '♔',
  bp: '♟',
  bn: '♞',
  bb: '♝',
  br: '♜',
  bq: '♛',
  bk: '♚',
};

function formatClock(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function ChessHUD({
  hud,
  streaks,
  leaderboard,
  whiteElo,
  blackElo,
  onWhiteEloChange,
  onBlackEloChange,
  onSelectPlayer,
  onSwapSides,
  onResetLeaderboard,
  controlsRef,
}: ChessHUDProps) {
  const [speed, setSpeed] = useState(1.0);
  const [timeMin, setTimeMin] = useState(10);
  const [muted, setMuted] = useState(false);
  const [crowdAudio, setCrowdAudio] = useState(true);
  const [showBoardDrawer, setShowBoardDrawer] = useState(false);
  const [showEloChart, setShowEloChart] = useState(false);
  const [rosterSide, setRosterSide] = useState<PieceColor | null>(null);
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [hudHidden, setHudHidden] = useState(false);

  const leaderboardById = useMemo(() => {
    const map: Record<string, LeaderboardEntry> = {};
    for (const entry of leaderboard) {
      map[entry.id] = entry;
    }
    return map;
  }, [leaderboard]);

  const sliderMax = Math.max(3200, Math.ceil(Math.max(whiteElo, blackElo) / 150) * 150);

  const opening = useMemo(() => detectChessOpening(hud.history), [hud.history]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'h' || e.key === 'H') {
        setHudHidden((prev) => !prev);
      } else if (e.key === 'Escape') {
        setRosterSide(null);
        setShowEloChart(false);
      } else if (e.key === ' ' && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault();
        controlsRef.current?.startOrTogglePause();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [controlsRef]);

  const toggleMute = () => {
    const next = !muted;
    soundEngine.setMuted(next);
    setMuted(next);
  };

  const toggleCrowdAudio = () => {
    const next = !crowdAudio;
    soundEngine.setCrowdEnabled(next);
    setCrowdAudio(next);
  };

  const handleTimeSelect = (min: number) => {
    if (hud.status !== 'ready') return;
    setTimeMin(min);
    controlsRef.current?.setTimeMinutes(min);
  };

  const handleSpeed = (val: number) => {
    setSpeed(val);
    controlsRef.current?.setSpeed(val);
  };

  const handleSelectGrandmaster = (side: PieceColor, presetId: string) => {
    onSelectPlayer(side, presetId);
    setRosterSide(null);
  };

  const primaryLabel =
    hud.status === 'ready'
      ? 'Start Game'
      : hud.status === 'playing'
        ? 'Pause'
        : hud.status === 'paused'
          ? 'Resume'
          : 'Reset Game';

  const PrimaryIcon =
    hud.status === 'playing' ? Pause : hud.status === 'ended' ? RotateCcw : Play;

  const lastMove = hud.history.length > 0 ? hud.history[hud.history.length - 1] : null;
  const lastQuality = hud.qualities.length > 0 ? hud.qualities[hud.qualities.length - 1] : null;
  const qualityMeta = hud.lastQuality ? QUALITY_CONFIG[hud.lastQuality] : null;

  const statusTag =
    hud.status === 'ready'
      ? 'Ready'
      : hud.status === 'paused'
        ? 'Paused'
        : hud.status === 'ended'
          ? hud.outcomeTitle || 'Game Ended'
          : hud.isCheck
            ? 'In Check'
            : 'Live Match';

  const EndIcon =
    hud.gameOverReason === 'checkmate'
      ? Crown
      : hud.gameOverReason === 'timeout'
        ? Clock
        : Scale;

  return (
    <div className="pointer-events-none fixed inset-0 z-20 flex flex-col justify-between p-3 sm:p-5">
      {/* Top Row: Matchup Info on Left, Clocks & Utility Toggles on Right */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        {!hudHidden ? (
          <div className="pointer-events-auto rounded-xl border border-amber-300/25 bg-[#0d0f1c]/95 px-4 py-2.5 shadow-xl max-w-[min(92vw,480px)]">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-sm sm:text-base font-semibold tracking-tight text-amber-300">
              <span>
                {hud.whiteName} vs {hud.blackName}
              </span>
              <span className="text-slate-500 font-normal" aria-hidden="true">
                ·
              </span>
              <span className="text-xs font-medium text-slate-200">{hud.turnText}</span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-400">
              <span className="text-sky-300 font-medium">
                White: {hud.whiteName} ({whiteElo})
              </span>
              <span aria-hidden="true">·</span>
              <span className="text-amber-200 font-medium">
                Black: {hud.blackName} ({blackElo})
              </span>
              <span aria-hidden="true">·</span>
              <span className="text-slate-300">{statusTag}</span>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px]">
              <span className="text-slate-400">Win Streak</span>
              <span
                title="Fischer session winning streak"
                className="inline-flex items-center gap-1 rounded-md border border-sky-400/30 bg-sky-400/10 px-2 py-0.5 font-semibold text-sky-200 tabular-nums whitespace-nowrap shrink-0"
              >
                <Trophy className="h-3 w-3 text-amber-300" />
                <span>Fischer {streaks.fischer}</span>
              </span>
              <span
                title="Carlsen session winning streak"
                className="inline-flex items-center gap-1 rounded-md border border-amber-300/30 bg-amber-300/10 px-2 py-0.5 font-semibold text-amber-200 tabular-nums whitespace-nowrap shrink-0"
              >
                <Trophy className="h-3 w-3 text-amber-300" />
                <span>Carlsen {streaks.carlsen}</span>
              </span>
            </div>
            {hud.history.length > 0 && (
              <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-300 truncate">
                <span className="font-mono text-[11px] text-amber-300/90 shrink-0">{opening.eco}</span>
                <span aria-hidden="true" className="text-slate-500">·</span>
                <span className="truncate font-medium text-slate-200">{opening.name}</span>
              </div>
            )}
          </div>
        ) : (
          <div />
        )}

        <div className="pointer-events-auto flex items-center gap-2">
          {!hudHidden && (
            <div className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-[#0d0f1c]/95 px-2.5 py-1.5 shadow-xl">
              <div
                className={`rounded-lg px-2.5 py-1 text-center transition-colors ${
                  hud.status === 'playing' && hud.activeClock === 'w'
                    ? 'bg-sky-500/20 border border-sky-400/50'
                    : 'border border-transparent'
                }`}
              >
                <div className="text-[10px] font-medium text-slate-400">{hud.whiteName}</div>
                <div className="font-mono text-sm sm:text-base font-bold tabular-nums text-white">
                  {formatClock(hud.whiteTime)}
                </div>
              </div>
              <div className="h-7 w-px bg-white/10" />
              <div
                className={`rounded-lg px-2.5 py-1 text-center transition-colors ${
                  hud.status === 'playing' && hud.activeClock === 'b'
                    ? 'bg-amber-400/20 border border-amber-300/50'
                    : 'border border-transparent'
                }`}
              >
                <div className="text-[10px] font-medium text-slate-400">{hud.blackName}</div>
                <div className="font-mono text-sm sm:text-base font-bold tabular-nums text-amber-200">
                  {formatClock(hud.blackTime)}
                </div>
              </div>
            </div>
          )}

          {!hudHidden && (
            <button
              type="button"
              onClick={() => setShowBoardDrawer((v) => !v)}
              title="Toggle 2D Board & Moves"
              className={`flex h-10 items-center gap-1.5 rounded-xl border px-3 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                showBoardDrawer
                  ? 'border-amber-300/60 bg-amber-300 text-slate-950'
                  : 'border-white/15 bg-[#0d0f1c]/95 text-slate-200 hover:border-amber-300/40'
              }`}
            >
              <LayoutGrid className="h-4 w-4" />
              <span className="hidden sm:inline">Board</span>
            </button>
          )}

          {!hudHidden && (
            <button
              type="button"
              onClick={() => setShowEloChart((v) => !v)}
              title="Toggle Elo & Wins Leaderboard Chart"
              className={`flex h-10 items-center gap-1.5 rounded-xl border px-3 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                showEloChart
                  ? 'border-amber-300/60 bg-amber-300 text-slate-950'
                  : 'border-white/15 bg-[#0d0f1c]/95 text-slate-200 hover:border-amber-300/40'
              }`}
            >
              <BarChart3 className="h-4 w-4" />
              <span className="hidden sm:inline">Elo Chart</span>
            </button>
          )}

          {!hudHidden && (
            <button
              type="button"
              onClick={toggleCrowdAudio}
              title={crowdAudio ? 'Disable Crowd Sounds' : 'Enable Crowd Sounds'}
              className={`flex h-10 items-center gap-1.5 rounded-xl border px-3 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                crowdAudio && !muted
                  ? 'border-emerald-400/50 bg-emerald-400/15 text-emerald-200 hover:border-emerald-300'
                  : 'border-white/15 bg-[#0d0f1c]/95 text-slate-400 hover:border-white/30'
              }`}
            >
              <Users className="h-4 w-4" />
              <span className="hidden sm:inline">{crowdAudio ? 'Crowd On' : 'Crowd Off'}</span>
            </button>
          )}

          {!hudHidden && (
            <button
              type="button"
              onClick={toggleMute}
              title={muted ? 'Unmute Sound Effects' : 'Mute Sound Effects'}
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/15 bg-[#0d0f1c]/95 text-slate-200 hover:border-amber-300/40 transition-colors cursor-pointer"
            >
              {muted ? <VolumeX className="h-4 w-4 text-rose-400" /> : <Volume2 className="h-4 w-4" />}
            </button>
          )}

          <button
            type="button"
            onClick={() => setHudHidden((v) => !v)}
            title={hudHidden ? 'Show HUD (H)' : 'Hide HUD (H)'}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/15 bg-[#0d0f1c]/95 text-amber-300 hover:border-amber-300/50 transition-colors cursor-pointer"
          >
            {hudHidden ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Clear Non-Blocking Game Status Banner (Checkmate / Stalemate / Draw / Timeout / Paused / Check) */}
      {!hudHidden && (hud.status === 'ended' || hud.status === 'paused' || (hud.status === 'playing' && hud.isCheck) || qualityMeta) && (
        <div className="pointer-events-none self-center mt-2 flex flex-col items-center gap-2">
          {hud.status === 'ended' && (
            <div
              className={`rounded-xl border px-5 py-2.5 text-center shadow-2xl ${
                hud.gameOverReason === 'checkmate' || hud.gameOverReason === 'timeout'
                  ? 'border-amber-300/50 bg-[#0d0f1c]/95 text-amber-200'
                  : 'border-sky-300/45 bg-[#0d0f1c]/95 text-sky-200'
              }`}
            >
              <div className="flex items-center justify-center gap-2 text-sm sm:text-base font-bold tracking-tight">
                <EndIcon className="h-4 w-4 shrink-0" />
                <span>{hud.outcomeTitle || 'Game Ended'}</span>
              </div>
              {hud.outcomeDetail && (
                <div className="mt-0.5 text-xs text-slate-300">{hud.outcomeDetail}</div>
              )}
            </div>
          )}

          {hud.status === 'paused' && (
            <div className="rounded-xl border border-amber-300/40 bg-[#0d0f1c]/95 px-4 py-2 text-center shadow-xl">
              <div className="text-sm font-bold text-amber-300">Game Paused</div>
              <div className="text-xs text-slate-300">Press Resume or Space to continue</div>
            </div>
          )}

          {hud.status === 'playing' && hud.isCheck && (
            <div className="rounded-xl border border-rose-400/50 bg-[#0d0f1c]/95 px-4 py-1.5 text-center shadow-lg">
              <div className="flex items-center justify-center gap-1.5 text-xs font-bold tracking-wider uppercase text-rose-300">
                <AlertTriangle className="h-3.5 w-3.5" />
                <span>Check</span>
              </div>
            </div>
          )}

          {qualityMeta && (
            <div className="rounded-lg px-3 py-1 text-center shadow-lg border border-white/20 bg-[#0d0f1c]/95">
              <span className="text-xl font-bold mr-2" style={{ color: qualityMeta.color }}>
                {qualityMeta.symbol}
              </span>
              <span className="text-xs font-semibold tracking-wider uppercase" style={{ color: qualityMeta.color }}>
                {qualityMeta.label}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Optional Elo & Wins Leaderboard Chart Modal */}
      {!hudHidden && showEloChart && (
        <EloLeaderboardChart
          entries={leaderboard}
          onClose={() => setShowEloChart(false)}
          onResetStats={onResetLeaderboard}
        />
      )}

      {/* Optional Collapsible 2D Board & Moves Drawer */}
      {!hudHidden && showBoardDrawer && !showEloChart && (
        <div className="pointer-events-auto self-end my-auto w-[240px] sm:w-[270px] rounded-2xl border border-amber-300/20 bg-[#0d0f1c]/95 p-3 shadow-2xl">
          <div className="mb-2 flex items-center justify-between text-xs font-semibold text-amber-300">
            <span>2D Board & Moves</span>
            <span className="text-slate-400 font-mono tabular-nums">{hud.history.length} ply</span>
          </div>

          <div className="relative grid grid-cols-8 grid-rows-8 w-full aspect-square rounded-md overflow-hidden border border-amber-300/50">
            {hud.board.map((row, r) =>
              row.map((cell, c) => {
                const isLight = (r + c) % 2 === 0;
                const sqName = String.fromCharCode(97 + c) + (8 - r);
                const isLastDest = lastMove?.to === sqName;
                const badgeCfg = isLastDest && lastQuality ? QUALITY_CONFIG[lastQuality] : null;
                return (
                  <div
                    key={`${r}-${c}`}
                    className={`relative flex items-center justify-center text-sm leading-none ${
                      isLight ? 'bg-[#e8d9b8]' : 'bg-[#8b6f4e]'
                    } ${isLastDest ? 'ring-1 ring-inset ring-amber-400' : ''}`}
                  >
                    {cell && (
                      <span
                        className={
                          cell.color === 'w'
                            ? 'text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.95)]'
                            : 'text-zinc-900 drop-shadow-[0_0_1px_rgba(255,255,255,0.6)]'
                        }
                      >
                        {PIECE_SYMBOLS[cell.color + cell.type]}
                      </span>
                    )}
                    {badgeCfg && (
                      <span
                        className="absolute top-0 right-0 rounded-bl px-0.5 text-[7px] font-bold text-white leading-tight"
                        style={{ backgroundColor: badgeCfg.bg }}
                      >
                        {badgeCfg.symbol}
                      </span>
                    )}
                  </div>
                );
              })
            )}

            {hud.showBestArrows && hud.bestMoves.length > 0 && (
              <svg
                viewBox="0 0 800 800"
                className="pointer-events-none absolute inset-0 h-full w-full"
                aria-hidden="true"
              >
                <defs>
                  <marker
                    id="best-arrow-0"
                    markerWidth="4.5"
                    markerHeight="4.5"
                    refX="2.8"
                    refY="2.25"
                    orient="auto"
                  >
                    <polygon points="0 0, 4.5 2.25, 0 4.5" fill="#22c55e" />
                  </marker>
                  <marker
                    id="best-arrow-1"
                    markerWidth="4"
                    markerHeight="4"
                    refX="2.5"
                    refY="2"
                    orient="auto"
                  >
                    <polygon points="0 0, 4 2, 0 4" fill="#38bdf8" />
                  </marker>
                </defs>
                {hud.bestMoves.map((bm, idx) => {
                  const fc = bm.from.charCodeAt(0) - 97;
                  const fr = 8 - parseInt(bm.from[1], 10);
                  const tc = bm.to.charCodeAt(0) - 97;
                  const tr = 8 - parseInt(bm.to[1], 10);
                  const x1 = (fc + 0.5) * 100;
                  const y1 = (fr + 0.5) * 100;
                  const x2 = (tc + 0.5) * 100;
                  const y2 = (tr + 0.5) * 100;
                  const dx = x2 - x1;
                  const dy = y2 - y1;
                  const len = Math.hypot(dx, dy) || 1;
                  const sx = x1 + (dx / len) * 16;
                  const sy = y1 + (dy / len) * 16;
                  const ex = x2 - (dx / len) * 20;
                  const ey = y2 - (dy / len) * 20;
                  return (
                    <line
                      key={`${bm.from}-${bm.to}`}
                      x1={sx}
                      y1={sy}
                      x2={ex}
                      y2={ey}
                      stroke={idx === 0 ? '#22c55e' : '#38bdf8'}
                      strokeOpacity={idx === 0 ? 0.92 : 0.78}
                      strokeWidth={idx === 0 ? 16 : 12}
                      strokeLinecap="round"
                      markerEnd={`url(#best-arrow-${idx === 0 ? 0 : 1})`}
                    />
                  );
                })}
              </svg>
            )}
          </div>

          <div className="mt-2.5 border-b border-white/10 pb-2">
            <div className="flex items-center justify-between gap-2 text-[11px] text-slate-400">
              <span>Opening</span>
              <span className="font-mono tabular-nums text-amber-300/90">{opening.eco}</span>
            </div>
            <div className="mt-0.5 truncate text-xs font-semibold text-slate-100" title={opening.name}>
              {opening.name}
            </div>
            {hud.showBestArrows && hud.bestMoves.length > 0 && (
              <div className="mt-1 flex items-center gap-1.5 text-[11px] text-emerald-300 font-mono tabular-nums truncate">
                <span>Best:</span>
                <span>{hud.bestMoves.map((m) => m.san).join(' · ')}</span>
              </div>
            )}
          </div>

          <div className="custom-scrollbar mt-2 max-h-28 overflow-y-auto space-y-1 text-xs font-mono tabular-nums">
            {hud.history.length === 0 ? (
              <div className="py-2 text-center text-slate-500 italic">No moves yet</div>
            ) : (
              Array.from({ length: Math.ceil(hud.history.length / 2) }).map((_, pairIdx) => {
                const w = hud.history[pairIdx * 2];
                const b = hud.history[pairIdx * 2 + 1];
                const wq = hud.qualities[pairIdx * 2] ? QUALITY_CONFIG[hud.qualities[pairIdx * 2]] : null;
                const bq = hud.qualities[pairIdx * 2 + 1]
                  ? QUALITY_CONFIG[hud.qualities[pairIdx * 2 + 1]]
                  : null;
                return (
                  <div
                    key={pairIdx}
                    className="grid grid-cols-[24px_1fr_1fr] items-center gap-1 rounded bg-white/5 px-1.5 py-0.5"
                  >
                    <span className="text-slate-500">{pairIdx + 1}.</span>
                    <span className="truncate font-semibold" style={{ color: wq ? wq.color : '#fff' }}>
                      {w ? `${w.san}${wq ? ' ' + wq.symbol : ''}` : ''}
                    </span>
                    <span
                      className="truncate font-semibold"
                      style={{ color: bq ? bq.color : '#fcd34d' }}
                    >
                      {b ? `${b.san}${bq ? ' ' + bq.symbol : ''}` : ''}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Bottom Collapsible Unified Control Dock (Start/Pause/Reset + Replace Players + Sliders) */}
      {!hudHidden && (
        <div className="relative flex flex-col items-center">
          {/* Grandmaster Roster Popover (Non-blocking, anchored directly above bottom dock) */}
          {rosterSide !== null && !dockCollapsed && (
            <div className="pointer-events-auto mb-2 w-full max-w-[680px] rounded-2xl border border-amber-300/30 bg-[#0d0f1c]/98 p-3.5 shadow-2xl">
              <div className="mb-2.5 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setRosterSide('w')}
                    className={`rounded-lg px-3 py-1 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      rosterSide === 'w'
                        ? 'bg-sky-400 text-slate-950'
                        : 'bg-white/5 text-slate-300 hover:bg-white/10'
                    }`}
                  >
                    White: {hud.whiteName}
                  </button>
                  <button
                    type="button"
                    onClick={() => setRosterSide('b')}
                    className={`rounded-lg px-3 py-1 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      rosterSide === 'b'
                        ? 'bg-amber-300 text-slate-950'
                        : 'bg-white/5 text-slate-300 hover:bg-white/10'
                    }`}
                  >
                    Black: {hud.blackName}
                  </button>
                  <button
                    type="button"
                    onClick={onSwapSides}
                    title="Swap White and Black players"
                    className="flex items-center gap-1 rounded-lg border border-white/15 bg-white/5 px-2.5 py-1 text-xs font-medium text-slate-200 hover:border-amber-300/40 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <ArrowLeftRight className="h-3.5 w-3.5" />
                    <span>Swap Sides</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setRosterSide(null)}
                  title="Close player selector"
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-white/10 hover:text-white cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {GRANDMASTER_PRESETS.map((gm) => {
                  const isActive =
                    rosterSide === 'w' ? hud.whitePresetId === gm.id : hud.blackPresetId === gm.id;
                  const currentElo = leaderboardById[gm.id]?.elo ?? gm.elo;
                  return (
                    <button
                      key={gm.id}
                      type="button"
                      onClick={() => handleSelectGrandmaster(rosterSide, gm.id)}
                      className={`rounded-xl border px-3 py-2 text-left transition-colors cursor-pointer ${
                        isActive
                          ? rosterSide === 'w'
                            ? 'border-sky-400 bg-sky-500/20 text-white'
                            : 'border-amber-300 bg-amber-300/20 text-white'
                          : 'border-white/10 bg-white/5 text-slate-200 hover:border-white/30 hover:bg-white/10'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-xs font-bold truncate">{gm.fullName}</span>
                        <span className="text-[11px] font-mono tabular-nums text-amber-300 shrink-0">
                          {currentElo}
                        </span>
                      </div>
                      <div className="mt-0.5 text-[11px] text-slate-400 truncate">{gm.styleTag}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={() => {
              setDockCollapsed((c) => !c);
              setRosterSide(null);
            }}
            className="pointer-events-auto mb-1 flex items-center gap-1 rounded-t-lg border border-b-0 border-white/15 bg-[#0d0f1c]/95 px-3 py-1 text-[11px] font-medium text-slate-300 hover:text-amber-300 transition-colors cursor-pointer"
          >
            {dockCollapsed ? (
              <>
                <ChevronUp className="h-3.5 w-3.5" />
                <span>Show Controls</span>
              </>
            ) : (
              <>
                <ChevronDown className="h-3.5 w-3.5" />
                <span>Hide Controls</span>
              </>
            )}
          </button>

          {!dockCollapsed && (
            <div className="pointer-events-auto w-full max-w-[980px] rounded-2xl border border-amber-300/20 bg-[#0d0f1c]/95 px-4 py-3 shadow-2xl">
              <div className="flex flex-wrap items-center justify-between gap-3">
                {/* Primary Start / Pause / Resume / Reset & Replace Players */}
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => controlsRef.current?.startOrTogglePause()}
                    className={`flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-bold transition-transform active:scale-95 whitespace-nowrap shrink-0 cursor-pointer ${
                      hud.status === 'playing'
                        ? 'bg-sky-400 text-slate-950 hover:bg-sky-300'
                        : hud.status === 'ended'
                          ? 'bg-emerald-400 text-slate-950 hover:bg-emerald-300'
                          : 'bg-amber-300 text-slate-950 hover:bg-amber-200'
                    }`}
                  >
                    <PrimaryIcon className="h-4 w-4" />
                    <span>{primaryLabel}</span>
                  </button>

                  {(hud.status === 'playing' || hud.status === 'paused') && (
                    <button
                      type="button"
                      onClick={() => controlsRef.current?.resetGame()}
                      title="Reset board to Ready state"
                      className="flex h-10 items-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-3 text-xs font-semibold text-slate-200 hover:bg-white/10 hover:border-amber-300/40 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      <span>Reset</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => setRosterSide((cur) => (cur === null ? 'w' : null))}
                    title="Replace players (Hikaru Nakamura, Garry Kasparov, Bobby Fischer, Magnus Carlsen, etc.)"
                    className={`flex h-10 items-center gap-1.5 rounded-xl border px-3 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      rosterSide !== null
                        ? 'border-amber-300/60 bg-amber-300 text-slate-950'
                        : 'border-white/15 bg-white/5 text-slate-200 hover:bg-white/10 hover:border-amber-300/40'
                    }`}
                  >
                    <Users className="h-3.5 w-3.5" />
                    <span>Replace Player</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => controlsRef.current?.toggleBestArrows()}
                    title="Toggle best-move arrows on the board"
                    className={`flex h-10 items-center gap-1.5 rounded-xl border px-3 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      hud.showBestArrows
                        ? 'border-emerald-400/70 bg-emerald-400 text-slate-950'
                        : 'border-white/15 bg-white/5 text-slate-200 hover:bg-white/10 hover:border-emerald-400/40'
                    }`}
                  >
                    <ArrowUpRight className="h-3.5 w-3.5" />
                    <span>Best Moves</span>
                  </button>
                </div>

                {/* Time Controls */}
                <div className="flex items-center gap-1 rounded-xl bg-white/5 p-1">
                  {[
                    { min: 1, label: '1m' },
                    { min: 3, label: '3m' },
                    { min: 10, label: '10m' },
                  ].map((opt) => (
                    <button
                      key={opt.min}
                      type="button"
                      disabled={hud.status !== 'ready'}
                      onClick={() => handleTimeSelect(opt.min)}
                      className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                        timeMin === opt.min
                          ? 'bg-amber-300 text-slate-950'
                          : 'text-slate-300 hover:text-white'
                      } ${hud.status !== 'ready' ? 'opacity-45 cursor-not-allowed' : 'cursor-pointer'}`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>

                {/* ELO & Speed Sliders */}
                <div className="flex flex-1 flex-wrap items-center justify-end gap-x-4 gap-y-2 min-w-[260px]">
                  <div className="flex items-center gap-2 text-xs text-slate-300">
                    <button
                      type="button"
                      onClick={() => setRosterSide((cur) => (cur === 'w' ? null : 'w'))}
                      title={`Replace White (${hud.whiteName})`}
                      className="w-16 truncate text-left font-medium text-sky-300 hover:underline cursor-pointer"
                    >
                      {hud.whiteName}
                    </button>
                    <input
                      type="range"
                      min={400}
                      max={sliderMax}
                      step={1}
                      value={whiteElo}
                      onChange={(e) => onWhiteEloChange(Number(e.target.value))}
                      className="w-20 sm:w-22 accent-sky-400 cursor-ew-resize"
                    />
                    <span className="w-10 text-right font-mono tabular-nums font-bold text-white">
                      {whiteElo}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-xs text-slate-300">
                    <button
                      type="button"
                      onClick={() => setRosterSide((cur) => (cur === 'b' ? null : 'b'))}
                      title={`Replace Black (${hud.blackName})`}
                      className="w-16 truncate text-left font-medium text-amber-300 hover:underline cursor-pointer"
                    >
                      {hud.blackName}
                    </button>
                    <input
                      type="range"
                      min={400}
                      max={sliderMax}
                      step={1}
                      value={blackElo}
                      onChange={(e) => onBlackEloChange(Number(e.target.value))}
                      className="w-20 sm:w-22 accent-amber-300 cursor-ew-resize"
                    />
                    <span className="w-10 text-right font-mono tabular-nums font-bold text-amber-200">
                      {blackElo}
                    </span>
                  </div>

                  <label className="flex items-center gap-2 text-xs text-slate-300">
                    <span className="w-10 font-medium text-slate-400">Speed</span>
                    <input
                      type="range"
                      min={0.25}
                      max={4}
                      step={0.05}
                      value={speed}
                      onChange={(e) => handleSpeed(Number(e.target.value))}
                      className="w-16 sm:w-20 accent-amber-300 cursor-ew-resize"
                    />
                    <span className="w-9 text-right font-mono tabular-nums font-bold text-amber-300">
                      {speed.toFixed(1)}x
                    </span>
                  </label>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
