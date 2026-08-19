"use client";

import { collection, getDocs } from "firebase/firestore";
import { useCallback, useEffect, useState } from "react";
import { db } from "@/firebase";

type ArchivedScrimPerformance = {
  id: string;
  archiveId: string;
  tournamentName: string;
  season: string;
  squadId: string;
  squadName: string;
  logoUrl: string;
  matchesPlayed: number;
  chickenDinners: number;
  totalKills: number;
  placementPoints: number;
  totalPoints: number;
};

async function loadCurrentScrimPointLeaders() {
  const standings = await getDocs(collection(db, "standings"));

  return standings.docs
    .map((standingDocument) => {
      const data = standingDocument.data();

      return {
        id: standingDocument.id,
        archiveId: "",
        tournamentName: "Current Scrim",
        season: "",
        squadId: standingDocument.id,
        squadName:
          typeof data.squadName === "string" && data.squadName.trim()
            ? data.squadName.trim()
            : "Unnamed Squad",
        logoUrl:
          typeof data.logoUrl === "string" ? data.logoUrl : "",
        matchesPlayed: Number(data.matchesPlayed) || 0,
        chickenDinners: Number(data.chickenDinners) || 0,
        totalKills: Number(data.totalKills) || 0,
        placementPoints: Number(data.placementPoints) || 0,
        totalPoints: Number(data.totalPoints) || 0,
      };
    })
    .sort((a, b) => {
      if (b.totalPoints !== a.totalPoints) {
        return b.totalPoints - a.totalPoints;
      }

      if (b.totalKills !== a.totalKills) {
        return b.totalKills - a.totalKills;
      }

      if (b.chickenDinners !== a.chickenDinners) {
        return b.chickenDinners - a.chickenDinners;
      }

      return a.squadName.localeCompare(b.squadName);
    })
    .slice(0, 4);
}

export default function MostPointsOverlay() {
  const [leaders, setLeaders] = useState<ArchivedScrimPerformance[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setLeaders(await loadCurrentScrimPointLeaders());
    } catch (error) {
      console.error("Unable to load current scrim point leaders:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();

    const timer = window.setInterval(() => {
      void refresh();
    }, 5000);

    return () => window.clearInterval(timer);
  }, [refresh]);

  return (
    <main className="min-h-screen bg-transparent p-6 text-white">
      <section className="mx-auto w-[760px] overflow-hidden rounded-[28px] border border-white/30 bg-black/60 shadow-2xl">
        <div className="border-b border-white/20 bg-white px-6 py-4 text-black">
          <p className="text-[10px] font-black uppercase tracking-[0.28em] text-black/60">
            N² Scrims
          </p>

          <h1 className="mt-1 text-2xl font-black uppercase">
            Top 4 Most Points In One Scrim
          </h1>

          <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-black/50">
            Current New Update totals
          </p>
        </div>

        {loading ? (
          <div className="px-6 py-10 text-center text-sm font-bold text-white/60">
            Loading current scrim...
          </div>
        ) : leaders.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm font-bold text-white/60">
            No New Update standings yet.
          </div>
        ) : (
          leaders.map((team, index) => (
            <div
              key={team.id}
              className="grid grid-cols-[60px_64px_minmax(0,1fr)_120px] items-center gap-4 border-b border-white/10 px-5 py-4 last:border-b-0"
            >
              <div className="text-2xl font-black">
                #{index + 1}
              </div>

              <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-xl border border-white bg-white">
                {team.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={team.logoUrl}
                    alt=""
                    className="h-full w-full object-contain p-2"
                  />
                ) : (
                  <span className="font-black text-black">N²</span>
                )}
              </div>

              <div className="min-w-0">
                <p className="truncate text-xl font-black uppercase">
                  {team.squadName}
                </p>

                <p className="mt-1 truncate text-xs font-bold uppercase text-white/60">
                  {team.tournamentName}
                  {team.season ? ` · Season ${team.season}` : ""}
                </p>

                <p className="mt-1 text-[10px] font-bold uppercase text-white/45">
                  {team.matchesPlayed} matches · {team.totalKills} kills · {team.chickenDinners} dinners
                </p>
              </div>

              <div className="text-right">
                <p className="text-3xl font-black">
                  {team.totalPoints}
                </p>

                <p className="text-[10px] font-black uppercase tracking-wider text-white/60">
                  Scrim Points
                </p>
              </div>
            </div>
          ))
        )}
      </section>
    </main>
  );
}
