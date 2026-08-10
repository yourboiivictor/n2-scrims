import { NextRequest, NextResponse } from "next/server";

const OWNER_EMAIL = "victornicetry2@gmail.com";
const MAX_IMAGES = 6;
const MAX_DATA_URL_LENGTH = 11_000_000;

type RequestPlayer = {
  playerIndex: number;
  name: string;
  kills: number;
};

type RequestSquad = {
  squadId: string;
  squadName: string;
  slot: number;
  placement: number | null;
  players: RequestPlayer[];
};

type RequestBody = {
  matchNumber: number;
  killPointValue: number;
  squads: RequestSquad[];
  images: Array<{
    name: string;
    dataUrl: string;
  }>;
};

type UnknownRecord = Record<string, unknown>;

export async function POST(request: NextRequest) {
  try {
    const token = getBearerToken(request);

    if (!token) {
      return NextResponse.json(
        { error: "Missing Firebase sign-in token." },
        { status: 401 },
      );
    }

    const identity = await verifyFirebaseUser(token);

    if (!identity.email) {
      return NextResponse.json(
        { error: "Unable to verify administrator email." },
        { status: 401 },
      );
    }

    const authorized =
      identity.email.toLowerCase() === OWNER_EMAIL ||
      (await verifyStaffAdmin(identity.email, token));

    if (!authorized) {
      return NextResponse.json(
        { error: "Administrator access required." },
        { status: 403 },
      );
    }

    const body = (await request.json()) as RequestBody;

    if (
      !Array.isArray(body.images) ||
      body.images.length === 0 ||
      body.images.length > MAX_IMAGES
    ) {
      return NextResponse.json(
        { error: `Upload between 1 and ${MAX_IMAGES} screenshots.` },
        { status: 400 },
      );
    }

    if (!Array.isArray(body.squads) || body.squads.length === 0) {
      return NextResponse.json(
        { error: "The current match has no squads to compare." },
        { status: 400 },
      );
    }

    for (const image of body.images) {
      if (
        typeof image.dataUrl !== "string" ||
        !image.dataUrl.startsWith("data:image/") ||
        image.dataUrl.length > MAX_DATA_URL_LENGTH
      ) {
        return NextResponse.json(
          {
            error: `Screenshot ${image.name || ""} is invalid or too large.`,
          },
          { status: 400 },
        );
      }
    }

    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY is not configured in Vercel." },
        { status: 500 },
      );
    }

    const content: Array<Record<string, unknown>> = [
      {
        type: "input_text",
        text: buildPrompt(body),
      },
      ...body.images.map((image) => ({
        type: "input_image",
        image_url: image.dataUrl,
        detail: "high",
      })),
    ];

    const aiResponse = await fetch(
      "https://api.openai.com/v1/responses",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model:
            process.env.OPENAI_MATCH_REVIEW_MODEL || "gpt-5-mini",
          input: [
            {
              role: "user",
              content,
            },
          ],
        }),
      },
    );

    const aiPayload: unknown = await aiResponse.json();

    if (!aiResponse.ok) {
      console.error("OpenAI review error:", aiPayload);

      return NextResponse.json(
        {
          error:
            getNestedString(aiPayload, ["error", "message"]) ||
            "The AI service could not review the screenshots.",
        },
        { status: 502 },
      );
    }

    const parsed = parseJsonObject(extractResponseText(aiPayload));

    if (!parsed) {
      return NextResponse.json(
        {
          error:
            "AI returned an unreadable review. Try again.",
        },
        { status: 502 },
      );
    }

    return NextResponse.json(
      normalizeReview(parsed, body.squads),
    );
  } catch (error) {
    console.error("AI match review route failed:", error);

    return NextResponse.json(
      { error: "Unable to review screenshots." },
      { status: 500 },
    );
  }
}

function getBearerToken(request: NextRequest) {
  const value = request.headers.get("authorization") || "";
  return value.startsWith("Bearer ") ? value.slice(7) : "";
}

async function verifyFirebaseUser(idToken: string) {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;

  if (!apiKey) {
    throw new Error(
      "NEXT_PUBLIC_FIREBASE_API_KEY is missing.",
    );
  }

  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ idToken }),
      cache: "no-store",
    },
  );

  if (!response.ok) {
    return { email: "" };
  }

  const payload: unknown = await response.json();
  const payloadRecord = asRecord(payload);
  const users = Array.isArray(payloadRecord?.users)
    ? payloadRecord.users
    : [];
  const firstUser = asRecord(users[0]);

  return {
    email:
      typeof firstUser?.email === "string"
        ? firstUser.email
        : "",
  };
}

async function verifyStaffAdmin(
  email: string,
  idToken: string,
) {
  const projectId =
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

  if (!projectId) return false;

  const url =
    `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}` +
    `/databases/(default)/documents/staff/${encodeURIComponent(email.toLowerCase())}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${idToken}`,
    },
    cache: "no-store",
  });

  if (!response.ok) return false;

  const payload: unknown = await response.json();
  const payloadRecord = asRecord(payload);
  const fields = asRecord(payloadRecord?.fields);
  const active = asRecord(fields?.active);
  const role = asRecord(fields?.role);

  return (
    active?.booleanValue === true &&
    role?.stringValue === "admin"
  );
}

function buildPrompt(body: RequestBody) {
  return `You are reviewing PUBG Mobile tournament-result screenshots for N² Scrims.

CURRENT MATCH: ${body.matchNumber}
KILL POINT VALUE: ${body.killPointValue}

REGISTERED CURRENT-MATCH ROSTER:
${JSON.stringify(body.squads, null, 2)}

Read only visible screenshot data. Extract squad name, player IGN, individual kills, and placement when visible. Fuzzy-match screenshot names to the registered roster. Small spelling, capitalization, spaces, punctuation, superscripts, and clan separators can still be the same player. Use squad context and teammates as evidence. Do not force ambiguous matches. Never invent values. Do not calculate official points. Set applySuggestedName=true only when the screenshot clearly shows a changed IGN and confidence is at least 0.90. confidence is 0 to 1.

Return JSON only with this shape:
{
  "summary": "short review summary",
  "warnings": ["warning if any"],
  "squads": [{
    "squadId": "one supplied squadId",
    "squadName": "registered squad name",
    "screenshotSquadName": "name read or empty",
    "placement": 1,
    "confidence": 0.98,
    "players": [{
      "playerIndex": 0,
      "registeredName": "registered IGN",
      "screenshotName": "IGN read or empty",
      "kills": 4,
      "confidence": 0.97,
      "nameMatch": "exact|similar|uncertain",
      "applySuggestedName": false,
      "note": "optional"
    }]
  }]
}

Use null for unreadable kills or placement. Include only squads you can reasonably identify.`;
}

function extractResponseText(payload: unknown) {
  const payloadRecord = asRecord(payload);

  if (typeof payloadRecord?.output_text === "string") {
    return payloadRecord.output_text;
  }

  const output = Array.isArray(payloadRecord?.output)
    ? payloadRecord.output
    : [];

  const parts: string[] = [];

  for (const outputItem of output) {
    const outputRecord = asRecord(outputItem);
    const content = Array.isArray(outputRecord?.content)
      ? outputRecord.content
      : [];

    for (const contentItem of content) {
      const contentRecord = asRecord(contentItem);

      if (typeof contentRecord?.text === "string") {
        parts.push(contentRecord.text);
      }
    }
  }

  return parts.join("\n");
}

function parseJsonObject(value: string): unknown | null {
  if (!value) return null;

  const cleaned = value
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  try {
    return JSON.parse(cleaned) as unknown;
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");

    if (start === -1 || end <= start) {
      return null;
    }

    try {
      return JSON.parse(
        cleaned.slice(start, end + 1),
      ) as unknown;
    } catch {
      return null;
    }
  }
}

function normalizeReview(
  value: unknown,
  squads: RequestSquad[],
) {
  const valueRecord = asRecord(value);
  const validSquads = new Map(
    squads.map((squad) => [squad.squadId, squad]),
  );

  const candidateSquads = Array.isArray(valueRecord?.squads)
    ? valueRecord.squads
    : [];

  const normalized = candidateSquads
    .map((candidateValue) => {
      const candidate = asRecord(candidateValue);
      const candidateSquadId =
        typeof candidate?.squadId === "string"
          ? candidate.squadId
          : "";

      const registered =
        validSquads.get(candidateSquadId);

      if (!registered) return null;

      const candidatePlayers = Array.isArray(
        candidate?.players,
      )
        ? candidate.players
        : [];

      const players = candidatePlayers
        .map((playerValue) => {
          const player = asRecord(playerValue);
          const playerIndex = Number(
            player?.playerIndex,
          );

          const registeredPlayer =
            registered.players.find(
              (item) =>
                item.playerIndex === playerIndex,
            );

          if (!registeredPlayer) return null;

          const screenshotName =
            typeof player?.screenshotName === "string"
              ? player.screenshotName.trim()
              : "";

          const confidence = clamp01(
            Number(player?.confidence),
          );

          const rawKills = player?.kills;

          return {
            playerIndex,
            registeredName: registeredPlayer.name,
            screenshotName,
            kills:
              rawKills === null ||
              rawKills === undefined ||
              Number.isNaN(Number(rawKills))
                ? null
                : Math.max(0, Number(rawKills)),
            confidence,
            nameMatch:
              player?.nameMatch === "exact" ||
              player?.nameMatch === "similar"
                ? player.nameMatch
                : "uncertain",
            applySuggestedName:
              Boolean(player?.applySuggestedName) &&
              Boolean(screenshotName) &&
              confidence >= 0.9,
            note:
              typeof player?.note === "string"
                ? player.note
                : "",
          };
        })
        .filter(
          (
            player,
          ): player is NonNullable<typeof player> =>
            player !== null,
        );

      const rawPlacement = candidate?.placement;

      return {
        squadId: registered.squadId,
        squadName: registered.squadName,
        screenshotSquadName:
          typeof candidate?.screenshotSquadName ===
          "string"
            ? candidate.screenshotSquadName
            : "",
        placement:
          rawPlacement === null ||
          rawPlacement === undefined ||
          Number.isNaN(Number(rawPlacement))
            ? null
            : Math.max(1, Number(rawPlacement)),
        confidence: clamp01(
          Number(candidate?.confidence),
        ),
        players,
        note:
          typeof candidate?.note === "string"
            ? candidate.note
            : "",
      };
    })
    .filter(
      (
        squad,
      ): squad is NonNullable<typeof squad> =>
        squad !== null,
    );

  const warnings = Array.isArray(valueRecord?.warnings)
    ? valueRecord.warnings.filter(
        (warning): warning is string =>
          typeof warning === "string",
      )
    : [];

  return {
    summary:
      typeof valueRecord?.summary === "string"
        ? valueRecord.summary
        : `Reviewed ${normalized.length} squad(s).`,
    warnings,
    squads: normalized,
  };
}

function asRecord(
  value: unknown,
): UnknownRecord | null {
  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
  ) {
    return value as UnknownRecord;
  }

  return null;
}

function getNestedString(
  value: unknown,
  path: string[],
) {
  let current: unknown = value;

  for (const key of path) {
    const record = asRecord(current);

    if (!record) return "";

    current = record[key];
  }

  return typeof current === "string" ? current : "";
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}
