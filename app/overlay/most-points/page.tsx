"use client";

import {
  collection,
  getDocs,
} from "firebase/firestore";
import { useCallback, useEffect, useState } from "react";
import { db } from "@/firebase";

type ChickenDinnerRow = {
  teamKey: string;
  squadName: string;
  logoUrl: string;
  chickenDinners: number;
  winningPoints: number;
  winningKills: number;
};

function normalizeTeamName(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function addChickenDinner(
  totals: Record<string, ChickenDinnerRow>,
  data: Record<string, unknown>,
) {
  if (Number(data.placement) !== 1) return;

  const squadName =
    typeof data.squadName === "string" && data.squadName.trim()
      ? data.squadName.trim()
      : "Unnamed Squad";

  const teamKey = normalizeTeamName(squadName);

  if (!totals[teamKey]) {
    totals[teamKey] = {
      teamKey,
      squadName,
      logoUrl:
        typeof data.logoUrl === "string" ? data.logoUrl : "",
      chickenDinners: 0,
      winningPoints: 0,
      winningKills: 0,
    };
  }

  const row = totals[teamKey];

  if (typeof data.logoUrl === "string" && data.logoUrl) {
    row.logoUrl = data.logoUrl;
  }

  row.squadName = squadName;
  row.chickenDinners += 1;
  row.winningPoints += Number(data.totalPoints) || 0;
  row.winningKills += Number(data.totalKills) || 0;
}

async function loadCurrentChickenDinners() {
  const totals: Record<string, ChickenDinnerRow> = {};

  // CURRENT / HISTORY MATCHES
  const currentMatches = await getDocs(collection(db, "matches"));

  for (const matchDocument of currentMatches.docs) {
    const results = await getDocs(
      collection(db, "matches", matchDocument.id, "results"),
    );

    results.docs.forEach((resultDocument) => {
      addChickenDinner(
        totals,
        resultDocument.data() as Record<string, unknown>,
      );
    });
  }

  return Object.values(totals).sort((a, b) => {
    if (b.chickenDinners !== a.chickenDinners) {
      return b.chickenDinners - a.chickenDinners;
    }

    if (b.winningPoints !== a.winningPoints) {
      return b.winningPoints - a.winningPoints;
    }

    if (b.winningKills !== a.winningKills) {
      return b.winningKills - a.winningKills;
    }

    return a.squadName.localeCompare(b.squadName);
  });
}

export default function TopChickenDinnersOverlayPage() {
  const [rows, setRows] = useState<ChickenDinnerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const refresh = useCallback(async () => {
    try {
      setErrorMessage("");
      const loadedRows = await loadCurrentChickenDinners();
      setRows(loadedRows);
    } catch (error) {
      console.error("Unable to load current Chicken Dinner stats:", error);
      setErrorMessage("Unable to load current Chicken Dinner stats.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initialTimer = window.setTimeout(() => {
      void refresh();
    }, 0);

    const timer = window.setInterval(() => {
      void refresh();
    }, 5000);

    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(timer);
    };
  }, [refresh]);

  return (
    <main className="min-h-screen bg-transparent p-4 text-white">
      <section className="w-[640px] overflow-hidden rounded-2xl border border-white/30 bg-black/90 shadow-2xl">
        <div className="border-b border-white/25 bg-white px-5 py-3 text-xl font-black text-black">
          TOP CHICKEN DINNERS
        </div>

        {loading ? (
          <div className="px-5 py-8 text-center text-sm font-bold text-white/65">
            Loading Chicken Dinners...
          </div>
        ) : errorMessage ? (
          <div className="px-5 py-8 text-center text-sm font-bold text-white/65">
            {errorMessage}
          </div>
        ) : rows.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm font-bold text-white/65">
            No No Chicken Dinners recorded in the new update yet.
          </div>
        ) : (
          rows.map((row, index) => (
            <div
              key={row.teamKey}
              className="grid grid-cols-[55px_55px_1fr_100px] items-center gap-3 border-b border-white/10 px-4 py-3 last:border-b-0"
            >
              <div className="text-xl font-black text-white">
                #{index + 1}
              </div>

              <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-lg border border-white/30 bg-white">
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
                <p className="truncate font-black">
                  {row.squadName}
                </p>

                <p className="text-xs text-white/60">
                  {row.winningKills} kills · {row.winningPoints} winning pts
                </p>
              </div>

              <div className="text-right">
                <p className="text-[10px] font-black uppercase tracking-wider text-white/45">
                  Dinners
                </p>

                <p className="text-2xl font-black text-white">
                  {row.chickenDinners}
                </p>
              </div>
            </div>
          ))
        )}
      </section>
    </main>
  );
}
