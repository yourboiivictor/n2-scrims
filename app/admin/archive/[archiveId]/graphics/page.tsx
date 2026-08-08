"use client";

import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
} from "firebase/firestore";
import { onAuthStateChanged, User } from "firebase/auth";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { auth, db } from "@/firebase";

const ADMIN_EMAIL = "victornicetry2@gmail.com";

type ArchivedStanding = {
  squadId: string;
  rank: number;
  squadName: string;
  logoUrl: string;
  chickenDinners: number;
  totalKills: number;
  totalPoints: number;
};

export default function ArchiveGraphicsPage() {
  const params = useParams<{ archiveId: string }>();
  const archiveId = params.archiveId;

  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [title, setTitle] = useState("Tournament Archive");
  const [season, setSeason] = useState("");
  const [standings, setStandings] = useState<ArchivedStanding[]>([]);
  const [message, setMessage] = useState("");
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const isAdmin =
    user?.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();

  useEffect(
    () =>
      onAuthStateChanged(auth, (currentUser) => {
        setUser(currentUser);
        setAuthLoading(false);
      }),
    [],
  );

  useEffect(() => {
    if (!isAdmin || !archiveId) return;

    void (async () => {
      try {
        const [archiveSnapshot, standingsSnapshot] = await Promise.all([
          getDoc(doc(db, "tournamentArchives", archiveId)),
          getDocs(
            query(
              collection(
                db,
                "tournamentArchives",
                archiveId,
                "standings",
              ),
              orderBy("rank", "asc"),
            ),
          ),
        ]);

        if (archiveSnapshot.exists()) {
          const data = archiveSnapshot.data();
          setTitle(
            typeof data.tournamentName === "string"
              ? data.tournamentName
              : "Tournament Archive",
          );
          setSeason(
            typeof data.season === "string" ? data.season : "",
          );
        }

        const rows: ArchivedStanding[] = standingsSnapshot.docs.map(
          (standingDocument) => {
            const data = standingDocument.data();
            return {
              squadId: standingDocument.id,
              rank: Number(data.rank) || 0,
              squadName:
                typeof data.squadName === "string"
                  ? data.squadName
                  : "Unnamed Squad",
              logoUrl:
                typeof data.logoUrl === "string"
                  ? data.logoUrl
                  : "",
              chickenDinners:
                Number(data.chickenDinners) || 0,
              totalKills: Number(data.totalKills) || 0,
              totalPoints: Number(data.totalPoints) || 0,
            };
          },
        );

        setStandings(rows);
        setReady(true);
      } catch (error) {
        console.error(error);
        setMessage("Unable to load archived graphics data.");
      }
    })();
  }, [isAdmin, archiveId]);

  async function generate() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = 1080;
    canvas.height = 1920;

    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, 1080, 1920);

    drawPolynesianPattern(ctx, 1080, 1920);

    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.font = "900 70px Arial";
    ctx.fillText(title, 540, 150);

    ctx.font = "700 30px Arial";
    ctx.fillStyle = "#d4d4d4";
    ctx.fillText(
      `${season ? `Season ${season} · ` : ""}Archived Results`,
      540,
      205,
    );

    ctx.font = "900 42px Arial";
    ctx.fillStyle = "#ffffff";
    ctx.fillText("FINAL STANDINGS", 540, 300);

    const topTen = standings.slice(0, 10);
    const loaded = await Promise.all(
      topTen.map(async (row) => {
        if (!row.logoUrl) return null;
        try {
          return await loadCanvasImage(row.logoUrl);
        } catch {
          return null;
        }
      }),
    );

    topTen.forEach((row, index) => {
      const y = 430 + index * 128;

      ctx.fillStyle =
        index === 0
          ? "rgba(255,255,255,0.18)"
          : index === 1
            ? "rgba(255,255,255,0.12)"
            : index === 2
              ? "rgba(255,255,255,0.08)"
              : "rgba(255,255,255,0.045)";

      roundedRect(ctx, 60, y, 960, 104, 18);
      ctx.fill();

      ctx.textAlign = "left";
      ctx.fillStyle = "#ffffff";
      ctx.font = "900 32px Arial";
      ctx.fillText(`#${row.rank || index + 1}`, 90, y + 64);

      const logoX = 185;
      const logoY = y + 14;
      const logoSize = 76;

      ctx.fillStyle = "#ffffff";
      roundedRect(ctx, logoX, logoY, logoSize, logoSize, 14);
      ctx.fill();

      const image = loaded[index];
      if (image) {
        drawImageContained(
          ctx,
          image,
          logoX + 6,
          logoY + 6,
          logoSize - 12,
          logoSize - 12,
        );
      }

      ctx.textAlign = "left";
      ctx.fillStyle = "#ffffff";
      ctx.font = "900 28px Arial";
      ctx.fillText(row.squadName.slice(0, 22), 290, y + 47);

      ctx.font = "700 18px Arial";
      ctx.fillStyle = "#bdbdbd";
      ctx.fillText(
        `${row.chickenDinners} dinners · ${row.totalKills} kills`,
        290,
        y + 76,
      );

      ctx.textAlign = "right";
      ctx.fillStyle = "#ffffff";
      ctx.font = "900 34px Arial";
      ctx.fillText(String(row.totalPoints), 970, y + 63);
    });

    ctx.textAlign = "center";
    ctx.fillStyle = "#8a8a8a";
    ctx.font = "700 22px Arial";
    ctx.fillText("N² SCRIMS ARCHIVE", 540, 1810);

    setMessage("");
  }

  async function download() {
    await generate();
    const canvas = canvasRef.current;
    if (!canvas) return;

    const link = document.createElement("a");
    link.download = `${title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-results.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  }

  if (authLoading) {
    return (
      <main className="min-h-screen bg-black p-6 text-white">
        Checking admin account...
      </main>
    );
  }

  if (!user || !isAdmin) {
    return (
      <main className="min-h-screen bg-black p-6 text-white">
        Admin access required.
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black px-4 py-5 text-white">
      <div className="mx-auto max-w-6xl">
        <header className="rounded-2xl border border-white/10 bg-neutral-950 p-5">
          <Link
            href={`/admin/archive/${archiveId}`}
            className="text-sm font-black text-white"
          >
            ← Back to Archive
          </Link>

          <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.22em] text-neutral-400">
                Archived Results Graphics
              </p>
              <h1 className="mt-1 text-3xl font-black">
                {title}
              </h1>
            </div>

            <button
              type="button"
              onClick={() => void download()}
              disabled={!ready}
              className="rounded-lg bg-white px-5 py-3 font-black text-black disabled:opacity-50"
            >
              Download 1080 × 1920 PNG
            </button>
          </div>

          {message && (
            <div className="mt-4 rounded-lg border border-white/20 bg-white/5 px-4 py-3 text-sm">
              {message}
            </div>
          )}
        </header>

        <section className="mt-4 grid gap-4 lg:grid-cols-[1fr_420px]">
          <div className="rounded-2xl border border-white/10 bg-neutral-950 p-5">
            <h2 className="text-xl font-black">
              Archived Top 10
            </h2>

            <div className="mt-4 space-y-2">
              {standings.slice(0, 10).map((row) => (
                <div
                  key={row.squadId}
                  className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate font-black">
                      #{row.rank} {row.squadName}
                    </p>
                    <p className="text-xs text-neutral-400">
                      {row.chickenDinners} dinners · {row.totalKills} kills
                    </p>
                  </div>

                  <span className="text-xl font-black">
                    {row.totalPoints}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-neutral-950 p-4">
            <canvas
              ref={canvasRef}
              className="h-auto w-full rounded-xl border border-white/10"
            />
            <button
              type="button"
              onClick={() => void generate()}
              disabled={!ready}
              className="mt-3 w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 font-black disabled:opacity-50"
            >
              Refresh Preview
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}

function loadCanvasImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Unable to load logo"));
    image.src = src;
  });
}

function drawImageContained(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const scale = Math.min(
    width / image.naturalWidth,
    height / image.naturalHeight,
  );
  const drawWidth = image.naturalWidth * scale;
  const drawHeight = image.naturalHeight * scale;
  ctx.drawImage(
    image,
    x + (width - drawWidth) / 2,
    y + (height - drawHeight) / 2,
    drawWidth,
    drawHeight,
  );
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(
    x + width,
    y + height,
    x + width - r,
    y + height,
  );
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawPolynesianPattern(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
) {
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.05)";
  ctx.lineWidth = 4;

  const cell = 120;

  for (let y = 340; y < height - 70; y += cell) {
    for (let x = -cell; x < width + cell; x += cell) {
      const cx = x + ((Math.floor(y / cell) % 2) * cell) / 2;

      ctx.beginPath();
      ctx.moveTo(cx, y + 48);
      ctx.lineTo(cx + 30, y + 18);
      ctx.lineTo(cx + 60, y + 48);
      ctx.lineTo(cx + 90, y + 18);
      ctx.lineTo(cx + 120, y + 48);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(cx + 30, y + 76);
      ctx.lineTo(cx + 60, y + 56);
      ctx.lineTo(cx + 90, y + 76);
      ctx.lineTo(cx + 60, y + 96);
      ctx.closePath();
      ctx.stroke();
    }
  }

  ctx.restore();
}
