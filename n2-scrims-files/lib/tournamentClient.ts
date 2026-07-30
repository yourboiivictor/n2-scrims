import { collection, getDocs } from "firebase/firestore";
import { db } from "@/firebase";

export type TournamentStanding = {
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
  totalPlacement: number;
  averagePlacement: number;
  bestPlacement: number;
  highestKillGame: number;
  currentMatchKills: number;
  currentMatchPlacementPoints: number;
  currentMatchPoints: number;
  isLive: boolean;
};

export type TournamentSettings = {
  name: string;
  season: string;
  streamUrl: string;
  prizeFirst: string;
  prizeSecond: string;
  prizeThird: string;
  prizeMvp: string;
};

export const defaultTournamentSettings: TournamentSettings = {
  name: "N² Scrims",
  season: "",
  streamUrl: "",
  prizeFirst: "",
  prizeSecond: "",
  prizeThird: "",
  prizeMvp: "",
};

export function rankTournamentStandings(standings: TournamentStanding[]) {
  return [...standings].sort((a, b) => {
    if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
    if (b.chickenDinners !== a.chickenDinners) return b.chickenDinners - a.chickenDinners;
    if (b.totalKills !== a.totalKills) return b.totalKills - a.totalKills;
    if (a.averagePlacement !== b.averagePlacement) return a.averagePlacement - b.averagePlacement;
    return a.squadName.localeCompare(b.squadName);
  });
}

export async function loadTournamentStats(): Promise<TournamentStanding[]> {
  const matchesSnapshot = await getDocs(collection(db, "matches"));
  const totals = new Map<string, TournamentStanding>();

  for (const matchDocument of matchesSnapshot.docs) {
    const resultsSnapshot = await getDocs(
      collection(db, "matches", matchDocument.id, "results"),
    );

    resultsSnapshot.forEach((resultDocument) => {
      const data = resultDocument.data();
      const squadId = typeof data.squadId === "string" ? data.squadId : resultDocument.id;
      const placement = Number(data.placement) || 0;
      const kills = Number(data.totalKills) || 0;

      const current = totals.get(squadId) || {
        squadId,
        squadName: typeof data.squadName === "string" ? data.squadName : "Unnamed Squad",
        logoUrl: typeof data.logoUrl === "string" ? data.logoUrl : "",
        slot: Number(data.slot) || 0,
        playerNames: Array.isArray(data.playerNames) ? data.playerNames : [],
        matchesPlayed: 0,
        chickenDinners: 0,
        totalKills: 0,
        placementPoints: 0,
        totalPoints: 0,
        totalPlacement: 0,
        averagePlacement: 0,
        bestPlacement: 0,
        highestKillGame: 0,
        currentMatchKills: 0,
        currentMatchPlacementPoints: 0,
        currentMatchPoints: 0,
        isLive: false,
      };

      current.squadName = typeof data.squadName === "string" ? data.squadName : current.squadName;
      current.logoUrl = typeof data.logoUrl === "string" ? data.logoUrl : current.logoUrl;
      current.slot = Number(data.slot) || current.slot;
      current.playerNames = Array.isArray(data.playerNames) ? data.playerNames : current.playerNames;
      current.matchesPlayed += 1;
      current.chickenDinners += placement === 1 ? 1 : 0;
      current.totalKills += kills;
      current.placementPoints += Number(data.placementPoints) || 0;
      current.totalPoints += Number(data.totalPoints) || 0;
      current.totalPlacement += placement;
      current.bestPlacement = placement > 0 && (current.bestPlacement === 0 || placement < current.bestPlacement)
        ? placement
        : current.bestPlacement;
      current.highestKillGame = Math.max(current.highestKillGame, kills);
      current.averagePlacement = current.matchesPlayed > 0
        ? current.totalPlacement / current.matchesPlayed
        : 0;

      totals.set(squadId, current);
    });
  }

  const liveSnapshot = await getDocs(collection(db, "standings"));
  liveSnapshot.forEach((standingDocument) => {
    const data = standingDocument.data();
    const squadId = typeof data.squadId === "string" ? data.squadId : standingDocument.id;
    const current = totals.get(squadId) || {
      squadId,
      squadName: typeof data.squadName === "string" ? data.squadName : "Unnamed Squad",
      logoUrl: typeof data.logoUrl === "string" ? data.logoUrl : "",
      slot: Number(data.slot) || 0,
      playerNames: Array.isArray(data.playerNames) ? data.playerNames : [],
      matchesPlayed: Number(data.matchesPlayed) || 0,
      chickenDinners: Number(data.chickenDinners) || 0,
      totalKills: Number(data.totalKills) || 0,
      placementPoints: Number(data.placementPoints) || 0,
      totalPoints: Number(data.totalPoints) || 0,
      totalPlacement: 0,
      averagePlacement: 0,
      bestPlacement: 0,
      highestKillGame: 0,
      currentMatchKills: 0,
      currentMatchPlacementPoints: 0,
      currentMatchPoints: 0,
      isLive: false,
    };

    current.currentMatchKills = Number(data.currentMatchKills) || 0;
    current.currentMatchPlacementPoints = Number(data.currentMatchPlacementPoints) || 0;
    current.currentMatchPoints = Number(data.currentMatchPoints) || 0;
    current.isLive = data.isLive === true;

    if (current.isLive) {
      current.totalKills += current.currentMatchKills;
      current.placementPoints += current.currentMatchPlacementPoints;
      current.totalPoints += current.currentMatchPoints;
    }

    totals.set(squadId, current);
  });

  return rankTournamentStandings(Array.from(totals.values()));
}
