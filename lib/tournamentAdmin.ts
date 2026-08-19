import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  writeBatch,
} from "firebase/firestore";
import { db } from "@/firebase";

type ActiveResult = {
  squadId: string;
  squadName: string;
  logoUrl?: string;
  slot?: number;
  placement?: number | null;
  totalKills?: number;
  placementPoints?: number;
  totalPoints?: number;
  playerNames?: string[];
  players?: unknown[];
};

type StandingTotals = {
  squadId: string;
  squadName: string;
  logoUrl: string;
  slot: number;
  playerNames: string[];
  matchesPlayed: number;
  chickenDinners: number;
  totalKills: number;
  placementPoints: number;
  totalPoints: number;
};

async function commitInChunks(
  operations: Array<(batch: ReturnType<typeof writeBatch>) => void>,
) {
  const chunkSize = 450;

  for (let index = 0; index < operations.length; index += chunkSize) {
    const batch = writeBatch(db);

    operations
      .slice(index, index + chunkSize)
      .forEach((operation) => operation(batch));

    await batch.commit();
  }
}

async function deleteCollectionDocuments(
  pathSegments: string[],
) {
  const [firstSegment, ...remainingSegments] = pathSegments;

  if (!firstSegment) {
    return;
  }

  const snapshot = await getDocs(
    collection(db, firstSegment, ...remainingSegments),
  );

  await commitInChunks(
    snapshot.docs.map(
      (snapshotDocument) => (batch) =>
        batch.delete(snapshotDocument.ref),
    ),
  );
}

export async function loadActiveMatchesWithResults() {
  const matchesSnapshot = await getDocs(collection(db, "matches"));

  return Promise.all(
    matchesSnapshot.docs.map(async (matchDocument) => {
      const resultsSnapshot = await getDocs(
        collection(db, "matches", matchDocument.id, "results"),
      );

      return {
        id: matchDocument.id,
        data: matchDocument.data(),
        results: resultsSnapshot.docs.map((resultDocument) => ({
          squadId: resultDocument.id,
          ...(resultDocument.data() as Omit<ActiveResult, "squadId">),
        })),
      };
    }),
  );
}


export function getPlacementPoints(placement: number) {
  if (placement === 1) return 10;
  if (placement === 2) return 6;
  if (placement === 3) return 5;
  if (placement === 4) return 4;
  if (placement === 5) return 3;
  if (placement === 6) return 2;
  if (placement === 7 || placement === 8) return 1;
  return 0;
}

export function calculateMatchPoints(placement: number, kills: number) {
  return getPlacementPoints(placement) + kills;
}

export async function rebuildActiveStandings() {
  const matches = await loadActiveMatchesWithResults();
  const totals: Record<string, StandingTotals> = {};

  for (const match of matches) {
    for (const result of match.results) {
      const squadId = result.squadId;

      if (!totals[squadId]) {
        totals[squadId] = {
          squadId,
          squadName: result.squadName || "Unnamed Squad",
          logoUrl: result.logoUrl || "",
          slot: Number(result.slot) || 0,
          playerNames: Array.isArray(result.playerNames)
            ? result.playerNames
            : [],
          matchesPlayed: 0,
          chickenDinners: 0,
          totalKills: 0,
          placementPoints: 0,
          totalPoints: 0,
        };
      }

      const standing = totals[squadId];
      standing.squadName = result.squadName || standing.squadName;
      standing.logoUrl = result.logoUrl || standing.logoUrl;
      standing.slot = Number(result.slot) || standing.slot;
      standing.playerNames = Array.isArray(result.playerNames)
        ? result.playerNames
        : standing.playerNames;
      standing.matchesPlayed += 1;
      standing.chickenDinners += Number(result.placement) === 1 ? 1 : 0;
      standing.totalKills += Number(result.totalKills) || 0;
      const placement = Number(result.placement) || 0;
      const kills = Number(result.totalKills) || 0;
      standing.placementPoints += getPlacementPoints(placement);
      standing.totalPoints += calculateMatchPoints(placement, kills);
    }
  }

  const existingStandings = await getDocs(collection(db, "standings"));
  const operations: Array<(batch: ReturnType<typeof writeBatch>) => void> = [];

  existingStandings.docs.forEach((standingDocument) => {
    operations.push((batch) => batch.delete(standingDocument.ref));
  });

  Object.values(totals).forEach((standing) => {
    operations.push((batch) => {
      batch.set(doc(db, "standings", standing.squadId), {
        ...standing,
        currentMatchNumber: 0,
        currentMatchKills: 0,
        currentMatchPlacementPoints: 0,
        currentMatchPoints: 0,
        alivePlayers: 0,
        isEliminated: false,
        isLive: false,
        updatedAt: serverTimestamp(),
      });
    });
  });

  await commitInChunks(operations);
  return totals;
}

export async function deleteActiveMatch(matchId: string) {
  await deleteCollectionDocuments(["matches", matchId, "results"]);
  await deleteDoc(doc(db, "matches", matchId));

  await deleteCollectionDocuments(["liveMatches", matchId, "squads"]);

  const liveMatchSnapshot = await getDoc(doc(db, "liveMatches", matchId));
  if (liveMatchSnapshot.exists()) {
    await deleteDoc(doc(db, "liveMatches", matchId));
  }

  await rebuildActiveStandings();
}

export async function saveTournamentSettings(name: string, season: string) {
  await setDoc(
    doc(db, "settings", "tournament"),
    {
      name: name.trim() || "Untitled Tournament",
      season: season.trim(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export async function archiveAndResetTournament({
  nextTournamentName,
  nextSeason,
}: {
  nextTournamentName: string;
  nextSeason: string;
}) {
  const liveSettingsSnapshot = await getDoc(doc(db, "settings", "liveMatch"));
  const liveStatus = liveSettingsSnapshot.exists()
    ? liveSettingsSnapshot.data().status
    : "not-started";

  if (liveStatus === "live") {
    throw new Error("Finalize the live match before archiving the tournament.");
  }

  const tournamentSettingsSnapshot = await getDoc(
    doc(db, "settings", "tournament"),
  );

  const tournamentSettings = tournamentSettingsSnapshot.exists()
    ? tournamentSettingsSnapshot.data()
    : {};

  const matches = await loadActiveMatchesWithResults();
  const standings = await rebuildActiveStandings();

  const archiveRef = doc(collection(db, "tournamentArchives"));
  const rankedStandings = Object.values(standings).sort((a, b) => {
    if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
    if (b.chickenDinners !== a.chickenDinners) {
      return b.chickenDinners - a.chickenDinners;
    }
    if (b.totalKills !== a.totalKills) return b.totalKills - a.totalKills;
    return a.squadName.localeCompare(b.squadName);
  });

  const champion = rankedStandings[0] || null;

  await setDoc(archiveRef, {
    tournamentName:
      typeof tournamentSettings.name === "string"
        ? tournamentSettings.name
        : "Untitled Tournament",
    season:
      typeof tournamentSettings.season === "string"
        ? tournamentSettings.season
        : "",
    championName: champion?.squadName || "No champion",
    championLogoUrl: champion?.logoUrl || "",
    matchCount: matches.length,
    squadCount: rankedStandings.length,
    archivedAt: serverTimestamp(),
  });

  const archiveOperations: Array<
    (batch: ReturnType<typeof writeBatch>) => void
  > = [];

  rankedStandings.forEach((standing, index) => {
    archiveOperations.push((batch) => {
      batch.set(
        doc(
          db,
          "tournamentArchives",
          archiveRef.id,
          "standings",
          standing.squadId,
        ),
        {
          ...standing,
          rank: index + 1,
        },
      );
    });
  });

  matches.forEach((match) => {
    archiveOperations.push((batch) => {
      batch.set(
        doc(
          db,
          "tournamentArchives",
          archiveRef.id,
          "matches",
          match.id,
        ),
        {
          ...match.data,
          originalMatchId: match.id,
        },
      );
    });

    match.results.forEach((result) => {
      archiveOperations.push((batch) => {
        batch.set(
          doc(
            db,
            "tournamentArchives",
            archiveRef.id,
            "matches",
            match.id,
            "results",
            result.squadId,
          ),
          result,
        );
      });
    });
  });

  await commitInChunks(archiveOperations);

  for (const match of matches) {
    await deleteCollectionDocuments(["matches", match.id, "results"]);
    await deleteDoc(doc(db, "matches", match.id));
  }

  const liveMatchesSnapshot = await getDocs(collection(db, "liveMatches"));
  for (const liveMatchDocument of liveMatchesSnapshot.docs) {
    await deleteCollectionDocuments([
      "liveMatches",
      liveMatchDocument.id,
      "squads",
    ]);
    await deleteDoc(liveMatchDocument.ref);
  }

  await deleteCollectionDocuments(["standings"]);

  const resetBatch = writeBatch(db);

  resetBatch.set(
    doc(db, "settings", "liveMatch"),
    {
      matchNumber: 1,
      status: "not-started",
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  resetBatch.set(
    doc(db, "settings", "tournament"),
    {
      name: nextTournamentName.trim() || "New Tournament",
      season: nextSeason.trim(),
      startedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  await resetBatch.commit();
  return archiveRef.id;
}


export async function rebuildArchivedStandings(archiveId: string) {
  const matchesSnapshot = await getDocs(
    collection(db, "tournamentArchives", archiveId, "matches"),
  );

  const totals: Record<string, StandingTotals> = {};

  for (const matchDocument of matchesSnapshot.docs) {
    const resultsSnapshot = await getDocs(
      collection(
        db,
        "tournamentArchives",
        archiveId,
        "matches",
        matchDocument.id,
        "results",
      ),
    );

    resultsSnapshot.forEach((resultDocument) => {
      const data = resultDocument.data() as ActiveResult;
      const squadId =
        typeof data.squadId === "string"
          ? data.squadId
          : resultDocument.id;

      if (!totals[squadId]) {
        totals[squadId] = {
          squadId,
          squadName: data.squadName || "Unnamed Squad",
          logoUrl: data.logoUrl || "",
          slot: Number(data.slot) || 0,
          playerNames: Array.isArray(data.playerNames)
            ? data.playerNames
            : [],
          matchesPlayed: 0,
          chickenDinners: 0,
          totalKills: 0,
          placementPoints: 0,
          totalPoints: 0,
        };
      }

      const standing = totals[squadId];
      standing.squadName = data.squadName || standing.squadName;
      standing.logoUrl = data.logoUrl || standing.logoUrl;
      standing.slot = Number(data.slot) || standing.slot;
      standing.playerNames = Array.isArray(data.playerNames)
        ? data.playerNames
        : standing.playerNames;
      standing.matchesPlayed += 1;
      standing.chickenDinners += Number(data.placement) === 1 ? 1 : 0;
      standing.totalKills += Number(data.totalKills) || 0;
      const placement = Number(data.placement) || 0;
      const kills = Number(data.totalKills) || 0;
      standing.placementPoints += getPlacementPoints(placement);
      standing.totalPoints += calculateMatchPoints(placement, kills);
    });
  }

  const rankedStandings = Object.values(totals).sort((a, b) => {
    if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
    if (b.chickenDinners !== a.chickenDinners) {
      return b.chickenDinners - a.chickenDinners;
    }
    if (b.totalKills !== a.totalKills) return b.totalKills - a.totalKills;
    return a.squadName.localeCompare(b.squadName);
  });

  const existingStandings = await getDocs(
    collection(db, "tournamentArchives", archiveId, "standings"),
  );

  const operations: Array<
    (batch: ReturnType<typeof writeBatch>) => void
  > = [];

  existingStandings.docs.forEach((standingDocument) => {
    operations.push((batch) => batch.delete(standingDocument.ref));
  });

  rankedStandings.forEach((standing, index) => {
    operations.push((batch) => {
      batch.set(
        doc(
          db,
          "tournamentArchives",
          archiveId,
          "standings",
          standing.squadId,
        ),
        {
          ...standing,
          rank: index + 1,
          updatedAt: serverTimestamp(),
        },
      );
    });
  });

  await commitInChunks(operations);

  const champion = rankedStandings[0] || null;

  await setDoc(
    doc(db, "tournamentArchives", archiveId),
    {
      championName: champion?.squadName || "No champion",
      championLogoUrl: champion?.logoUrl || "",
      squadCount: rankedStandings.length,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  return rankedStandings;
}
