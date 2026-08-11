"use client";

import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";
import { useEffect, useState } from "react";
import { db } from "@/firebase";

type LiveMatchSettings = {
  matchNumber: number;
  status: "not-started" | "live" | "finalized";
  map?: string;
  aliveSquads?: number;
  alivePlayers?: number;
};

type TournamentSettings = {
  name: string;
  season?: string;
  eventName?: string;
  matchesPlanned: number;
  matchSchedule?: Array<{
    id: string;
    map: string;
    startTime: string;
  }>;
};

type Standing = {
  squadId: string;
  squadName: string;
  logoUrl: string;
  countryCode?: string;
  countryName?: string;
  totalKills: number;
  totalPoints: number;
};

const defaultTournament: TournamentSettings = {
  name: "N² Scrims",
  season: "Season 1",
  eventName: "Event 1",
  matchesPlanned: 1,
  matchSchedule: [],
};

export default function LiveOverlayPage() {
  const [liveMatch, setLiveMatch] = useState<LiveMatchSettings>({
    matchNumber: 1,
    status: "not-started",
    aliveSquads: 0,
    alivePlayers: 0,
  });

  const [tournament, setTournament] =
    useState<TournamentSettings>(defaultTournament);

  const [standings, setStandings] = useState<Standing[]>([]);
  const [squadCountries, setSquadCountries] = useState<
    Record<string, { countryCode: string; countryName: string }>
  >({});

  useEffect(() => {
    return onSnapshot(
      doc(db, "settings", "liveMatch"),
      (snapshot) => {
        if (!snapshot.exists()) return;

        const data = snapshot.data();

        setLiveMatch({
          matchNumber: Number(data.matchNumber) || 1,
          status:
            data.status === "live" || data.status === "finalized"
              ? data.status
              : "not-started",
          map: typeof data.map === "string" ? data.map : "",
          aliveSquads: Number(data.aliveSquads) || 0,
          alivePlayers: Number(data.alivePlayers) || 0,
        });
      },
      (error) => {
        console.error("Unable to load live match:", error);
      },
    );
  }, []);

  useEffect(() => {
    return onSnapshot(
      doc(db, "settings", "tournament"),
      (snapshot) => {
        if (!snapshot.exists()) {
          setTournament(defaultTournament);
          return;
        }

        const data = snapshot.data();

        setTournament({
          ...defaultTournament,
          ...(data as Partial<TournamentSettings>),
          matchSchedule: Array.isArray(data.matchSchedule)
            ? data.matchSchedule
            : [],
        });
      },
      (error) => {
        console.error("Unable to load tournament settings:", error);
      },
    );
  }, []);

  useEffect(() => {
    return onSnapshot(collection(db, "squads"), (snapshot) => {
      const countries: Record<
        string,
        { countryCode: string; countryName: string }
      > = {};

      snapshot.docs.forEach((squadDocument) => {
        const data = squadDocument.data();
        const country = {
          countryCode:
            typeof data.countryCode === "string" ? data.countryCode : "",
          countryName:
            typeof data.countryName === "string" ? data.countryName : "",
        };

        countries[squadDocument.id] = country;

        if (typeof data.squadName === "string" && data.squadName.trim()) {
          countries[`name:${normalizeSquadName(data.squadName)}`] = country;
        }
      });

      setSquadCountries(countries);
    });
  }, []);

  useEffect(() => {
    const standingsQuery = query(
      collection(db, "standings"),
      orderBy("totalPoints", "desc"),
    );

    return onSnapshot(
      standingsQuery,
      (snapshot) => {
        const loaded: Standing[] = snapshot.docs.map((standingDocument) => {
          const data = standingDocument.data();

          return {
            squadId: standingDocument.id,
            squadName:
              typeof data.squadName === "string"
                ? data.squadName
                : "Unnamed Squad",
            logoUrl:
              typeof data.logoUrl === "string" ? data.logoUrl : "",
            totalKills: Number(data.totalKills) || 0,
            totalPoints: Number(data.totalPoints) || 0,
          };
        });

        loaded.sort((a, b) => {
          if (b.totalPoints !== a.totalPoints) {
            return b.totalPoints - a.totalPoints;
          }

          if (b.totalKills !== a.totalKills) {
            return b.totalKills - a.totalKills;
          }

          return a.squadName.localeCompare(b.squadName);
        });

        setStandings(loaded);
      },
      (error) => {
        console.error("Unable to load standings:", error);
      },
    );
  }, []);

  const scheduledMatch =
    tournament.matchSchedule?.[liveMatch.matchNumber - 1];

  const currentMap =
    liveMatch.map || scheduledMatch?.map || "Map not set";

  const plannedMatches = Math.max(
    1,
    tournament.matchSchedule?.length ||
      Number(tournament.matchesPlanned) ||
      1,
  );

  const visibleStandings = standings.slice(0, 10);

  return (
    <main className="pointer-events-none min-h-screen bg-transparent text-white antialiased">
      <style jsx global>{`
        html,
        body {
          background: transparent !important;
        }

        body {
          margin: 0;
          overflow: hidden;
        }

        @keyframes overlay-enter {
          from {
            opacity: 0;
            transform: translateX(55px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }

        @keyframes live-pulse {
          0%,
          100% {
            opacity: 1;
          }
          50% {
            opacity: 0.45;
          }
        }

        .overlay-enter {
          animation: overlay-enter 0.55s ease-out both;
        }

        .live-pulse {
          animation: live-pulse 1.3s ease-in-out infinite;
        }

        @media (max-width: 900px) {
          .overlay-enter {
            width: min(92vw, 520px) !important;
            min-width: 0 !important;
            height: 94vh !important;
          }
        }
      `}</style>

      <div className="flex min-h-screen items-center justify-end px-6 py-4">
        <aside className="overlay-enter flex h-[94vh] w-[min(32vw,520px)] min-w-[440px] flex-col overflow-hidden border border-white/20 bg-transparent">
          <div className="h-px bg-white/40" />

          <header className="relative overflow-hidden border-b border-white bg-white px-6 py-5 text-black">
            <div className="absolute inset-0 bg-transparent" />

            <div className="relative">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden border border-black/20 bg-transparent">
                    {/* Place your logo at: public/n2-logo.png */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src="/n2-logo.png"
                      alt="N² logo"
                      className="h-full w-full object-contain p-1.5"
                      onError={(event) => {
                        event.currentTarget.style.display = "none";
                        const fallback =
                          event.currentTarget.nextElementSibling as HTMLElement | null;

                        if (fallback) {
                          fallback.style.display = "flex";
                        }
                      }}
                    />

                    <span className="hidden h-full w-full items-center justify-center text-xl font-black italic text-black">
                      N²
                    </span>
                  </div>

                  <div className="min-w-0">
                    <p className="truncate text-[11px] font-black uppercase tracking-[0.28em] text-black">
                      {tournament.name}
                    </p>

                    <p className="mt-1 truncate text-[12px] font-bold uppercase tracking-[0.16em] text-neutral-700">
                      {[tournament.season, tournament.eventName]
                        .filter(Boolean)
                        .join(" • ")}
                    </p>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2 rounded-full border border-black/30 bg-transparent px-3 py-1.5">
                  <span className="live-pulse h-2 w-2 rounded-full bg-black" />
                  <span className="text-[9px] font-black uppercase tracking-[0.18em] text-black">
                    {liveMatch.status === "live" ? "Live" : liveMatch.status}
                  </span>
                </div>
              </div>

              <div className="mt-5 flex items-end justify-between gap-4">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.24em] text-black">
                    Live Tournament
                  </p>
                  <h1 className="mt-1 text-4xl font-black uppercase italic leading-none">
                    Standings
                  </h1>
                </div>

                <div className="text-right">
                  <p className="text-[9px] font-black uppercase tracking-wider text-neutral-600">
                    Match
                  </p>
                  <p className="text-2xl font-black text-black">
                    {liveMatch.matchNumber}/{plannedMatches}
                  </p>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-3 gap-3">
                <InfoBox label="Map" value={currentMap} />
                <InfoBox
                  label="Alive"
                  value={
                    liveMatch.aliveSquads
                      ? `${liveMatch.aliveSquads} SQ`
                      : "—"
                  }
                />
                <InfoBox
                  label="Players"
                  value={
                    liveMatch.alivePlayers
                      ? String(liveMatch.alivePlayers)
                      : "—"
                  }
                />
              </div>
            </div>
          </header>

          <section className="min-h-0 flex-1 overflow-hidden bg-black/[0.85] px-4 py-4">
            <div className="grid grid-cols-[42px_34px_46px_minmax(0,1fr)_54px_60px] items-center gap-2 border-b border-white/10 px-2 pb-2 text-[9px] font-black uppercase tracking-[0.16em] text-white">
              <span>Rank</span>
              <span />
              <span />
              <span>Team</span>
              <span className="text-center">Kills</span>
              <span className="text-center">Total</span>
            </div>

            <div className="mt-3 space-y-2">
              {visibleStandings.length === 0 ? (
                <div className="border border-white/20 bg-black/20 p-8 text-center text-sm font-bold text-neutral-300">
                  Waiting for standings...
                </div>
              ) : (
                visibleStandings.map((standing, index) => (
                  <StandingRow
                    key={standing.squadId}
                    standing={{
                      ...standing,
                      countryCode:
                        squadCountries[standing.squadId]?.countryCode ||
                        squadCountries[
                          `name:${normalizeSquadName(standing.squadName)}`
                        ]?.countryCode ||
                        "",
                      countryName:
                        squadCountries[standing.squadId]?.countryName ||
                        squadCountries[
                          `name:${normalizeSquadName(standing.squadName)}`
                        ]?.countryName ||
                        "",
                    }}
                    rank={index + 1}
                  />
                ))
              )}
            </div>
          </section>

        </aside>
      </div>
    </main>
  );
}

function normalizeSquadName(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}



function RasterStandingRow({
  standing,
  rank,
  rankStyle,
}: {
  standing: Standing;
  rank: number;
  rankStyle: string;
}) {
  const [src, setSrc] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function renderRow() {
      const canvas = document.createElement("canvas");
      canvas.width = 760;
      canvas.height = 92;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Row background / border
      ctx.fillStyle = "rgba(0,0,0,0.2)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = "rgba(255,255,255,0.15)";
      ctx.lineWidth = 2;
      ctx.strokeRect(1, 1, canvas.width - 2, canvas.height - 2);

      // Rank box
      if (rank === 1) {
        ctx.fillStyle = "#facc15";
      } else if (rank === 2) {
        ctx.fillStyle = "#e2e8f0";
      } else {
        ctx.fillStyle = "rgba(255,255,255,0.08)";
      }
      ctx.fillRect(14, 18, 54, 54);

      ctx.fillStyle = rank === 1 ? "#422006" : "#ffffff";
      ctx.font = "900 26px Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(rank), 41, 45);

      // Flag box + drawn flag
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(84, 14, 64, 64);
      if (standing.countryCode) {
        drawFlagOnCanvas(
          ctx,
          standing.countryCode.trim().toUpperCase(),
          88,
          22,
          56,
          48,
        );
      }

      // Logo box
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(162, 14, 64, 64);

      if (standing.logoUrl) {
        try {
          const logo = await loadImageForCanvas(standing.logoUrl);
          drawContained(ctx, logo, 166, 18, 56, 56);
        } catch {
          ctx.fillStyle = "#111827";
          ctx.font = "700 12px Arial";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("LOGO", 194, 46);
        }
      }

      // Team name
      ctx.fillStyle = "#ffffff";
      ctx.font = "900 24px Arial";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      const team =
        standing.squadName.length > 20
          ? `${standing.squadName.slice(0, 19)}…`
          : standing.squadName;
      ctx.fillText(team.toUpperCase(), 246, 46);

      // Kills
      ctx.textAlign = "center";
      ctx.font = "900 25px Arial";
      ctx.fillText(String(standing.totalKills), 635, 46);

      // Total
      ctx.font = "900 28px Arial";
      ctx.fillText(String(standing.totalPoints), 716, 46);

      if (!cancelled) {
        setSrc(canvas.toDataURL("image/png"));
      }
    }

    renderRow().catch((error) => {
      console.error("Unable to rasterize standings row:", error);
    });

    return () => {
      cancelled = true;
    };
  }, [
    standing.countryCode,
    standing.logoUrl,
    standing.squadName,
    standing.totalKills,
    standing.totalPoints,
    rank,
  ]);

  if (!src) {
    return <div className="h-[56px] w-full" />;
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      className="block h-[56px] w-full object-fill"
    />
  );
}

function drawFlagOnCanvas(
  ctx: CanvasRenderingContext2D,
  code: string,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, width, height);
  ctx.clip();

  if (code === "KI") {
    ctx.fillStyle = "#CE1126";
    ctx.fillRect(x, y, width, height / 2);
    ctx.fillStyle = "#003F87";
    ctx.fillRect(x, y + height / 2, width, height / 2);

    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = Math.max(2, height * 0.07);
    for (let row = 0; row < 3; row += 1) {
      const baseY = y + height * (0.58 + row * 0.13);
      ctx.beginPath();
      ctx.moveTo(x, baseY);
      for (let i = 0; i <= 8; i += 1) {
        const px = x + (width / 8) * i;
        const py =
          baseY + (i % 2 === 0 ? -height * 0.035 : height * 0.035);
        ctx.lineTo(px, py);
      }
      ctx.stroke();
    }

    ctx.fillStyle = "#FCD116";
    ctx.beginPath();
    ctx.arc(x + width / 2, y + height * 0.32, height * 0.13, 0, Math.PI * 2);
    ctx.fill();
  } else if (code === "TO") {
    ctx.fillStyle = "#C10000";
    ctx.fillRect(x, y, width, height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(x, y, width * 0.46, height * 0.5);
    ctx.fillStyle = "#C10000";
    ctx.fillRect(x + width * 0.19, y + height * 0.06, width * 0.09, height * 0.38);
    ctx.fillRect(x + width * 0.10, y + height * 0.19, width * 0.27, height * 0.12);
  } else if (code === "SB") {
    ctx.fillStyle = "#0051BA";
    ctx.fillRect(x, y, width, height);
    ctx.fillStyle = "#215B33";
    ctx.beginPath();
    ctx.moveTo(x, y + height);
    ctx.lineTo(x + width, y);
    ctx.lineTo(x + width, y + height);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = "#FCD116";
    ctx.lineWidth = Math.max(4, height * 0.13);
    ctx.beginPath();
    ctx.moveTo(x - 2, y + height + 2);
    ctx.lineTo(x + width + 2, y - 2);
    ctx.stroke();
  } else if (code === "US") {
    const stripe = height / 13;
    for (let i = 0; i < 13; i += 1) {
      ctx.fillStyle = i % 2 === 0 ? "#B22234" : "#ffffff";
      ctx.fillRect(x, y + stripe * i, width, stripe + 0.5);
    }
    ctx.fillStyle = "#3C3B6E";
    ctx.fillRect(x, y, width * 0.42, stripe * 7);
  } else {
    ctx.fillStyle = "#111827";
    ctx.fillRect(x, y, width, height);
    ctx.strokeStyle = "rgba(255,255,255,0.65)";
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, width - 2, height - 2);
    ctx.fillStyle = "#ffffff";
    ctx.font = `700 ${Math.max(14, Math.floor(height * 0.38))}px Arial`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(code, x + width / 2, y + height / 2);
  }

  ctx.restore();
}

function loadImageForCanvas(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Unable to load image: ${src}`));
    image.src = src;
  });
}

function drawContained(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const ratio = Math.min(
    width / image.naturalWidth,
    height / image.naturalHeight,
  );
  const drawWidth = image.naturalWidth * ratio;
  const drawHeight = image.naturalHeight * ratio;
  const drawX = x + (width - drawWidth) / 2;
  const drawY = y + (height - drawHeight) / 2;

  ctx.drawImage(image, drawX, drawY, drawWidth, drawHeight);
}

function InfoBox({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="border border-black/20 bg-white px-3 py-3">
      <p className="truncate text-[8px] font-black uppercase tracking-wider text-neutral-600">
        {label}
      </p>
      <p className="mt-0.5 truncate text-[13px] font-black uppercase text-black">
        {value}
      </p>
    </div>
  );
}

function StandingRow({
  standing,
  rank,
}: {
  standing: Standing;
  rank: number;
}) {
  const rankStyle =
    rank === 1
      ? "bg-yellow-400 text-yellow-950 shadow-[0_0_18px_rgba(250,204,21,0.55)]"
      : rank === 2
        ? "bg-slate-200 text-black"
        : rank === 3
          ? " text-white"
          : " text-white";

  return (
    <div className="border border-white/15 bg-black/20 px-3 py-2">
      <RasterStandingRow standing={standing} rank={rank} rankStyle={rankStyle} />
    </div>
  );
}
