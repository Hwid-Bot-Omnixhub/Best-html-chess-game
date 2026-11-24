'use client';

import React, { useMemo, useState } from 'react';
import { BarChart3, RotateCcw, Trophy, X } from 'lucide-react';
import { WIN_ELO_STEP, type LeaderboardEntry } from '@/lib/chess-leaderboard';

interface EloLeaderboardChartProps {
  entries: LeaderboardEntry[];
  onClose: () => void;
  onResetStats: () => void;
}

export default function EloLeaderboardChart({
  entries,
  onClose,
  onResetStats,
}: EloLeaderboardChartProps) {
  const [filter, setFilter] = useState<'all' | 'winners'>('all');

  const winnersOnly = useMemo(() => entries.filter((e) => e.wins > 0), [entries]);
  const displayed = filter === 'winners' ? winnersOnly : entries;

  const minElo = 2600;
  const peakElo = useMemo(
    () => Math.max(3050, ...entries.map((e) => e.elo + 120)),
    [entries]
  );

  // Round yMax up to nearest 150 step cleanly
  const yMax = Math.ceil(peakElo / 150) * 150;
  const ySpan = Math.max(300, yMax - minElo);

  const ticks = useMemo(() => {
    const count = 4;
    const arr: number[] = [];
    for (let i = 0; i <= count; i++) {
      arr.push(Math.round(minElo + (ySpan * i) / count));
    }
    return arr;
  }, [ySpan]);

  const svgWidth = 640;
  const svgHeight = 230;
  const padLeft = 52;
  const padRight = 18;
  const padTop = 26;
  const padBottom = 38;
  const plotW = svgWidth - padLeft - padRight;
  const plotH = svgHeight - padTop - padBottom;

  const totalWinsRecorded = useMemo(
    () => entries.reduce((sum, item) => sum + item.wins, 0),
    [entries]
  );

  return (
    <div
      role="dialog"
      aria-label="Grandmaster Elo and Win Leaderboard"
      className="pointer-events-auto self-center my-auto w-full max-w-[680px] rounded-2xl border border-amber-300/25 bg-[#0d0f1c]/98 p-4 sm:p-5 shadow-2xl"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
        <div>
          <div className="flex items-center gap-2 text-sm sm:text-base font-bold text-amber-300">
            <BarChart3 className="h-4 w-4 shrink-0" />
            <span>Grandmaster Elo Standings</span>
          </div>
          <p className="mt-0.5 text-xs text-slate-400">
            Saved locally · +{WIN_ELO_STEP} Elo per win · {totalWinsRecorded}{' '}
            {totalWinsRecorded === 1 ? 'win' : 'wins'} recorded
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg bg-white/5 p-1">
            <button
              type="button"
              onClick={() => setFilter('all')}
              className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                filter === 'all'
                  ? 'bg-amber-300 text-slate-950'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              All Players
            </button>
            <button
              type="button"
              onClick={() => setFilter('winners')}
              className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                filter === 'winners'
                  ? 'bg-amber-300 text-slate-950'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Winners ({winnersOnly.length})
            </button>
          </div>

          <button
            type="button"
            onClick={onResetStats}
            title="Clear saved win history"
            className="flex h-8 items-center gap-1 rounded-lg border border-white/15 bg-white/5 px-2.5 text-xs font-medium text-slate-300 hover:border-rose-400/50 hover:text-rose-200 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Clear</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            title="Close Elo standings"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* SVG Elo Bar & Curve Chart: Higher Wins = Higher Elo = Taller Bar */}
      <div className="mt-3 rounded-xl border border-white/10 bg-[#080a14] p-2.5">
        {displayed.length === 0 ? (
          <div className="flex h-[200px] flex-col items-center justify-center text-center text-xs text-slate-400">
            <Trophy className="mb-2 h-6 w-6 text-amber-300/60" />
            <p className="font-semibold text-slate-200">No winners saved yet</p>
            <p className="mt-0.5 text-slate-400">
              Finish a match by checkmate or clock timeout to chart winners here.
            </p>
          </div>
        ) : (
          <svg
            viewBox={`0 0 ${svgWidth} ${svgHeight}`}
            className="w-full h-auto overflow-visible"
            role="img"
            aria-label="Bar chart of player Elo ratings sorted from highest wins to lowest"
          >
            {/* Horizontal grid lines & Elo Y-axis labels */}
            {ticks.map((tickVal) => {
              const norm = (tickVal - minElo) / ySpan;
              const y = padTop + plotH * (1 - norm);
              return (
                <g key={tickVal}>
                  <line
                    x1={padLeft}
                    y1={y}
                    x2={svgWidth - padRight}
                    y2={y}
                    stroke="rgba(148,163,184,0.14)"
                    strokeDasharray="3 3"
                  />
                  <text
                    x={padLeft - 8}
                    y={y + 3.5}
                    textAnchor="end"
                    fill="#94a3b8"
                    fontSize="10"
                    fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                  >
                    {tickVal}
                  </text>
                </g>
              );
            })}

            {/* Connecting curve across ranked peaks */}
            {displayed.length > 1 && (
              <polyline
                fill="none"
                stroke="rgba(252,211,77,0.45)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                points={displayed
                  .map((entry, idx) => {
                    const slotW = plotW / displayed.length;
                    const cx = padLeft + slotW * (idx + 0.5);
                    const norm = Math.max(0.04, Math.min(1, (entry.elo - minElo) / ySpan));
                    const topY = padTop + plotH * (1 - norm);
                    return `${cx.toFixed(1)},${topY.toFixed(1)}`;
                  })
                  .join(' ')}
              />
            )}

            {/* Player Elo Bars */}
            {displayed.map((entry, idx) => {
              const slotW = plotW / displayed.length;
              const barW = Math.min(44, Math.max(20, slotW * 0.56));
              const cx = padLeft + slotW * (idx + 0.5);
              const x = cx - barW / 2;
              const norm = Math.max(0.04, Math.min(1, (entry.elo - minElo) / ySpan));
              const barH = plotH * norm;
              const y = padTop + plotH - barH;
              const isLeader = idx === 0 && entry.wins > 0;
              const hasWins = entry.wins > 0;

              const barColor = isLeader
                ? '#fbbf24'
                : hasWins
                  ? '#38bdf8'
                  : '#334155';

              return (
                <g key={entry.id}>
                  <rect
                    x={x}
                    y={y}
                    width={barW}
                    height={barH}
                    rx={4}
                    fill={barColor}
                    fillOpacity={hasWins ? 0.92 : 0.65}
                  />
                  {/* Subtle top cap highlight */}
                  {hasWins && (
                    <rect
                      x={x}
                      y={y}
                      width={barW}
                      height={3}
                      rx={1.5}
                      fill={isLeader ? '#fef08a' : '#bae6fd'}
                    />
                  )}
                  {/* Elo label directly above bar */}
                  <text
                    x={cx}
                    y={y - 6}
                    textAnchor="middle"
                    fill={isLeader ? '#fde047' : hasWins ? '#e0f2fe' : '#94a3b8'}
                    fontSize="10"
                    fontWeight="700"
                    fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                  >
                    {entry.elo}
                  </text>
                  {/* Win count badge inside/near top of bar */}
                  {hasWins && (
                    <text
                      x={cx}
                      y={Math.min(padTop + plotH - 6, y + 15)}
                      textAnchor="middle"
                      fill="#090d16"
                      fontSize="10"
                      fontWeight="800"
                      fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                    >
                      {entry.wins}W
                    </text>
                  )}
                  {/* Player short name on X-axis */}
                  <text
                    x={cx}
                    y={svgHeight - 14}
                    textAnchor="middle"
                    fill={hasWins ? '#f1f5f9' : '#94a3b8'}
                    fontSize="10.5"
                    fontWeight={hasWins ? '600' : '500'}
                  >
                    {entry.shortName}
                  </text>
                </g>
              );
            })}
          </svg>
        )}
      </div>

      {/* Compact Ranked Standings Table */}
      <div className="mt-3 max-h-40 overflow-y-auto custom-scrollbar divide-y divide-white/5 text-xs">
        {displayed.map((entry, idx) => (
          <div
            key={entry.id}
            className="flex items-center justify-between gap-3 py-1.5 px-1"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="w-5 text-right font-mono tabular-nums text-slate-500 shrink-0">
                {idx + 1}.
              </span>
              <span className="font-semibold text-slate-100 truncate">
                {entry.fullName}
              </span>
              <span className="hidden sm:inline text-[11px] text-slate-400 truncate">
                {entry.styleTag}
              </span>
            </div>

            <div className="flex items-center gap-3 font-mono tabular-nums shrink-0">
              <span className="text-slate-300">
                <span className={entry.wins > 0 ? 'text-amber-300 font-bold' : 'text-slate-400'}>
                  {entry.wins}W
                </span>{' '}
                <span className="text-slate-500">·</span>{' '}
                <span>{entry.losses}L</span>{' '}
                <span className="text-slate-500">·</span>{' '}
                <span>{entry.draws}D</span>
              </span>
              <span
                className={`w-14 text-right font-bold ${
                  entry.wins > 0 ? 'text-sky-300' : 'text-slate-400'
                }`}
              >
                {entry.elo}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
