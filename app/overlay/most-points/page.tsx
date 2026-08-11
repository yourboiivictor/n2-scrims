"use client";

import { collection, getDocs } from "firebase/firestore";
import { useCallback, useEffect, useState } from "react";
import { db } from "@/firebase";

type SingleScrimPerformance = {
  id: string;
  squadId: string;
  squadName: string;
  logoUrl: string;
  matchNumber: number;
  totalPoints: number;
  totalKills: number;
  placement: number;
  source: "current" | "archive";
};

async function loadSingleScrimPerformances() {
  const performances: SingleScrimPerformance[] = [];

  // Current / history matches.
  const currentMatches = await getDocs(collection(db, "matches"));

  for (const matchDocument of currentMatches.docs) {
    const matchData = matchDocument.data();
    const matchNumber =
      Number(matchData.matchNumber) ||
      Number(matchDocument.id.replace("match-", "")) ||
      0;

    const results = await getDocs(
      collection(db, "matches", matchDocument.id, "results"),
    );

    results.docs.forEach((resultDocument) => {
      const data = resultDocument.data();

      performances.push({
        id: `current-${matchDocument.id}-${resultDocument.id}`,
        squadId:
          typeof data.squadId === "string" && data.squadId
            ? data.squadId
            : resultDocument.id,
        squadName:
          typeof data.squadName === "string" && data.squadName
            ? data.squadName
            : "Unnamed Squad",
        logoUrl:
          typeof data.logoUrl === "string" ? data.logoUrl : "",
        matchNumber:
          Number(data.matchNumber) || matchNumber,
        totalPoints: Number(data.totalPoints) || 0,
        totalKills: Number(data.totalKills) || 0,
        placement: Number(data.placement) || 0,
        source: "current",
      });
    });
  }

  // Archived tournament matches.
  const archives = await getDocs(
    collection(db, "tournamentArchives"),
  );

  for (const archiveDocument of archives.docs) {
    const archivedMatches = await getDocs(
      collection(
        db,
        "tournamentArchives",
        archiveDocument.id,
        "matches",
      ),
    );

    for (const matchDocument of archivedMatches.docs) {
      const matchData = matchDocument.data();
      const matchNumber =
        Number(matchData.matchNumber) ||
        Number(matchDocument.id.replace("match-", "")) ||
        0;

      const results = await getDocs(
        collection(
          db,
          "tournamentArchives",
          archiveDocument.id,
          "matches",
          matchDocument.id,
          "results",
        ),
      );

      results.docs.forEach((resultDocument) => {
        const data = resultDocument.data();

        performances.push({
          id: `archive-${archiveDocument.id}-${matchDocument.id}-${resultDocument.id}`,
          squadId:
            typeof data.squadId === "string" && data.squadId
              ? data.squadId
              : resultDocument.id,
          squadName:
            typeof data.squadName === "string" && data.squadName
              ? data.squadName
              : "Unnamed Squad",
          logoUrl:
            typeof data.logoUrl === "string" ? data.logoUrl : "",
          matchNumber:
            Number(data.matchNumber) || matchNumber,
          totalPoints: Number(data.totalPoints) || 0,
          totalKills: Number(data.totalKills) || 0,
          placement: Number(data.placement) || 0,
          source: "archive",
        });
      });
    }
  }

  return performances
    .sort((a, b) => {
      if (b.totalPoints !== a.totalPoints) {
        return b.totalPoints - a.totalPoints;
      }

      if (b.totalKills !== a.totalKills) {
        return b.totalKills - a.totalKills;
      }

      if (a.placement !== b.placement) {
        return (
          (a.placement || Number.MAX_SAFE_INTEGER) -
          (b.placement || Number.MAX_SAFE_INTEGER)
        );
      }

      return a.squadName.localeCompare(b.squadName);
    })
    .slice(0, 4);
}

export default function ChampionOverlay() {
  const [leaders, setLeaders] = useState<SingleScrimPerformance[]>([]);

  const refresh = useCallback(async () => {
    try {
      setLeaders(await loadSingleScrimPerformances());
    } catch (error) {
      console.error("Unable to load single-scrim point leaders:", error);
    }
  }, []);

  useEffect(() => {
    void refresh();

    const timer = window.setInterval(() => {
      void refresh();
    }, 5000);

    return () => window.clearInterval(timer);
  }, [refresh]);

  if (leaders.length === 0) return null;

  return (
    <main className="min-h-screen bg-transparent p-6 text-white">
      <section className="mx-auto w-[760px] overflow-hidden rounded-[28px] border border-white/30 bg-black/60 shadow-2xl">
        <div className="border-b border-white/20 bg-white px-6 py-4 text-black">
          <p className="text-[10px] font-black uppercase tracking-[0.28em] text-black/60">
            N² Scrims
          </p>

          <h1 className="mt-1 text-2xl font-black uppercase">
            Top 4 Single-Scrim Points
          </h1>
        </div>

        {leaders.map((team, index) => (
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

              <p className="mt-1 text-xs font-bold uppercase text-white/60">
                Match {team.matchNumber} · {team.totalKills} kills
                {team.placement ? ` · #${team.placement}` : ""}
                {team.source === "archive" ? " · archived" : ""}
              </p>
            </div>

            <div className="text-right">
              <p className="text-3xl font-black">
                {team.totalPoints}
              </p>

              <p className="text-[10px] font-black uppercase tracking-wider text-white/60">
                Points
              </p>
            </div>
          </div>
        ))}
      </section>
    </main>
  );
}
