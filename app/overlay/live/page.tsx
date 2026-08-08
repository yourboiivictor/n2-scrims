"use client";

import {
  collection,
  onSnapshot,
  query,
} from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import { db } from "@/firebase";

type Standing = {
  id: string;
  squadName: string;
  logoUrl?: string;
  slot?: number;
  totalKills?: number;
  totalPoints?: number;
  isEliminated?: boolean;
  isLive?: boolean;
};

export default function StreamStandingsOverlay() {
  const [standings, setStandings] = useState<Standing[]>([]);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      query(collection(db, "standings")),
      (snapshot) => {
        setStandings(
          snapshot.docs.map((standingDocument) => ({
            id: standingDocument.id,
            ...(standingDocument.data() as Omit<Standing, "id">),
          })),
        );
      },
      (error) => {
        console.error("Unable to load overlay standings:", error);
      },
    );

    return unsubscribe;
  }, []);

  const rankedStandings = useMemo(() => {
    return [...standings].sort((a, b) => {
      const pointsDifference =
        (Number(b.totalPoints) || 0) -
        (Number(a.totalPoints) || 0);

      if (pointsDifference !== 0) return pointsDifference;

      const killsDifference =
        (Number(b.totalKills) || 0) -
        (Number(a.totalKills) || 0);

      if (killsDifference !== 0) return killsDifference;

      return (a.squadName || "").localeCompare(b.squadName || "");
    });
  }, [standings]);

  return (
    <main className="min-h-screen bg-black/40 p-3 text-white">
      <section className="w-[460px] overflow-hidden rounded-2xl border border-white/15 bg-slate-950/95 shadow-2xl backdrop-blur">
        <header className="flex items-center justify-between border-b border-white/10 bg-violet-600 px-4 py-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-violet-100">
              N² Scrims
            </p>
            <h1 className="text-xl font-black">LIVE STANDINGS</h1>
          </div>

          <span className="rounded-full bg-red-500 px-3 py-1 text-xs font-black">
            LIVE
          </span>
        </header>

        <div>
          {rankedStandings.length === 0 ? (
            <div className="p-5 text-center text-sm text-slate-400">
              Waiting for standings...
            </div>
          ) : (
            rankedStandings.map((standing, index) => (
              <div
                key={standing.id}
                className={`grid grid-cols-[38px_38px_48px_1fr_68px] items-center gap-2 border-b border-white/5 px-3 py-2 last:border-b-0 ${
                  standing.isLive && standing.isEliminated
                    ? "opacity-35 grayscale"
                    : ""
                }`}
              >
                <div className="text-center text-lg font-black">
                  {index + 1}
                </div>

                <div className="text-center text-xs font-black text-slate-400">
                  #{standing.slot || "-"}
                </div>

                <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-white/5">
                  {standing.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={standing.logoUrl}
                      alt=""
                      className="h-full w-full object-contain p-1"
                    />
                  ) : (
                    <span className="text-[8px] font-bold text-slate-500">
                      LOGO
                    </span>
                  )}
                </div>

                <div className="min-w-0">
                  <p className="truncate text-sm font-black">
                    {standing.squadName}
                  </p>

                  {standing.isLive && standing.isEliminated && (
                    <p className="text-[9px] font-black uppercase tracking-wider text-red-400">
                      Eliminated
                    </p>
                  )}
                </div>

                <div className="text-right">
                  <p className="text-2xl font-black text-violet-300">
                    {Number(standing.totalPoints) || 0}
                  </p>
                  <p className="text-[8px] font-bold uppercase text-slate-500">
                    Points
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </main>
  );
}