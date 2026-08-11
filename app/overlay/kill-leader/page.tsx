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

async function loadAllPlayerKills() {
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

  // Archived tournaments.
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
        addPlayersFromResult(
          totals,
          resultDocument.data() as Record<string, unknown>,
        );
      });
    }
  }

  return Object.values(totals).sort((a, b) => {
    if (b.totalKills !== a.totalKills) {
      return b.totalKills - a.totalKills;
    }

    return a.playerName.localeCompare(b.playerName);
  });
}

export default function KillLeaderOverlay() {
  const [leader, setLeader] = useState<PlayerKillLeader | null>(null);

  const refresh = useCallback(async () => {
    try {
      const players = await loadAllPlayerKills();
      setLeader(players[0] || null);
    } catch (error) {
      console.error("Unable to load player kill leader:", error);
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

  if (!leader) return null;

  return (
    <main className="min-h-screen bg-transparent p-4 text-white">
      <section className="flex w-[560px] items-center gap-4 rounded-2xl border border-white/40 bg-black/50 p-4 shadow-2xl">
        <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-xl border border-white bg-white">
          {leader.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={leader.logoUrl}
              alt=""
              className="h-full w-full object-contain p-2"
            />
          ) : (
            <span className="font-black text-black">N²</span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-white">
            All-Time Player Kill Leader
          </p>

          <p className="mt-1 truncate text-2xl font-black">
            {leader.playerName}
          </p>

          <p className="mt-1 truncate text-xs font-bold uppercase text-white/65">
            {leader.squadName} · {leader.gamesPlayed} games
          </p>
        </div>

        <div className="text-right">
          <p className="text-4xl font-black text-white">
            {leader.totalKills}
          </p>
          <p className="text-xs font-bold uppercase text-white/70">
            Total Kills
          </p>
        </div>
      </section>
    </main>
  );
}
