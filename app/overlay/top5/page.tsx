"use client";

import { useCallback, useEffect, useState } from "react";
import {
  loadTournamentStats,
  type TournamentStanding,
} from "@/lib/tournamentClient";

function rankByChickenDinners(rows: TournamentStanding[]) {
  return [...rows].sort((a, b) => {
    if (b.chickenDinners !== a.chickenDinners) {
      return b.chickenDinners - a.chickenDinners;
    }

    if (b.totalPoints !== a.totalPoints) {
      return b.totalPoints - a.totalPoints;
    }

    if (b.totalKills !== a.totalKills) {
      return b.totalKills - a.totalKills;
    }

    return a.squadName.localeCompare(b.squadName);
  });
}

export default function TopChickenDinnersOverlayPage() {
  const [rows, setRows] = useState<TournamentStanding[]>([]);

  const refresh = useCallback(async () => {
    const standings = await loadTournamentStats();
    setRows(rankByChickenDinners(standings).slice(0, 5));
  }, []);

  useEffect(() => {
    const initialTimer = window.setTimeout(() => {
      void refresh();
    }, 0);

    const timer = window.setInterval(() => {
      void refresh();
    }, 3000);

    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(timer);
    };
  }, [refresh]);

  return (
    <main className="min-h-screen bg-transparent p-4 text-white">
      <section className="w-[620px] overflow-hidden rounded-2xl border border-white/15 bg-slate-950/95 shadow-2xl">
        <div className="bg-violet-600 px-5 py-3 text-xl font-black">
          TOP CHICKEN DINNERS
        </div>

        {rows.map((row, index) => (
          <div
            key={row.squadId}
            className="grid grid-cols-[55px_55px_1fr_110px] items-center gap-3 border-b border-white/10 px-4 py-3 last:border-b-0"
          >
            <div className="text-xl font-black text-violet-400">
              #{index + 1}
            </div>

            <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-lg bg-white/5">
              {row.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={row.logoUrl}
                  alt=""
                  className="h-full w-full object-contain p-1"
                />
              ) : null}
            </div>

            <div className="min-w-0">
              <p className="truncate font-black">{row.squadName}</p>
              <p className="text-xs text-slate-400">
                {row.totalKills} kills - {row.totalPoints} points
              </p>
            </div>

            <div className="text-right">
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                Dinners
              </p>
              <p className="text-2xl font-black text-yellow-400">
                {row.chickenDinners}
              </p>
            </div>
          </div>
        ))}
      </section>
    </main>
  );
}
