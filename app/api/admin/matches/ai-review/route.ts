import { NextRequest, NextResponse } from "next/server";

const OWNER_EMAIL = "victornicetry2@gmail.com";
const MAX_IMAGES = 6;
const MAX_DATA_URL_LENGTH = 11_000_000;

type RequestPlayer = { playerIndex: number; name: string; kills: number };
type RequestSquad = { squadId: string; squadName: string; slot: number; placement: number | null; players: RequestPlayer[] };
type RequestBody = { matchNumber: number; killPointValue: number; squads: RequestSquad[]; images: Array<{ name: string; dataUrl: string }> };

export async function POST(request: NextRequest) {
  try {
    const token = getBearerToken(request);
    if (!token) return NextResponse.json({ error: "Missing Firebase sign-in token." }, { status: 401 });

    const identity = await verifyFirebaseUser(token);
    if (!identity.email) return NextResponse.json({ error: "Unable to verify administrator email." }, { status: 401 });

    const authorized = identity.email.toLowerCase() === OWNER_EMAIL || await verifyStaffAdmin(identity.email, token);
    if (!authorized) return NextResponse.json({ error: "Administrator access required." }, { status: 403 });

    const body = (await request.json()) as RequestBody;
    if (!Array.isArray(body.images) || body.images.length === 0 || body.images.length > MAX_IMAGES) {
      return NextResponse.json({ error: `Upload between 1 and ${MAX_IMAGES} screenshots.` }, { status: 400 });
    }
    if (!Array.isArray(body.squads) || body.squads.length === 0) {
      return NextResponse.json({ error: "The current match has no squads to compare." }, { status: 400 });
    }
    for (const image of body.images) {
      if (typeof image.dataUrl !== "string" || !image.dataUrl.startsWith("data:image/") || image.dataUrl.length > MAX_DATA_URL_LENGTH) {
        return NextResponse.json({ error: `Screenshot ${image.name || ""} is invalid or too large.` }, { status: 400 });
      }
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "OPENAI_API_KEY is not configured in Vercel." }, { status: 500 });

    const content: Array<Record<string, unknown>> = [
      { type: "input_text", text: buildPrompt(body) },
      ...body.images.map((image) => ({ type: "input_image", image_url: image.dataUrl, detail: "high" })),
    ];

    const aiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.OPENAI_MATCH_REVIEW_MODEL || "gpt-5-mini",
        input: [{ role: "user", content }],
      }),
    });
    const aiPayload = await aiResponse.json();
    if (!aiResponse.ok) {
      console.error("OpenAI review error:", aiPayload);
      return NextResponse.json({ error: aiPayload?.error?.message || "The AI service could not review the screenshots." }, { status: 502 });
    }

    const parsed = parseJsonObject(extractResponseText(aiPayload));
    if (!parsed) return NextResponse.json({ error: "AI returned an unreadable review. Try again." }, { status: 502 });
    return NextResponse.json(normalizeReview(parsed, body.squads));
  } catch (error) {
    console.error("AI match review route failed:", error);
    return NextResponse.json({ error: "Unable to review screenshots." }, { status: 500 });
  }
}

function getBearerToken(request: NextRequest) {
  const value = request.headers.get("authorization") || "";
  return value.startsWith("Bearer ") ? value.slice(7) : "";
}

async function verifyFirebaseUser(idToken: string) {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  if (!apiKey) throw new Error("NEXT_PUBLIC_FIREBASE_API_KEY is missing.");
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken }),
    cache: "no-store",
  });
  if (!response.ok) return { email: "" };
  const payload = await response.json();
  return { email: typeof payload?.users?.[0]?.email === "string" ? payload.users[0].email : "" };
}

async function verifyStaffAdmin(email: string, idToken: string) {
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (!projectId) return false;
  const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/staff/${encodeURIComponent(email.toLowerCase())}`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${idToken}` }, cache: "no-store" });
  if (!response.ok) return false;
  const payload = await response.json();
  const fields = payload?.fields || {};
  return fields?.active?.booleanValue === true && fields?.role?.stringValue === "admin";
}

function buildPrompt(body: RequestBody) {
  return `You are reviewing PUBG Mobile tournament-result screenshots for N² Scrims.\n\nCURRENT MATCH: ${body.matchNumber}\nKILL POINT VALUE: ${body.killPointValue}\n\nREGISTERED CURRENT-MATCH ROSTER:\n${JSON.stringify(body.squads, null, 2)}\n\nRead only visible screenshot data. Extract squad name, player IGN, individual kills, and placement when visible. Fuzzy-match screenshot names to the registered roster. Small spelling, capitalization, spaces, punctuation, superscripts, and clan separators can still be the same player. Use squad context and teammates as evidence. Do not force ambiguous matches. Never invent values. Do not calculate official points. Set applySuggestedName=true only when the screenshot clearly shows a changed IGN and confidence is at least 0.90. confidence is 0 to 1.\n\nReturn JSON only with this shape:\n{\n  \"summary\": \"short review summary\",\n  \"warnings\": [\"warning if any\"],\n  \"squads\": [{\n    \"squadId\": \"one supplied squadId\",\n    \"squadName\": \"registered squad name\",\n    \"screenshotSquadName\": \"name read or empty\",\n    \"placement\": 1,\n    \"confidence\": 0.98,\n    \"players\": [{\n      \"playerIndex\": 0,\n      \"registeredName\": \"registered IGN\",\n      \"screenshotName\": \"IGN read or empty\",\n      \"kills\": 4,\n      \"confidence\": 0.97,\n      \"nameMatch\": \"exact|similar|uncertain\",\n      \"applySuggestedName\": false,\n      \"note\": \"optional\"\n    }]\n  }]\n}\nUse null for unreadable kills or placement. Include only squads you can reasonably identify.`;
}

function extractResponseText(payload: any) {
  if (typeof payload?.output_text === "string") return payload.output_text;
  const parts: string[] = [];
  for (const output of Array.isArray(payload?.output) ? payload.output : []) {
    for (const content of Array.isArray(output?.content) ? output.content : []) {
      if (typeof content?.text === "string") parts.push(content.text);
    }
  }
  return parts.join("\n");
}

function parseJsonObject(value: string) {
  if (!value) return null;
  const cleaned = value.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
  try { return JSON.parse(cleaned); } catch {}
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try { return JSON.parse(cleaned.slice(start, end + 1)); } catch { return null; }
}

function normalizeReview(value: any, squads: RequestSquad[]) {
  const validSquads = new Map(squads.map((squad) => [squad.squadId, squad]));
  const normalized = (Array.isArray(value?.squads) ? value.squads : []).map((candidate: any) => {
    const registered = validSquads.get(candidate?.squadId);
    if (!registered) return null;
    const players = (Array.isArray(candidate?.players) ? candidate.players : []).map((player: any) => {
      const playerIndex = Number(player?.playerIndex);
      const registeredPlayer = registered.players.find((item) => item.playerIndex === playerIndex);
      if (!registeredPlayer) return null;
      const screenshotName = typeof player?.screenshotName === "string" ? player.screenshotName.trim() : "";
      const confidence = clamp01(Number(player?.confidence));
      return {
        playerIndex,
        registeredName: registeredPlayer.name,
        screenshotName,
        kills: player?.kills == null || Number.isNaN(Number(player.kills)) ? null : Math.max(0, Number(player.kills)),
        confidence,
        nameMatch: player?.nameMatch === "exact" || player?.nameMatch === "similar" ? player.nameMatch : "uncertain",
        applySuggestedName: Boolean(player?.applySuggestedName) && Boolean(screenshotName) && confidence >= 0.9,
        note: typeof player?.note === "string" ? player.note : "",
      };
    }).filter(Boolean);
    return {
      squadId: registered.squadId,
      squadName: registered.squadName,
      screenshotSquadName: typeof candidate?.screenshotSquadName === "string" ? candidate.screenshotSquadName : "",
      placement: candidate?.placement == null || Number.isNaN(Number(candidate.placement)) ? null : Math.max(1, Number(candidate.placement)),
      confidence: clamp01(Number(candidate?.confidence)),
      players,
      note: typeof candidate?.note === "string" ? candidate.note : "",
    };
  }).filter(Boolean);
  return {
    summary: typeof value?.summary === "string" ? value.summary : `Reviewed ${normalized.length} squad(s).`,
    warnings: Array.isArray(value?.warnings) ? value.warnings.filter((w: unknown): w is string => typeof w === "string") : [],
    squads: normalized,
  };
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}
