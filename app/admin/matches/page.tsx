"use client";

import {
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDocs,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  User,
} from "firebase/auth";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { auth, db, googleProvider } from "@/firebase";
import {
  defaultTournamentSettings,
  MatchScheduleItem,
  TournamentSettings,
} from "@/lib/tournamentClient";

const OWNER_EMAIL = "victornicetry2@gmail.com";
type SquadPlayer = {
  name?: string;
  playerName?: string;
  ign?: string;
};

type Squad = {
  id: string;
  squadName: string;
  logoUrl?: string;
  players?: Array<string | SquadPlayer>;
  status?: string;
  slot?: number;
};

type PlayerControl = {
  name: string;
  kills: number;
  isAlive: boolean;
};

type LiveSquad = {
  squadId: string;
  squadName: string;
  logoUrl: string;
  slot: number;
  placement: number | null;
  players: PlayerControl[];
  totalKills: number;
  killPoints: number;
  placementPoints: number;
  matchPoints: number;
  alivePlayers: number;
  isEliminated: boolean;
};

type FinalizedTotals = {
  totalKills: number;
  placementPoints: number;
  totalPoints: number;
};

type HistoricalResult = {
  squadId: string;
  squadName: string;
  logoUrl: string;
  slot: number;
  totalKills: number;
  placementPoints: number;
  totalPoints: number;
};


type LiveMatchSettings = {
  matchNumber: number;
  status: "not-started" | "live" | "finalized";
};

type ActiveMatchInfo = {
  map: string;
  startTime: string;
};

function getPlayerName(
  player: string | SquadPlayer | undefined,
  index: number,
) {
  if (typeof player === "string") {
    return player.trim() || `Player ${index + 1}`;
  }

  if (player && typeof player === "object") {
    return (
      player.name?.trim() ||
      player.playerName?.trim() ||
      player.ign?.trim() ||
      `Player ${index + 1}`
    );
  }

  return `Player ${index + 1}`;
}

function getPlacementPoints(placement: number | null) {
  if (!placement || placement <= 0) return 0;
  if (placement === 1) return 10;
  if (placement === 2) return 8;
  if (placement === 3) return 6;
  if (placement >= 4 && placement <= 15) return 5;
  return 2;
}

function calculateLiveSquad(
  squad: LiveSquad,
  killPointValue: number,
): LiveSquad {
  const totalKills = squad.players.reduce(
    (total, player) => total + Math.max(0, Number(player.kills) || 0),
    0,
  );

  const alivePlayers = squad.players.filter(
    (player) => player.isAlive,
  ).length;

  const killPoints = totalKills * Math.max(0, killPointValue);
  const placementPoints = getPlacementPoints(squad.placement);

  return {
    ...squad,
    totalKills,
    killPoints,
    placementPoints,
    matchPoints: killPoints + placementPoints,
    alivePlayers,
    isEliminated: alivePlayers === 0,
  };
}

function createLiveSquad(
  squad: Squad,
  slot: number,
  playersPerSquad: number,
  killPointValue: number,
): LiveSquad {
  const sourcePlayers = Array.isArray(squad.players)
    ? squad.players
    : [];

  const players: PlayerControl[] = Array.from(
    { length: Math.max(1, playersPerSquad) },
    (_, index) => ({
      name: getPlayerName(sourcePlayers[index], index),
      kills: 0,
      isAlive: true,
    }),
  );

  return calculateLiveSquad({
    squadId: squad.id,
    squadName: squad.squadName || "Unnamed Squad",
    logoUrl: squad.logoUrl || "",
    slot,
    placement: null,
    players,
    totalKills: 0,
    killPoints: 0,
    placementPoints: 0,
    matchPoints: 0,
    alivePlayers: Math.max(1, playersPerSquad),
    isEliminated: false,
  }, killPointValue);
}

function sortSquadsBySlot(squads: Squad[]) {
  return [...squads].sort((a, b) => {
    const aSlot =
      typeof a.slot === "number"
        ? a.slot
        : Number.MAX_SAFE_INTEGER;

    const bSlot =
      typeof b.slot === "number"
        ? b.slot
        : Number.MAX_SAFE_INTEGER;

    if (aSlot !== bSlot) return aSlot - bSlot;

    return (a.squadName || "").localeCompare(b.squadName || "");
  });
}

export default function AdminMatchesPage() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [squadsLoading, setSquadsLoading] = useState(true);
  const [approvedSquads, setApprovedSquads] = useState<Squad[]>([]);
  const [liveSquads, setLiveSquads] = useState<
    Record<string, LiveSquad>
  >({});
  const [finalizedTotals, setFinalizedTotals] = useState<
    Record<string, FinalizedTotals>
  >({});
  const [liveSettings, setLiveSettings] =
    useState<LiveMatchSettings>({
      matchNumber: 1,
      status: "not-started",
    });
  const [tournamentSettings, setTournamentSettings] =
    useState<TournamentSettings>(defaultTournamentSettings);

  const [message, setMessage] = useState("");
  const [isStarting, setIsStarting] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [isPreparingNext, setIsPreparingNext] = useState(false);
  const [isResettingTournament, setIsResettingTournament] = useState(false);
  const [showPreviousMatches, setShowPreviousMatches] = useState(false);
  const [previousMatchNumber, setPreviousMatchNumber] = useState(1);
  const [previousResults, setPreviousResults] = useState<HistoricalResult[]>([]);
  const [isLoadingPrevious, setIsLoadingPrevious] = useState(false);
  const [isSavingPrevious, setIsSavingPrevious] = useState(false);
  const [savingSquadId, setSavingSquadId] = useState<
    string | null
  >(null);
  const [staffLoading, setStaffLoading] = useState(true);
  const [hasAdminAccess, setHasAdminAccess] = useState(false);

  const saveTimers = useRef<
    Record<string, ReturnType<typeof setTimeout>>
  >({});

  const isOwner =
    user?.email?.toLowerCase() === OWNER_EMAIL.toLowerCase();
  const isAdmin = isOwner || hasAdminAccess;

  const matchId = useMemo(
    () => `match-${liveSettings.matchNumber}`,
    [liveSettings.matchNumber],
  );

  const matchSchedule = tournamentSettings.matchSchedule ?? [];
  const currentMatchInfo: ActiveMatchInfo = useMemo(() => {
    const scheduled = matchSchedule[liveSettings.matchNumber - 1];

    return {
      map:
        scheduled?.map ||
        tournamentSettings.maps?.[liveSettings.matchNumber - 1] ||
        "Map not set",
      startTime: scheduled?.startTime || "",
    };
  }, [
    liveSettings.matchNumber,
    matchSchedule,
    tournamentSettings.maps,
  ]);

  const killPointValue = Math.max(
    0,
    Number(tournamentSettings.killPoints) || 0,
  );
  const playersPerSquad = Math.max(
    1,
    Number(tournamentSettings.playersPerSquad) || 4,
  );
  const plannedMatches = Math.max(
    1,
    matchSchedule.length ||
      Number(tournamentSettings.matchesPlanned) ||
      1,
  );
  const isLastPlannedMatch =
    liveSettings.matchNumber >= plannedMatches;

  const editableMatchNumbers = useMemo(
    () =>
      Array.from(
        { length: Math.max(1, liveSettings.matchNumber) },
        (_, index) => index + 1,
      ),
    [liveSettings.matchNumber],
  );

  const liveSquadList = useMemo(
    () =>
      Object.values(liveSquads).sort(
        (a, b) => a.slot - b.slot,
      ),
    [liveSquads],
  );

  const aliveSquads = useMemo(
    () =>
      liveSquadList.filter((squad) => !squad.isEliminated)
        .length,
    [liveSquadList],
  );

  const alivePlayers = useMemo(
    () =>
      liveSquadList.reduce(
        (total, squad) => total + squad.alivePlayers,
        0,
      ),
    [liveSquadList],
  );

  const totalLiveKills = useMemo(
    () =>
      liveSquadList.reduce(
        (total, squad) => total + squad.totalKills,
        0,
      ),
    [liveSquadList],
  );

  const placementsSet = useMemo(
    () =>
      liveSquadList.filter((squad) => squad.placement).length,
    [liveSquadList],
  );

  const signIn = async () => {
    try {
      setMessage("");

      const provider =
        googleProvider instanceof GoogleAuthProvider
          ? googleProvider
          : new GoogleAuthProvider();

      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error(error);
      setMessage("Unable to sign in with Google.");
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error(error);
      setMessage("Unable to sign out.");
    }
  };

  const loadFinalizedTotals = useCallback(async () => {
    try {
      const snapshot = await getDocs(
        collectionGroup(db, "results"),
      );

      const totals: Record<string, FinalizedTotals> = {};

      snapshot.forEach((resultDocument) => {
        const data = resultDocument.data();

        const squadId =
          typeof data.squadId === "string"
            ? data.squadId
            : resultDocument.id;

        if (!totals[squadId]) {
          totals[squadId] = {
            totalKills: 0,
            placementPoints: 0,
            totalPoints: 0,
          };
        }

        totals[squadId].totalKills +=
          Number(data.totalKills) || 0;

        totals[squadId].placementPoints +=
          Number(data.placementPoints) || 0;

        totals[squadId].totalPoints +=
          Number(data.totalPoints) || 0;
      });

      setFinalizedTotals(totals);
      return totals;
    } catch (error) {
      console.error("Unable to load finalized totals:", error);
      setFinalizedTotals({});
return {};
    }
  }, []);

  const updatePublicStanding = useCallback(
    async (
      squad: LiveSquad,
      suppliedTotals?: Record<string, FinalizedTotals>,
    ) => {
      const base =
        (suppliedTotals || finalizedTotals)[squad.squadId] || {
          totalKills: 0,
          placementPoints: 0,
          totalPoints: 0,
        };

      await setDoc(
        doc(db, "standings", squad.squadId),
        {
          squadId: squad.squadId,
          squadName: squad.squadName,
          logoUrl: squad.logoUrl,
          slot: squad.slot,
          playerNames: squad.players.map(
            (player) => player.name,
          ),

          currentMatchNumber: liveSettings.matchNumber,
          currentMatchKills: squad.totalKills,
          currentMatchPlacementPoints:
            squad.placementPoints,
          currentMatchPoints: squad.matchPoints,

          totalKills: base.totalKills + squad.totalKills,
          placementPoints:
            base.placementPoints + squad.placementPoints,
          totalPoints: base.totalPoints + squad.matchPoints,

          alivePlayers: squad.alivePlayers,
          isEliminated: squad.isEliminated,
          isLive: liveSettings.status === "live",
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
    },
    [
      finalizedTotals,
      liveSettings.matchNumber,
      liveSettings.status,
    ],
  );

  const saveLiveSquad = useCallback(
    async (squad: LiveSquad) => {
      if (!isAdmin || liveSettings.status !== "live") return;

      try {
        setSavingSquadId(squad.squadId);

        await setDoc(
          doc(
            db,
            "liveMatches",
            matchId,
            "squads",
            squad.squadId,
          ),
          {
            ...squad,
            matchNumber: liveSettings.matchNumber,
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        );

        await updatePublicStanding(squad);
      } catch (error) {
        console.error("Unable to save squad:", error);
        setMessage(`Unable to save ${squad.squadName}.`);
      } finally {
        setSavingSquadId((current) =>
          current === squad.squadId ? null : current,
        );
      }
    },
    [
      isAdmin,
      liveSettings.status,
      liveSettings.matchNumber,
      matchId,
      updatePublicStanding,
    ],
  );

  const scheduleSquadSave = useCallback(
    (squad: LiveSquad, immediate = false) => {
      const previousTimer =
        saveTimers.current[squad.squadId];

      if (previousTimer) {
        clearTimeout(previousTimer);
      }

      if (immediate) {
        void saveLiveSquad(squad);
        return;
      }

      saveTimers.current[squad.squadId] = setTimeout(() => {
        void saveLiveSquad(squad);
      }, 400);
    },
    [saveLiveSquad],
  );

  const updateSquad = useCallback(
    (
      squadId: string,
      updater: (current: LiveSquad) => LiveSquad,
      immediate = false,
    ) => {
      setLiveSquads((currentSquads) => {
        const current = currentSquads[squadId];

        if (!current) return currentSquads;

        const updated = calculateLiveSquad(
          updater(current),
          killPointValue,
        );

        scheduleSquadSave(updated, immediate);

        return {
          ...currentSquads,
          [squadId]: updated,
        };
      });
    },
    [killPointValue, scheduleSquadSave],
  );

  const changePlayerKills = (
    squadId: string,
    playerIndex: number,
    value: number,
  ) => {
    updateSquad(squadId, (current) => ({
      ...current,
      players: current.players.map((player, index) =>
        index === playerIndex
          ? {
              ...player,
              kills: Math.max(0, Number(value) || 0),
            }
          : player,
      ),
    }));
  };

  const togglePlayerAlive = (
    squadId: string,
    playerIndex: number,
  ) => {
    updateSquad(
      squadId,
      (current) => ({
        ...current,
        players: current.players.map((player, index) =>
          index === playerIndex
            ? {
                ...player,
                isAlive: !player.isAlive,
              }
            : player,
        ),
      }),
      true,
    );
  };

  const changePlacement = (
    squadId: string,
    value: string,
  ) => {
    updateSquad(squadId, (current) => {
      const parsed = Number.parseInt(value, 10);

      return {
        ...current,
        placement:
          value === "" || Number.isNaN(parsed)
            ? null
            : Math.max(1, parsed),
      };
    });
  };

  const initializeMatch = useCallback(
    async (matchNumber: number) => {
      if (!isAdmin || approvedSquads.length === 0) return;

      setIsStarting(true);
      setMessage("");

      try {
        const newMatchId = `match-${matchNumber}`;
        const sortedSquads = sortSquadsBySlot(
          approvedSquads,
        );

        const preparedSquads: Record<
          string,
          LiveSquad
        > = {};

        const batch = writeBatch(db);

        sortedSquads.forEach((squad, index) => {
          const liveSquad = createLiveSquad(
            squad,
            typeof squad.slot === "number"
              ? squad.slot
              : index + 1,
            playersPerSquad,
            killPointValue,
          );

          preparedSquads[squad.id] = liveSquad;

          batch.set(
            doc(
              db,
              "liveMatches",
              newMatchId,
              "squads",
              squad.id,
            ),
            {
              ...liveSquad,
              matchNumber,
              updatedAt: serverTimestamp(),
            },
          );
        });

        batch.set(
          doc(db, "liveMatches", newMatchId),
          {
            matchNumber,
            status: "live",
            map: currentMatchInfo.map,
            startTime: currentMatchInfo.startTime,
            gameMode: tournamentSettings.gameMode,
            perspective: tournamentSettings.perspective,
            server: tournamentSettings.server,
            killPoints: killPointValue,
            playersPerSquad,
            startedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        );

        batch.set(
          doc(db, "settings", "liveMatch"),
          {
            matchNumber,
            status: "live",
            map: currentMatchInfo.map,
            startTime: currentMatchInfo.startTime,
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        );

        await batch.commit();

        const baseTotals = await loadFinalizedTotals();

        await Promise.all(
          Object.values(preparedSquads).map((squad) =>
            updatePublicStanding(squad, baseTotals),
          ),
        );

        setLiveSquads(preparedSquads);
        setMessage(`Match ${matchNumber} is now live.`);
      } catch (error) {
        console.error("Unable to start match:", error);
        setMessage("Unable to start match.");
      } finally {
        setIsStarting(false);
      }
    },
    [
      approvedSquads,
      currentMatchInfo.map,
      currentMatchInfo.startTime,
      isAdmin,
      killPointValue,
      loadFinalizedTotals,
      playersPerSquad,
      tournamentSettings.gameMode,
      tournamentSettings.perspective,
      tournamentSettings.server,
      updatePublicStanding,
    ],
  );

  const finalizeMatch = async () => {
    if (!isAdmin || liveSettings.status !== "live") return;

    const missingPlacements = liveSquadList.filter(
      (squad) => !squad.placement,
    );

    if (missingPlacements.length > 0) {
      setMessage(
        `Add placement for every squad. Missing: ${missingPlacements
          .map((squad) => squad.squadName)
          .join(", ")}`,
      );
      return;
    }

    const confirmed = window.confirm(
      `Finalize Match ${liveSettings.matchNumber}?`,
    );

    if (!confirmed) return;

    setIsFinalizing(true);
    setMessage("");

    try {
      Object.values(saveTimers.current).forEach((timer) =>
        clearTimeout(timer),
      );

      const batch = writeBatch(db);

      liveSquadList.forEach((squad) => {
        batch.set(
          doc(
            db,
            "matches",
            matchId,
            "results",
            squad.squadId,
          ),
          {
            matchNumber: liveSettings.matchNumber,
            map: currentMatchInfo.map,
            gameMode: tournamentSettings.gameMode,
            perspective: tournamentSettings.perspective,
            server: tournamentSettings.server,
            killPointValue,
            squadId: squad.squadId,
            squadName: squad.squadName,
            logoUrl: squad.logoUrl,
            slot: squad.slot,
            players: squad.players,
            playerNames: squad.players.map(
              (player) => player.name,
            ),
            placement: squad.placement,
            totalKills: squad.totalKills,
            killPoints: squad.killPoints,
            placementPoints: squad.placementPoints,
            totalPoints: squad.matchPoints,
            finalizedAt: serverTimestamp(),
          },
        );
      });

      batch.set(
        doc(db, "matches", matchId),
        {
          matchNumber: liveSettings.matchNumber,
          status: "finalized",
          map: currentMatchInfo.map,
          startTime: currentMatchInfo.startTime,
          gameMode: tournamentSettings.gameMode,
          perspective: tournamentSettings.perspective,
          server: tournamentSettings.server,
          killPoints: killPointValue,
          playersPerSquad,
          squadCount: liveSquadList.length,
          finalizedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );

      batch.set(
        doc(db, "liveMatches", matchId),
        {
          matchNumber: liveSettings.matchNumber,
          status: "finalized",
          finalizedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );

      batch.set(
        doc(db, "settings", "liveMatch"),
        {
          matchNumber: liveSettings.matchNumber,
          status: "finalized",
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );

      await batch.commit();

      const standingsBatch = writeBatch(db);
      const newTotals: Record<string, FinalizedTotals> = {};

      liveSquadList.forEach((squad) => {
        const previous =
          finalizedTotals[squad.squadId] || {
            totalKills: 0,
            placementPoints: 0,
            totalPoints: 0,
          };

        const totals = {
          totalKills:
            previous.totalKills + squad.totalKills,
          placementPoints:
            previous.placementPoints +
            squad.placementPoints,
          totalPoints:
            previous.totalPoints + squad.matchPoints,
        };

        newTotals[squad.squadId] = totals;

        standingsBatch.set(
          doc(db, "standings", squad.squadId),
          {
            squadId: squad.squadId,
            squadName: squad.squadName,
            logoUrl: squad.logoUrl,
            slot: squad.slot,
            playerNames: squad.players.map(
              (player) => player.name,
            ),

            currentMatchNumber:
              liveSettings.matchNumber,
            currentMatchKills: 0,
            currentMatchPlacementPoints: 0,
            currentMatchPoints: 0,

            totalKills: totals.totalKills,
            placementPoints: totals.placementPoints,
            totalPoints: totals.totalPoints,

            alivePlayers: 0,
            isEliminated: false,
            isLive: false,
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        );
      });

      await standingsBatch.commit();

      setFinalizedTotals(newTotals);

      setMessage(
        `Match ${liveSettings.matchNumber} finalized successfully.`,
      );
    } catch (error) {
      console.error("Unable to finalize match:", error);
      setMessage("Unable to finalize match.");
    } finally {
      setIsFinalizing(false);
    }
  };

  const loadPreviousMatch = useCallback(
    async (matchNumber: number) => {
      if (!isAdmin) return;

      if (liveSettings.status === "live") {
        setMessage(
          "Finalize or stop the live match before editing previous match points.",
        );
        return;
      }

      setIsLoadingPrevious(true);
      setMessage("");

      try {
        const snapshot = await getDocs(
          collection(
            db,
            "matches",
            `match-${matchNumber}`,
            "results",
          ),
        );

        const loaded = snapshot.docs
          .map((resultDocument) => {
            const data = resultDocument.data();

            return {
              squadId:
                typeof data.squadId === "string"
                  ? data.squadId
                  : resultDocument.id,
              squadName:
                typeof data.squadName === "string"
                  ? data.squadName
                  : "Unnamed Squad",
              logoUrl:
                typeof data.logoUrl === "string"
                  ? data.logoUrl
                  : "",
              slot: Number(data.slot) || 0,
              totalKills: Number(data.totalKills) || 0,
              placementPoints:
                Number(data.placementPoints) || 0,
              totalPoints: Number(data.totalPoints) || 0,
            } satisfies HistoricalResult;
          })
          .sort((a, b) => {
            if (b.totalPoints !== a.totalPoints) {
              return b.totalPoints - a.totalPoints;
            }

            if (b.totalKills !== a.totalKills) {
              return b.totalKills - a.totalKills;
            }

            return a.squadName.localeCompare(b.squadName);
          });

        setPreviousResults(loaded);

        if (loaded.length === 0) {
          setMessage(
            `No finalized results were found for Match ${matchNumber}.`,
          );
        }
      } catch (error) {
        console.error("Unable to load previous match:", error);
        setMessage("Unable to load previous match results.");
      } finally {
        setIsLoadingPrevious(false);
      }
    },
    [isAdmin, liveSettings.status],
  );

  const rebuildStandingsFromFinalizedResults = useCallback(
    async () => {
      const snapshot = await getDocs(collectionGroup(db, "results"));

      const totals: Record<
        string,
        FinalizedTotals & {
          squadName: string;
          logoUrl: string;
          slot: number;
          playerNames: string[];
        }
      > = {};

      snapshot.forEach((resultDocument) => {
        const data = resultDocument.data();
        const squadId =
          typeof data.squadId === "string"
            ? data.squadId
            : resultDocument.id;

        if (!totals[squadId]) {
          totals[squadId] = {
            totalKills: 0,
            placementPoints: 0,
            totalPoints: 0,
            squadName:
              typeof data.squadName === "string"
                ? data.squadName
                : "Unnamed Squad",
            logoUrl:
              typeof data.logoUrl === "string"
                ? data.logoUrl
                : "",
            slot: Number(data.slot) || 0,
            playerNames: Array.isArray(data.playerNames)
              ? data.playerNames.filter(
                  (name: unknown): name is string =>
                    typeof name === "string",
                )
              : [],
          };
        }

        totals[squadId].totalKills +=
          Number(data.totalKills) || 0;
        totals[squadId].placementPoints +=
          Number(data.placementPoints) || 0;
        totals[squadId].totalPoints +=
          Number(data.totalPoints) || 0;
      });

      const batch = writeBatch(db);

      approvedSquads.forEach((squad, index) => {
        const total = totals[squad.id] || {
          totalKills: 0,
          placementPoints: 0,
          totalPoints: 0,
          squadName: squad.squadName,
          logoUrl: squad.logoUrl || "",
          slot:
            typeof squad.slot === "number"
              ? squad.slot
              : index + 1,
          playerNames: Array.isArray(squad.players)
            ? squad.players.map((player, playerIndex) =>
                getPlayerName(player, playerIndex),
              )
            : [],
        };

        batch.set(
          doc(db, "standings", squad.id),
          {
            squadId: squad.id,
            squadName: total.squadName,
            logoUrl: total.logoUrl,
            slot: total.slot,
            playerNames: total.playerNames,
            currentMatchNumber: liveSettings.matchNumber,
            currentMatchKills: 0,
            currentMatchPlacementPoints: 0,
            currentMatchPoints: 0,
            totalKills: total.totalKills,
            placementPoints: total.placementPoints,
            totalPoints: total.totalPoints,
            alivePlayers: 0,
            isEliminated: false,
            isLive: false,
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        );
      });

      await batch.commit();

      const refreshedTotals: Record<string, FinalizedTotals> = {};

      Object.entries(totals).forEach(([squadId, total]) => {
        refreshedTotals[squadId] = {
          totalKills: total.totalKills,
          placementPoints: total.placementPoints,
          totalPoints: total.totalPoints,
        };
      });

      setFinalizedTotals(refreshedTotals);
    },
    [approvedSquads, liveSettings.matchNumber],
  );

  const updatePreviousResult = (
    squadId: string,
    field: "totalKills" | "placementPoints" | "totalPoints",
    value: number,
  ) => {
    setPreviousResults((current) =>
      current.map((result) =>
        result.squadId === squadId
          ? {
              ...result,
              [field]: Math.max(0, Number(value) || 0),
            }
          : result,
      ),
    );
  };

  const savePreviousMatch = async () => {
    if (!isAdmin || previousResults.length === 0) return;

    if (liveSettings.status === "live") {
      setMessage(
        "Finalize or stop the live match before editing previous match points.",
      );
      return;
    }

    const confirmed = window.confirm(
      `Save edited points for Match ${previousMatchNumber}? Tournament standings will be recalculated automatically.`,
    );

    if (!confirmed) return;

    setIsSavingPrevious(true);
    setMessage("");

    try {
      const batch = writeBatch(db);

      previousResults.forEach((result) => {
        batch.set(
          doc(
            db,
            "matches",
            `match-${previousMatchNumber}`,
            "results",
            result.squadId,
          ),
          {
            totalKills: result.totalKills,
            placementPoints: result.placementPoints,
            totalPoints: result.totalPoints,
            editedAt: serverTimestamp(),
          },
          { merge: true },
        );
      });

      await batch.commit();
      await rebuildStandingsFromFinalizedResults();

      setMessage(
        `Match ${previousMatchNumber} updated. Overall standings were recalculated.`,
      );
    } catch (error) {
      console.error("Unable to save previous match:", error);
      setMessage("Unable to save previous match edits.");
    } finally {
      setIsSavingPrevious(false);
    }
  };

  const resetTournament = async () => {
    if (!isAdmin || isResettingTournament) return;

    const firstConfirmation = window.confirm(
      "STOP THE TOURNAMENT AND RESET ALL POINTS?\n\nThis will stop the live match, reset standings to zero, and erase saved match results for this tournament. This cannot be undone.",
    );

    if (!firstConfirmation) return;

    const typedConfirmation = window.prompt(
      'Type RESET to permanently clear tournament points and match results.',
    );

    if (typedConfirmation?.trim().toUpperCase() !== "RESET") {
      setMessage("Tournament reset cancelled.");
      return;
    }

    setIsResettingTournament(true);
    setMessage("Stopping tournament and resetting points...");

    try {
      Object.values(saveTimers.current).forEach((timer) =>
        clearTimeout(timer),
      );
      saveTimers.current = {};

      // Delete all public standings so every squad returns to zero.
      const standingsSnapshot = await getDocs(collection(db, "standings"));
      await Promise.all(
        standingsSnapshot.docs.map((standingDocument) =>
          deleteDoc(doc(db, "standings", standingDocument.id)),
        ),
      );

      // Delete live-match squads and live-match parent documents.
      const liveMatchesSnapshot = await getDocs(collection(db, "liveMatches"));
      for (const liveMatchDocument of liveMatchesSnapshot.docs) {
        const liveSquadsSnapshot = await getDocs(
          collection(db, "liveMatches", liveMatchDocument.id, "squads"),
        );

        await Promise.all(
          liveSquadsSnapshot.docs.map((squadDocument) =>
            deleteDoc(
              doc(
                db,
                "liveMatches",
                liveMatchDocument.id,
                "squads",
                squadDocument.id,
              ),
            ),
          ),
        );

        await deleteDoc(doc(db, "liveMatches", liveMatchDocument.id));
      }

      // Delete finalized match results too. loadFinalizedTotals() reads these,
      // so keeping them would bring old points back after a reset.
      const matchesSnapshot = await getDocs(collection(db, "matches"));
      for (const matchDocument of matchesSnapshot.docs) {
        const resultsSnapshot = await getDocs(
          collection(db, "matches", matchDocument.id, "results"),
        );

        await Promise.all(
          resultsSnapshot.docs.map((resultDocument) =>
            deleteDoc(
              doc(
                db,
                "matches",
                matchDocument.id,
                "results",
                resultDocument.id,
              ),
            ),
          ),
        );

        await deleteDoc(doc(db, "matches", matchDocument.id));
      }

      await setDoc(
        doc(db, "settings", "liveMatch"),
        {
          matchNumber: 1,
          status: "not-started",
          map: matchSchedule[0]?.map || tournamentSettings.maps?.[0] || "",
          startTime: matchSchedule[0]?.startTime || "",
          aliveSquads: 0,
          alivePlayers: 0,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );

      setLiveSquads({});
      setFinalizedTotals({});
      setSavingSquadId(null);

      setMessage(
        "Tournament stopped. All match results and standings points were reset. Match 1 is ready to start again.",
      );
    } catch (error) {
      console.error("Unable to reset tournament:", error);
      setMessage(
        "Reset failed. Some tournament data may still remain. Check Firestore before starting another match.",
      );
    } finally {
      setIsResettingTournament(false);
    }
  };

  const prepareNextMatch = async () => {
    if (!isAdmin || liveSettings.status !== "finalized") {
      return;
    }

    if (isLastPlannedMatch) {
      setMessage(
        `All ${plannedMatches} planned matches are complete.`,
      );
      return;
    }

    setIsPreparingNext(true);
    setMessage("");

    try {
      const nextMatchNumber =
        liveSettings.matchNumber + 1;

      await setDoc(
        doc(db, "settings", "liveMatch"),
        {
          matchNumber: nextMatchNumber,
          status: "not-started",
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );

      setLiveSquads({});

      setMessage(
        `Match ${nextMatchNumber} is ready.`,
      );
    } catch (error) {
      console.error(
        "Unable to prepare next match:",
        error,
      );
      setMessage("Unable to prepare next match.");
    } finally {
      setIsPreparingNext(false);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(
      auth,
      (currentUser) => {
        setUser(currentUser);
        setAuthLoading(false);
      },
    );

    return unsubscribe;
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function checkStaffAccess() {
      if (!user?.email) {
        setHasAdminAccess(false);
        setStaffLoading(false);
        return;
      }

      const normalizedEmail = user.email.toLowerCase();

      if (normalizedEmail === OWNER_EMAIL.toLowerCase()) {
        setHasAdminAccess(true);
        setStaffLoading(false);
        return;
      }

      try {
        setStaffLoading(true);
        const staffSnapshot = await getDoc(
          doc(db, "staff", normalizedEmail),
        );

        if (!cancelled) {
          const data = staffSnapshot.data();
          setHasAdminAccess(
            staffSnapshot.exists() &&
              data?.active === true &&
              data?.role === "admin",
          );
        }
      } catch (error) {
        console.error("Unable to verify staff access:", error);
        if (!cancelled) setHasAdminAccess(false);
      } finally {
        if (!cancelled) setStaffLoading(false);
      }
    }

    void checkStaffAccess();

    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    if (!isAdmin) {
      setApprovedSquads([]);
      setSquadsLoading(false);
      return;
    }

    setSquadsLoading(true);

    const squadsQuery = query(
      collection(db, "squads"),
      where("status", "==", "approved"),
    );

    const unsubscribe = onSnapshot(
      squadsQuery,
      (snapshot) => {
        const squads = snapshot.docs.map(
          (squadDocument) => ({
            id: squadDocument.id,
            ...(squadDocument.data() as Omit<
              Squad,
              "id"
            >),
          }),
        );

        setApprovedSquads(sortSquadsBySlot(squads));
        setSquadsLoading(false);
      },
      (error) => {
        console.error(
          "Unable to load approved squads:",
          error,
        );
        setMessage("Unable to load approved squads.");
        setSquadsLoading(false);
      },
    );

    return unsubscribe;
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;

    const unsubscribe = onSnapshot(
      doc(db, "settings", "liveMatch"),
      (snapshot) => {
        if (!snapshot.exists()) {
          setLiveSettings({
            matchNumber: 1,
            status: "not-started",
          });
          return;
        }

        const data = snapshot.data();

        setLiveSettings({
          matchNumber: Number(data.matchNumber) || 1,
          status:
            data.status === "live" ||
            data.status === "finalized"
              ? data.status
              : "not-started",
        });
      },
      (error) => {
        console.error(
          "Unable to load live match settings:",
          error,
        );
      },
    );

    return unsubscribe;
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;

    const unsubscribe = onSnapshot(
      doc(db, "settings", "tournament"),
      (snapshot) => {
        if (!snapshot.exists()) {
          setTournamentSettings(defaultTournamentSettings);
          return;
        }

        const data = snapshot.data();

        const schedule: MatchScheduleItem[] =
          Array.isArray(data.matchSchedule)
            ? data.matchSchedule
                .map((item: unknown, index: number) => {
                  const value =
                    item && typeof item === "object"
                      ? (item as Record<string, unknown>)
                      : {};

                  return {
                    id:
                      typeof value.id === "string"
                        ? value.id
                        : `match-${index + 1}`,
                    map:
                      typeof value.map === "string"
                        ? value.map
                        : "Erangel",
                    startTime:
                      typeof value.startTime === "string"
                        ? value.startTime
                        : "",
                  };
                })
            : [];

        setTournamentSettings({
          ...defaultTournamentSettings,
          ...(data as Partial<TournamentSettings>),
          matchSchedule:
            schedule.length > 0
              ? schedule
              : defaultTournamentSettings.matchSchedule,
          maps:
            Array.isArray(data.maps)
              ? data.maps.filter(
                  (map): map is string =>
                    typeof map === "string",
                )
              : defaultTournamentSettings.maps,
          rules:
            Array.isArray(data.rules)
              ? data.rules.filter(
                  (rule): rule is string =>
                    typeof rule === "string",
                )
              : defaultTournamentSettings.rules,
        });
      },
      (error) => {
        console.error(
          "Unable to load tournament settings:",
          error,
        );
        setMessage("Unable to load tournament settings.");
      },
    );

    return unsubscribe;
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;
    void loadFinalizedTotals();
  }, [isAdmin, loadFinalizedTotals]);

  useEffect(() => {
    if (
      !isAdmin ||
      liveSettings.status === "not-started"
    ) {
      setLiveSquads({});
      return;
    }

    const unsubscribe = onSnapshot(
      collection(
        db,
        "liveMatches",
        matchId,
        "squads",
      ),
      (snapshot) => {
        const loaded: Record<string, LiveSquad> = {};

        snapshot.forEach((squadDocument) => {
          const data =
            squadDocument.data() as LiveSquad;

          loaded[squadDocument.id] =
            calculateLiveSquad(
              {
                ...data,
                squadId: squadDocument.id,
                players: Array.isArray(data.players)
                  ? data.players
                  : [],
              },
              killPointValue,
            );
        });

        setLiveSquads(loaded);
      },
      (error) => {
        console.error(
          "Unable to load live match squads:",
          error,
        );
        setMessage(
          "Unable to load live match squads.",
        );
      },
    );

    return unsubscribe;
  }, [
    isAdmin,
    killPointValue,
    liveSettings.status,
    matchId,
  ]);

  useEffect(() => {
    const timers = saveTimers.current;

    return () => {
      Object.values(timers).forEach((timer) =>
        clearTimeout(timer),
      );
    };
  }, []);

  if (authLoading || staffLoading) {
    return (
      <main className="min-h-screen bg-slate-950 p-6 text-white">
        Checking admin account...
      </main>
    );
  }

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 p-5 text-white">
        <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-slate-900 p-6 text-center">
          <h1 className="text-2xl font-black">
            N² Scrims Admin
          </h1>

          <p className="mt-2 text-sm text-slate-400">
            Sign in with the administrator account.
          </p>

          <button
            type="button"
            onClick={signIn}
            className="mt-6 w-full rounded-lg bg-white px-4 py-3 font-bold text-black"
          >
            Sign in with Google
          </button>

          {message && (
            <p className="mt-3 text-sm text-red-400">
              {message}
            </p>
          )}
        </div>
      </main>
    );
  }

  if (!isAdmin) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 p-5 text-white">
        <div className="w-full max-w-md rounded-2xl border border-red-500/30 bg-slate-900 p-6 text-center">
          <h1 className="text-2xl font-black text-red-400">
            Access denied
          </h1>

          <p className="mt-2 text-sm text-slate-300">
            This Google account is not authorized.
          </p>

          <p className="mt-1 text-xs text-slate-500">
            {user.email}
          </p>

          <button
            type="button"
            onClick={handleSignOut}
            className="mt-5 rounded-lg bg-white px-4 py-2 font-bold text-black"
          >
            Sign out
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 px-3 py-3 text-white">
      <div className="mx-auto max-w-[1900px]">
        <header className="rounded-2xl border border-white/10 bg-slate-900/90 p-4 shadow-xl">
          <div className="flex flex-col gap-4 2xl:flex-row 2xl:items-center 2xl:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.22em] text-violet-400">
                N² Scrims Tournament Control
              </p>

              <h1 className="mt-1 text-3xl font-black">
                Match {liveSettings.matchNumber}
              </h1>

              <p className="text-xs text-slate-400">
                {currentMatchInfo.map}
                {currentMatchInfo.startTime
                  ? ` · ${currentMatchInfo.startTime}`
                  : ""}
                {" · "}
                {tournamentSettings.gameMode}
                {" · "}
                {tournamentSettings.perspective}
                {" · "}
                {tournamentSettings.server}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {liveSettings.status === "not-started" && (
                <button
                  type="button"
                  onClick={() =>
                    void initializeMatch(
                      liveSettings.matchNumber,
                    )
                  }
                  disabled={
                    isStarting ||
                    squadsLoading ||
                    approvedSquads.length === 0
                  }
                  className="rounded-lg bg-green-500 px-5 py-2.5 text-sm font-black text-black disabled:opacity-50"
                >
                  {isStarting
                    ? "Starting..."
                    : "Start Match"}
                </button>
              )}

              {liveSettings.status === "live" && (
                <button
                  type="button"
                  onClick={() => void finalizeMatch()}
                  disabled={isFinalizing}
                  className="rounded-lg bg-red-500 px-5 py-2.5 text-sm font-black text-white disabled:opacity-50"
                >
                  {isFinalizing
                    ? "Finalizing..."
                    : "🏁 Finalize Match"}
                </button>
              )}

              {liveSettings.status === "finalized" && (
                <button
                  type="button"
                  onClick={() =>
                    void prepareNextMatch()
                  }
                  disabled={
                    isPreparingNext || isLastPlannedMatch
                  }
                  className="rounded-lg bg-violet-500 px-5 py-2.5 text-sm font-black text-white disabled:opacity-50"
                >
                  {isLastPlannedMatch
                    ? "Tournament Matches Complete"
                    : isPreparingNext
                      ? "Preparing..."
                      : "Prepare Next Match"}
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  const nextOpen = !showPreviousMatches;
                  setShowPreviousMatches(nextOpen);

                  if (nextOpen) {
                    setPreviousMatchNumber(
                      Math.max(
                        1,
                        liveSettings.status === "finalized"
                          ? liveSettings.matchNumber
                          : liveSettings.matchNumber - 1,
                      ),
                    );
                    void loadPreviousMatch(
                      Math.max(
                        1,
                        liveSettings.status === "finalized"
                          ? liveSettings.matchNumber
                          : liveSettings.matchNumber - 1,
                      ),
                    );
                  }
                }}
                disabled={liveSettings.status === "live"}
                className="rounded-lg border border-white/20 bg-white/10 px-5 py-2.5 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                ✏️ Edit Previous Matches
              </button>

              <button
                type="button"
                onClick={() => void resetTournament()}
                disabled={isResettingTournament}
                className="rounded-lg border border-red-500/50 bg-red-950 px-5 py-2.5 text-sm font-black text-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                title="Stops the tournament and permanently resets standings and saved match results."
              >
                {isResettingTournament
                  ? "Resetting..."
                  : "⛔ Stop & Reset Tournament"}
              </button>

              <button
                type="button"
                onClick={handleSignOut}
                className="rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-bold"
              >
                Sign out
              </button>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
            <StatBox
              label="Status"
              value={liveSettings.status}
            />

            <StatBox
              label="Map"
              value={currentMatchInfo.map}
            />

            <StatBox
              label="Kill Value"
              value={`${killPointValue} pts`}
            />

            <StatBox
              label="Squads"
              value={String(
                liveSquadList.length ||
                  approvedSquads.length,
              )}
            />

            <StatBox
              label="Alive Squads"
              value={`${aliveSquads}/${liveSquadList.length}`}
            />

            <StatBox
              label="Alive Players"
              value={`${alivePlayers}/${liveSquadList.length * playersPerSquad}`}
            />

            <StatBox
              label="Total Kills"
              value={String(totalLiveKills)}
            />

            <StatBox
              label="Placements"
              value={`${placementsSet}/${liveSquadList.length}`}
            />
          </div>

          {message && (
            <div className="mt-3 rounded-lg border border-violet-400/20 bg-violet-400/10 px-3 py-2 text-xs text-violet-100">
              {message}
            </div>
          )}
        </header>

        {showPreviousMatches && (
          <section className="mt-4 rounded-2xl border border-white/10 bg-slate-900 p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.22em] text-violet-400">
                  Historical Scoring
                </p>
                <h2 className="mt-1 text-2xl font-black">
                  Edit Previous Match Points
                </h2>
                <p className="mt-1 text-xs text-slate-400">
                  Edit saved kills, placement points, or total points. Overall standings recalculate when you save.
                </p>
              </div>

              <div className="flex flex-wrap items-end gap-2">
                <label>
                  <span className="mb-1 block text-[10px] font-bold uppercase text-slate-500">
                    Match
                  </span>
                  <select
                    value={previousMatchNumber}
                    onChange={(event) => {
                      const nextMatch = Number(event.target.value);
                      setPreviousMatchNumber(nextMatch);
                      void loadPreviousMatch(nextMatch);
                    }}
                    className="h-10 rounded-lg border border-white/10 bg-slate-950 px-3 text-sm font-black outline-none focus:border-violet-400"
                  >
                    {editableMatchNumbers.map((number) => (
                      <option key={number} value={number}>
                        Match {number}
                      </option>
                    ))}
                  </select>
                </label>

                <button
                  type="button"
                  onClick={() =>
                    void loadPreviousMatch(previousMatchNumber)
                  }
                  disabled={isLoadingPrevious}
                  className="h-10 rounded-lg border border-white/10 bg-white/5 px-4 text-sm font-black disabled:opacity-50"
                >
                  {isLoadingPrevious ? "Loading..." : "Reload"}
                </button>

                <button
                  type="button"
                  onClick={() => void savePreviousMatch()}
                  disabled={
                    isSavingPrevious ||
                    isLoadingPrevious ||
                    previousResults.length === 0
                  }
                  className="h-10 rounded-lg bg-violet-600 px-5 text-sm font-black disabled:opacity-50"
                >
                  {isSavingPrevious
                    ? "Saving..."
                    : "Save Match Changes"}
                </button>
              </div>
            </div>

            {isLoadingPrevious ? (
              <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-5 text-center text-sm text-slate-400">
                Loading Match {previousMatchNumber}...
              </div>
            ) : previousResults.length === 0 ? (
              <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-5 text-center text-sm text-slate-400">
                No saved results for Match {previousMatchNumber}.
              </div>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <div className="min-w-[760px]">
                  <div className="grid grid-cols-[70px_minmax(220px,1fr)_130px_150px_150px] gap-2 border-b border-white/10 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-slate-500">
                    <span>Slot</span>
                    <span>Squad</span>
                    <span>Kills</span>
                    <span>Place Pts</span>
                    <span>Total Pts</span>
                  </div>

                  {previousResults.map((result) => (
                    <div
                      key={result.squadId}
                      className="grid grid-cols-[70px_minmax(220px,1fr)_130px_150px_150px] items-center gap-2 border-b border-white/5 px-3 py-2"
                    >
                      <span className="font-black">
                        #{result.slot || "-"}
                      </span>

                      <div className="flex min-w-0 items-center gap-2">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-white/5">
                          {result.logoUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={result.logoUrl}
                              alt=""
                              className="h-full w-full object-contain p-1"
                            />
                          ) : (
                            <span className="text-[7px] text-slate-500">
                              LOGO
                            </span>
                          )}
                        </div>
                        <span className="truncate font-black">
                          {result.squadName}
                        </span>
                      </div>

                      <input
                        type="number"
                        min={0}
                        value={result.totalKills}
                        onChange={(event) =>
                          updatePreviousResult(
                            result.squadId,
                            "totalKills",
                            Number(event.target.value),
                          )
                        }
                        className="h-9 rounded-lg border border-white/10 bg-slate-950 px-3 text-center font-black outline-none focus:border-violet-400"
                      />

                      <input
                        type="number"
                        min={0}
                        value={result.placementPoints}
                        onChange={(event) =>
                          updatePreviousResult(
                            result.squadId,
                            "placementPoints",
                            Number(event.target.value),
                          )
                        }
                        className="h-9 rounded-lg border border-white/10 bg-slate-950 px-3 text-center font-black outline-none focus:border-violet-400"
                      />

                      <input
                        type="number"
                        min={0}
                        value={result.totalPoints}
                        onChange={(event) =>
                          updatePreviousResult(
                            result.squadId,
                            "totalPoints",
                            Number(event.target.value),
                          )
                        }
                        className="h-9 rounded-lg border border-white/10 bg-slate-950 px-3 text-center font-black outline-none focus:border-violet-400"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {squadsLoading ? (
          <div className="mt-4 rounded-2xl border border-white/10 bg-slate-900 p-6 text-sm">
            Loading approved squads...
          </div>
        ) : approvedSquads.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-yellow-400/20 bg-yellow-400/10 p-6 text-sm text-yellow-100">
            There are no approved squads.
          </div>
        ) : liveSettings.status === "not-started" ? (
          <div className="mt-4 rounded-2xl border border-white/10 bg-slate-900 p-8 text-center">
            <h2 className="text-xl font-black">
              Match {liveSettings.matchNumber} is ready
            </h2>

            <p className="mt-2 text-sm text-slate-400">
              {currentMatchInfo.map}
              {currentMatchInfo.startTime
                ? ` · Starts ${currentMatchInfo.startTime}`
                : ""}
              {" · "}
              {approvedSquads.length} approved squads
              will be loaded.
            </p>
          </div>
        ) : (
          <section className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {liveSquadList.map((squad) => (
              <SquadCard
                key={squad.squadId}
                squad={squad}
                disabled={
                  liveSettings.status !== "live"
                }
                isSaving={
                  savingSquadId === squad.squadId
                }
                onPlacementChange={(value) =>
                  changePlacement(
                    squad.squadId,
                    value,
                  )
                }
                onKillsChange={(
                  playerIndex,
                  value,
                ) =>
                  changePlayerKills(
                    squad.squadId,
                    playerIndex,
                    value,
                  )
                }
                onToggleAlive={(playerIndex) =>
                  togglePlayerAlive(
                    squad.squadId,
                    playerIndex,
                  )
                }
              />
            ))}
          </section>
        )}

        <footer className="mt-4 flex flex-col gap-2 rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-xs text-slate-400 lg:flex-row lg:items-center lg:justify-between">
          <span>
            🟢 All changes save automatically
          </span>

          <span>
            Kill Value: {killPointValue} pts · 1st: 10 ·
            2nd: 8 · 3rd: 6 · 4th–15th: 5 · 16th+: 2
          </span>
        </footer>
      </div>
    </main>
  );
}

function StatBox({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-center">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
        {label}
      </p>

      <p className="mt-1 text-lg font-black capitalize text-white">
        {value}
      </p>
    </div>
  );
}

function SquadCard({
  squad,
  disabled,
  isSaving,
  onPlacementChange,
  onKillsChange,
  onToggleAlive,
}: {
  squad: LiveSquad;
  disabled: boolean;
  isSaving: boolean;
  onPlacementChange: (value: string) => void;
  onKillsChange: (
    playerIndex: number,
    value: number,
  ) => void;
  onToggleAlive: (playerIndex: number) => void;
}) {
  return (
    <article
      className={`overflow-hidden rounded-xl border bg-slate-900 shadow-lg ${
        squad.isEliminated
          ? "border-red-500/30 opacity-60"
          : "border-white/10"
      }`}
    >
      <div className="flex items-center gap-2 border-b border-white/10 bg-black/20 p-3">
        <span className="shrink-0 rounded-md bg-violet-600 px-2 py-1 text-xs font-black">
          #{squad.slot}
        </span>

        <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-white/5">
          {squad.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={squad.logoUrl}
              alt={`${squad.squadName} logo`}
              className="h-full w-full object-contain p-1"
            />
          ) : (
            <span className="text-[7px] font-bold text-slate-500">
              LOGO
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-black">
            {squad.squadName}
          </p>

          <p
            className={`text-[10px] font-bold ${
              squad.isEliminated
                ? "text-red-400"
                : "text-green-400"
            }`}
          >
            {squad.isEliminated
              ? "Eliminated"
              : `${squad.alivePlayers} Alive`}
          </p>
        </div>

        <label className="w-16 shrink-0">
          <span className="mb-1 block text-center text-[8px] font-bold uppercase text-slate-500">
            Place
          </span>

          <input
            type="number"
            min={1}
            value={squad.placement ?? ""}
            disabled={disabled}
            onChange={(event) =>
              onPlacementChange(event.target.value)
            }
            className="h-8 w-full rounded-md border border-white/10 bg-slate-950 px-1 text-center text-sm font-black outline-none focus:border-violet-400 disabled:opacity-50"
            placeholder="-"
          />
        </label>
      </div>

      <div className="space-y-1.5 p-3">
        {squad.players.map(
          (player, playerIndex) => (
            <div
              key={`${squad.squadId}-${playerIndex}`}
              className="grid grid-cols-[minmax(0,1fr)_52px_64px] items-center gap-2"
            >
              <p className="truncate text-xs font-medium">
                {player.name}
              </p>

              <input
                type="number"
                min={0}
                value={player.kills}
                disabled={disabled}
                onChange={(event) =>
                  onKillsChange(
                    playerIndex,
                    Number(event.target.value),
                  )
                }
                className="h-7 w-full rounded-md border border-white/10 bg-slate-950 px-1 text-center text-xs font-black outline-none focus:border-violet-400 disabled:opacity-50"
              />

              <button
                type="button"
                disabled={disabled}
                onClick={() =>
                  onToggleAlive(playerIndex)
                }
                className={`h-7 rounded-md border px-1 text-[10px] font-black ${
                  player.isAlive
                    ? "border-green-500/40 bg-green-500/10 text-green-300"
                    : "border-red-500/40 bg-red-500/10 text-red-300"
                } disabled:opacity-50`}
              >
                {player.isAlive ? "Alive" : "Dead"}
              </button>
            </div>
          ),
        )}

        {isSaving && (
          <p className="pt-1 text-right text-[9px] font-bold text-yellow-300">
            Saving...
          </p>
        )}
      </div>

      <div className="grid grid-cols-4 gap-px border-t border-white/10 bg-white/10">
        <CompactScore
          label="Kills"
          value={squad.totalKills}
        />

        <CompactScore
          label="Kill Pts"
          value={squad.killPoints}
        />

        <CompactScore
          label="Place Pts"
          value={squad.placementPoints}
        />

        <CompactScore
          label="Total"
          value={squad.matchPoints}
          highlight
        />
      </div>
    </article>
  );
}

function CompactScore({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div className="bg-slate-900 px-1 py-2 text-center">
      <p className="text-[7px] font-bold uppercase tracking-wide text-slate-500">
        {label}
      </p>

      <p
        className={`mt-0.5 text-base font-black ${
          highlight ? "text-violet-400" : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
}