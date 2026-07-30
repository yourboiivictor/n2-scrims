"use client";

import {
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  User,
} from "firebase/auth";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { auth, db, googleProvider } from "@/firebase";
import {
  defaultTournamentSettings,
  MatchScheduleItem,
  TournamentSettings,
} from "@/lib/tournamentClient";

const ADMIN_EMAIL = "victornicetry2@gmail.com";

const MAP_OPTIONS = [
  "Erangel",
  "Miramar",
  "Sanhok",
  "Vikendi",
  "Livik",
  "Karakin",
  "Nusa",
  "Rondo",
];

function normalizeSchedule(
  data: Partial<TournamentSettings>,
): MatchScheduleItem[] {
  if (Array.isArray(data.matchSchedule) && data.matchSchedule.length > 0) {
    return data.matchSchedule
      .map((item, index) => ({
        id:
          typeof item?.id === "string" && item.id
            ? item.id
            : `match-${index + 1}`,
        map:
          typeof item?.map === "string" && item.map
            ? item.map
            : "Erangel",
        startTime:
          typeof item?.startTime === "string"
            ? item.startTime
            : "",
      }))
      .filter((item) => item.map);
  }

  if (Array.isArray(data.maps) && data.maps.length > 0) {
    return data.maps
      .filter((map): map is string => typeof map === "string")
      .map((map, index) => ({
        id: `match-${index + 1}`,
        map,
        startTime: "",
      }));
  }

  return defaultTournamentSettings.matchSchedule;
}

function normalizeSettings(
  data: Partial<TournamentSettings>,
): TournamentSettings {
  const matchSchedule = normalizeSchedule(data);

  return {
    ...defaultTournamentSettings,
    ...data,
    matchSchedule,
    maps: matchSchedule.map((match) => match.map),
    matchesPlanned: matchSchedule.length,
    rules: Array.isArray(data.rules)
      ? data.rules.filter(
          (rule): rule is string => typeof rule === "string",
        )
      : defaultTournamentSettings.rules,
  };
}

function createScheduleId() {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  return `match-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}`;
}

export default function TournamentSettingsPage() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [settings, setSettings] = useState<TournamentSettings>(
    defaultTournamentSettings,
  );
  const [newRule, setNewRule] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const isAdmin =
    user?.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();

  const schedule = useMemo(
    () => settings.matchSchedule ?? [],
    [settings.matchSchedule],
  );

  useEffect(() => {
    return onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!isAdmin) return;

    return onSnapshot(
      doc(db, "settings", "tournament"),
      (snapshot) => {
        if (!snapshot.exists()) {
          setSettings(defaultTournamentSettings);
          return;
        }

        setSettings(
          normalizeSettings(
            snapshot.data() as Partial<TournamentSettings>,
          ),
        );
      },
      (error) => {
        console.error("Unable to load settings:", error);
        setMessage("Unable to load tournament settings.");
      },
    );
  }, [isAdmin]);

  function updateSetting<K extends keyof TournamentSettings>(
    key: K,
    value: TournamentSettings[K],
  ) {
    setSettings((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function updateSchedule(
    nextSchedule: MatchScheduleItem[],
  ) {
    setSettings((current) => ({
      ...current,
      matchSchedule: nextSchedule,
      maps: nextSchedule.map((match) => match.map),
      matchesPlanned: nextSchedule.length,
    }));
  }

  function addMatch() {
    const previous = schedule[schedule.length - 1];

    updateSchedule([
      ...schedule,
      {
        id: createScheduleId(),
        map: previous?.map || "Erangel",
        startTime: "",
      },
    ]);
  }

  function removeMatch(index: number) {
    if (schedule.length <= 1) {
      setMessage("The tournament must have at least one match.");
      return;
    }

    updateSchedule(
      schedule.filter((_, matchIndex) => matchIndex !== index),
    );
  }

  function updateMatch(
    index: number,
    changes: Partial<MatchScheduleItem>,
  ) {
    updateSchedule(
      schedule.map((match, matchIndex) =>
        matchIndex === index
          ? { ...match, ...changes }
          : match,
      ),
    );
  }

  function moveMatch(index: number, direction: -1 | 1) {
    const nextIndex = index + direction;

    if (
      nextIndex < 0 ||
      nextIndex >= schedule.length
    ) {
      return;
    }

    const nextSchedule = [...schedule];

    [nextSchedule[index], nextSchedule[nextIndex]] = [
      nextSchedule[nextIndex],
      nextSchedule[index],
    ];

    updateSchedule(nextSchedule);
  }

  function addRule() {
    const trimmedRule = newRule.trim();

    if (!trimmedRule) return;

    setSettings((current) => ({
      ...current,
      rules: [...(current.rules ?? []), trimmedRule],
    }));

    setNewRule("");
  }

  function removeRule(index: number) {
    setSettings((current) => ({
      ...current,
      rules: (current.rules ?? []).filter(
        (_, ruleIndex) => ruleIndex !== index,
      ),
    }));
  }

  async function save() {
    setSaving(true);
    setMessage("");

    try {
      const cleanedSchedule = schedule.map(
        (match, index) => ({
          id: match.id || `match-${index + 1}`,
          map: match.map.trim() || "Erangel",
          startTime: match.startTime.trim(),
        }),
      );

      const cleanedSettings: TournamentSettings = {
        ...settings,
        name: settings.name.trim() || "N² Scrims",
        season: settings.season.trim(),
        streamUrl: settings.streamUrl.trim(),
        matchSchedule: cleanedSchedule,
        maps: cleanedSchedule.map((match) => match.map),
        matchesPlanned: cleanedSchedule.length,
        rules: settings.rules ?? [],
        maxSquads: Math.max(
          1,
          Number(settings.maxSquads) || 1,
        ),
        playersPerSquad: Math.max(
          1,
          Number(settings.playersPerSquad) || 1,
        ),
        killPoints: Math.max(
          0,
          Number(settings.killPoints) || 0,
        ),
      };

      await setDoc(
        doc(db, "settings", "tournament"),
        {
          ...cleanedSettings,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );

      setMessage("Tournament settings and match schedule saved.");
    } catch (error) {
      console.error("Unable to save settings:", error);
      setMessage("Unable to save tournament settings.");
    } finally {
      setSaving(false);
    }
  }

  if (authLoading) {
    return (
      <main className="min-h-screen bg-slate-950 p-6 text-white">
        Checking admin account...
      </main>
    );
  }

  if (!user) {
    return (
      <SignIn
        onClick={async () => {
          const provider =
            googleProvider instanceof GoogleAuthProvider
              ? googleProvider
              : new GoogleAuthProvider();

          await signInWithPopup(auth, provider);
        }}
      />
    );
  }

  if (!isAdmin) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-white">
        <div className="rounded-2xl border border-red-500/30 bg-slate-900 p-6 text-center">
          <h1 className="text-2xl font-black text-red-400">
            Access denied
          </h1>
          <button
            type="button"
            onClick={() => void signOut(auth)}
            className="mt-5 rounded-lg bg-white px-4 py-2 font-black text-black"
          >
            Sign out
          </button>
        </div>
      </main>
    );
  }

  const rules = settings.rules ?? [];

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-5 text-white">
      <div className="mx-auto max-w-6xl">
        <header className="rounded-2xl border border-white/10 bg-slate-900 p-5">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-violet-400">
            N² Scrims Admin
          </p>

          <div className="mt-1 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-3xl font-black">
                Tournament Settings
              </h1>
              <p className="text-sm text-slate-400">
                Tournament details, schedule, format, scoring, and prizes.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link
                href="/admin"
                className="rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-black"
              >
                Admin
              </Link>
              <Link
                href="/admin/matches"
                className="rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-black"
              >
                Matches
              </Link>
              <Link
                href="/admin/tournament"
                className="rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-black"
              >
                Standings
              </Link>
            </div>
          </div>
        </header>

        {message && (
          <div className="mt-4 rounded-xl border border-violet-400/20 bg-violet-400/10 px-4 py-3 text-sm text-violet-100">
            {message}
          </div>
        )}

        <section className="mt-4 rounded-2xl border border-white/10 bg-slate-900 p-5">
          <SectionTitle
            title="Tournament Details"
            description="Main information shown throughout the website."
          />

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Field
              label="Tournament Name"
              value={settings.name}
              onChange={(value) =>
                updateSetting("name", value)
              }
            />
            <Field
              label="Season"
              value={settings.season}
              onChange={(value) =>
                updateSetting("season", value)
              }
              placeholder="Season 1"
            />
            <div className="md:col-span-2">
              <Field
                label="Public Stream Link"
                value={settings.streamUrl}
                onChange={(value) =>
                  updateSetting("streamUrl", value)
                }
                placeholder="https://www.tiktok.com/@yourname/live"
              />
            </div>
          </div>
        </section>

        <section className="mt-4 rounded-2xl border border-white/10 bg-slate-900 p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <SectionTitle
              title="Match Schedule"
              description="Choose each map and its expected start time."
            />

            <button
              type="button"
              onClick={addMatch}
              className="rounded-lg bg-violet-600 px-5 py-3 text-sm font-black"
            >
              + Add Match
            </button>
          </div>

          <div className="mt-5 space-y-3">
            {schedule.map((match, index) => (
              <div
                key={match.id}
                className="grid gap-3 rounded-2xl border border-white/10 bg-slate-950 p-4 lg:grid-cols-[90px_minmax(180px,1fr)_minmax(170px,220px)_auto]"
              >
                <div className="flex h-12 items-center justify-center rounded-xl bg-violet-600 font-black">
                  Match {index + 1}
                </div>

                <SelectField
                  label="Map"
                  value={match.map}
                  options={MAP_OPTIONS}
                  onChange={(value) =>
                    updateMatch(index, { map: value })
                  }
                />

                <label className="block">
                  <span className="mb-2 block text-xs font-black uppercase tracking-wider text-slate-500">
                    Start Time
                  </span>
                  <input
                    type="time"
                    value={match.startTime}
                    onChange={(event) =>
                      updateMatch(index, {
                        startTime: event.target.value,
                      })
                    }
                    className="h-12 w-full rounded-lg border border-white/10 bg-slate-900 px-4 outline-none focus:border-violet-400"
                  />
                </label>

                <div className="flex items-end gap-2">
                  <button
                    type="button"
                    onClick={() => moveMatch(index, -1)}
                    disabled={index === 0}
                    className="h-12 rounded-lg border border-white/10 px-3 font-black disabled:opacity-30"
                    aria-label={`Move Match ${index + 1} up`}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => moveMatch(index, 1)}
                    disabled={index === schedule.length - 1}
                    className="h-12 rounded-lg border border-white/10 px-3 font-black disabled:opacity-30"
                    aria-label={`Move Match ${index + 1} down`}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => removeMatch(index)}
                    disabled={schedule.length <= 1}
                    className="h-12 rounded-lg border border-red-500/30 bg-red-500/10 px-4 text-sm font-black text-red-300 disabled:opacity-30"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-slate-300">
            Planned matches:{" "}
            <strong className="text-white">
              {schedule.length}
            </strong>
          </div>
        </section>

        <section className="mt-4 rounded-2xl border border-white/10 bg-slate-900 p-5">
          <SectionTitle
            title="Match Format"
            description="Default format used for the tournament."
          />

          <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <SelectField
              label="Game Mode"
              value={settings.gameMode ?? "Classic"}
              options={[
                "Classic",
                "Ultimate Royale",
                "Metro Royale",
                "Custom",
              ]}
              onChange={(value) =>
                updateSetting("gameMode", value)
              }
            />

            <SelectField
              label="Perspective"
              value={settings.perspective ?? "TPP"}
              options={["TPP", "FPP"]}
              onChange={(value) =>
                updateSetting("perspective", value)
              }
            />

            <SelectField
              label="Server"
              value={settings.server ?? "North America"}
              options={[
                "North America",
                "Asia",
                "Europe",
                "Middle East",
                "South America",
                "KRJP",
              ]}
              onChange={(value) =>
                updateSetting("server", value)
              }
            />

            <NumberField
              label="Maximum Squads"
              value={settings.maxSquads ?? 25}
              min={1}
              max={25}
              onChange={(value) =>
                updateSetting("maxSquads", value)
              }
            />

            <NumberField
              label="Players Per Squad"
              value={settings.playersPerSquad ?? 4}
              min={1}
              max={8}
              onChange={(value) =>
                updateSetting("playersPerSquad", value)
              }
            />

            <NumberField
              label="Points Per Kill"
              value={settings.killPoints ?? 1}
              min={0}
              max={10}
              onChange={(value) =>
                updateSetting("killPoints", value)
              }
            />
          </div>
        </section>

        <section className="mt-4 rounded-2xl border border-white/10 bg-slate-900 p-5">
          <SectionTitle
            title="Prize Distribution"
            description="The prize values can include any currency or UC."
          />

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Field
              label="1st Place Prize"
              value={settings.prizeFirst}
              onChange={(value) =>
                updateSetting("prizeFirst", value)
              }
              placeholder="$500"
            />
            <Field
              label="2nd Place Prize"
              value={settings.prizeSecond}
              onChange={(value) =>
                updateSetting("prizeSecond", value)
              }
              placeholder="$250"
            />
            <Field
              label="3rd Place Prize"
              value={settings.prizeThird}
              onChange={(value) =>
                updateSetting("prizeThird", value)
              }
              placeholder="$100"
            />
            <Field
              label="MVP / Most Kills Prize"
              value={settings.prizeMvp}
              onChange={(value) =>
                updateSetting("prizeMvp", value)
              }
              placeholder="$50"
            />
          </div>
        </section>

        <section className="mt-4 rounded-2xl border border-white/10 bg-slate-900 p-5">
          <SectionTitle
            title="Tournament Rules"
            description="Add the rules players must follow."
          />

          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <input
              value={newRule}
              onChange={(event) =>
                setNewRule(event.target.value)
              }
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  addRule();
                }
              }}
              placeholder="Example: No teaming"
              className="h-12 flex-1 rounded-lg border border-white/10 bg-slate-950 px-4 outline-none focus:border-violet-400"
            />
            <button
              type="button"
              onClick={addRule}
              className="rounded-lg bg-white px-5 py-3 font-black text-black"
            >
              Add Rule
            </button>
          </div>

          <div className="mt-4 space-y-2">
            {rules.length === 0 ? (
              <p className="text-sm text-slate-500">
                No tournament rules added.
              </p>
            ) : (
              rules.map((rule, index) => (
                <div
                  key={`${rule}-${index}`}
                  className="flex items-center gap-3 rounded-xl border border-white/10 bg-slate-950 px-4 py-3"
                >
                  <span className="text-sm font-black text-violet-400">
                    {index + 1}.
                  </span>
                  <span className="flex-1 text-sm">
                    {rule}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeRule(index)}
                    className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-black text-red-300"
                  >
                    Remove
                  </button>
                </div>
              ))
            )}
          </div>
        </section>

        <button
          type="button"
          onClick={() => void save()}
          disabled={
            saving ||
            !settings.name.trim() ||
            schedule.length === 0
          }
          className="mt-4 w-full rounded-xl bg-violet-600 px-5 py-4 text-lg font-black disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving
            ? "Saving Settings..."
            : "Save Tournament Settings"}
        </button>
      </div>
    </main>
  );
}

function SectionTitle({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div>
      <h2 className="text-xl font-black">{title}</h2>
      <p className="mt-1 text-sm text-slate-400">
        {description}
      </p>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder = "",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-black uppercase tracking-wider text-slate-500">
        {label}
      </span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-12 w-full rounded-lg border border-white/10 bg-slate-950 px-4 outline-none focus:border-violet-400"
      />
    </label>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-black uppercase tracking-wider text-slate-500">
        {label}
      </span>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(event) =>
          onChange(Number(event.target.value))
        }
        className="h-12 w-full rounded-lg border border-white/10 bg-slate-950 px-4 outline-none focus:border-violet-400"
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-black uppercase tracking-wider text-slate-500">
        {label}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-12 w-full rounded-lg border border-white/10 bg-slate-950 px-4 outline-none focus:border-violet-400"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function SignIn({
  onClick,
}: {
  onClick: () => Promise<void>;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-white">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-slate-900 p-6 text-center">
        <h1 className="text-2xl font-black">
          Tournament Settings
        </h1>
        <button
          type="button"
          onClick={() => void onClick()}
          className="mt-6 w-full rounded-lg bg-white px-4 py-3 font-black text-black"
        >
          Sign in with Google
        </button>
      </div>
    </main>
  );
}
