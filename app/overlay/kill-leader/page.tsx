"use client";

import { collection, getDocs } from "firebase/firestore";
import { useCallback, useEffect, useState } from "react";
import { db } from "@/firebase";

type PlayerKillLeader = {
  playerKey: string;
  playerName: string;
  squadName: string;
  logoUrl: string;
  totalKills: number;
  gamesPlayed: number;
};

function normalizePlayerName(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function addPlayersFromResult(
  totals: Record<string, PlayerKillLeader>,
  data: Record<string, unknown>,
) {
  const squadName =
    typeof data.squadName === "string" && data.squadName.trim()
      ? data.squadName.trim()
      : "Unknown Squad";

  const logoUrl =
    typeof data.logoUrl === "string" ? data.logoUrl : "";

  const players = Array.isArray(data.players) ? data.players : [];

  players.forEach((player) => {
    if (!player || typeof player !== "object") return;

    const value = player as Record<string, unknown>;
    const playerName =
      typeof value.name === "string" ? value.name.trim() : "";

    if (!playerName) return;

    const playerKey = normalizePlayerName(playerName);
    const kills = Number(value.kills) || 0;

    if (!totals[playerKey]) {
      totals[playerKey] = {
        playerKey,
        playerName,
        squadName,
        logoUrl,
        totalKills: 0,
        gamesPlayed: 0,
      };
    }

    const row = totals[playerKey];
    row.playerName = playerName;
    row.squadName = squadName;
    if (logoUrl) row.logoUrl = logoUrl;
    row.totalKills += kills;
    row.gamesPlayed += 1;
  });
}

async function loadCurrentPlayerKills() {
  const totals: Record<string, PlayerKillLeader> = {};

  // Current + history matches.
  const currentMatches = await getDocs(collection(db, "matches"));

  for (const matchDocument of currentMatches.docs) {
    const results = await getDocs(
      collection(db, "matches", matchDocument.id, "results"),
    );

    results.docs.forEach((resultDocument) => {
      addPlayersFromResult(
        totals,
        resultDocument.data() as Record<string, unknown>,
      );
    });
  }

  return Object.values(totals).sort((a, b) => {
    if (b.totalKills !== a.totalKills) {
      return b.totalKills - a.totalKills;
    }

    return a.playerName.localeCompare(b.playerName);
  });
}

export default function KillLeaderOverlay() {
  const [leaders, setLeaders] = useState<PlayerKillLeader[]>([]);

  const refresh = useCallback(async () => {
    try {
      const players = await loadCurrentPlayerKills();
      setLeaders(players.slice(0, 10));
    } catch (error) {
      console.error("Unable to load player kill leaders:", error);
    }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => void refresh(), 0);
    const timer = window.setInterval(() => void refresh(), 5000);

    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, [refresh]);

  if (leaders.length === 0) return null;

  return (
    <main className="min-h-screen bg-transparent p-4 text-white">
      <section className="w-[620px] overflow-hidden rounded-2xl border border-white/40 bg-black/60 shadow-2xl">
        <div className="border-b border-white/25 bg-white px-5 py-3 text-black">
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-black/60">
            N² Scrims
          </p>
          <h1 className="mt-1 text-xl font-black uppercase">
            Top 10 Player Kill Leaders
          </h1>
        </div>

        {leaders.map((leader, index) => (
          <div
            key={leader.playerKey}
            className="grid grid-cols-[50px_52px_minmax(0,1fr)_90px] items-center gap-3 border-b border-white/10 px-4 py-3 last:border-b-0"
          >
            <div className="text-xl font-black">
              #{index + 1}
            </div>

            <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-lg border border-white bg-white">
              {leader.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={leader.logoUrl}
                  alt=""
                  className="h-full w-full object-contain p-1"
                />
              ) : (
                <span className="text-xs font-black text-black">N²</span>
              )}
            </div>

            <div className="min-w-0">
              <p className="truncate text-base font-black">
                {leader.playerName}
              </p>
              <p className="truncate text-xs font-bold uppercase text-white/60">
                {leader.squadName} · {leader.gamesPlayed} games
              </p>
            </div>

            <div className="text-right">
              <p className="text-2xl font-black">
                {leader.totalKills}
              </p>
              <p className="text-[10px] font-black uppercase tracking-wider text-white/60">
                Kills
              </p>
            </div>
          </div>
        ))}
      </section>
    </main>
  );
}
