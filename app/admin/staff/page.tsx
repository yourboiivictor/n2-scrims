"use client";

import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
} from "firebase/firestore";
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  User,
} from "firebase/auth";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { auth, db, googleProvider } from "@/firebase";

const OWNER_EMAIL = "victornicetry2@gmail.com";
const INITIAL_ADMIN_EMAIL = "ateikaati@gmail.com";

type StaffRole = "owner" | "admin";

type StaffMember = {
  id: string;
  email: string;
  role: StaffRole;
  active: boolean;
  createdAt?: Timestamp | null;
};

export default function StaffManagementPage() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [email, setEmail] = useState(INITIAL_ADMIN_EMAIL);
  const [message, setMessage] = useState("");
  const [workingEmail, setWorkingEmail] = useState<string | null>(null);

  const isOwner =
    user?.email?.toLowerCase() === OWNER_EMAIL.toLowerCase();

  useEffect(() => {
    return onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!isOwner) return;

    async function bootstrapStaff() {
      try {
        await setDoc(
          doc(db, "staff", OWNER_EMAIL),
          {
            email: OWNER_EMAIL,
            role: "owner",
            active: true,
            protected: true,
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        );

        await setDoc(
          doc(db, "staff", INITIAL_ADMIN_EMAIL),
          {
            email: INITIAL_ADMIN_EMAIL,
            role: "admin",
            active: true,
            protected: false,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        );
      } catch (error) {
        console.error("Unable to initialize staff:", error);
        setMessage("Unable to initialize the staff list.");
      }
    }

    void bootstrapStaff();
  }, [isOwner]);

  useEffect(() => {
    if (!isOwner) return;

    let staffQuery;
    try {
      staffQuery = query(collection(db, "staff"), orderBy("email"));
    } catch {
      staffQuery = collection(db, "staff");
    }

    return onSnapshot(
      staffQuery,
      (snapshot) => {
        const loaded = snapshot.docs.map((staffDocument) => {
          const data = staffDocument.data();
          return {
            id: staffDocument.id,
            email:
              typeof data.email === "string"
                ? data.email
                : staffDocument.id,
            role: data.role === "owner" ? "owner" : "admin",
            active: data.active !== false,
            createdAt: data.createdAt || null,
          } as StaffMember;
        });

        loaded.sort((a, b) => {
          if (a.role !== b.role) return a.role === "owner" ? -1 : 1;
          return a.email.localeCompare(b.email);
        });

        setStaff(loaded);
      },
      (error) => {
        console.error("Unable to load staff:", error);
        setMessage("Unable to load staff members.");
      },
    );
  }, [isOwner]);

  const activeAdmins = useMemo(
    () => staff.filter((member) => member.role === "admin" && member.active),
    [staff],
  );

  async function addAdmin() {
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail || !cleanEmail.includes("@")) {
      setMessage("Enter a valid Google email address.");
      return;
    }

    if (cleanEmail === OWNER_EMAIL) {
      setMessage("The owner account is already protected.");
      return;
    }

    setWorkingEmail(cleanEmail);
    setMessage("");

    try {
      await setDoc(
        doc(db, "staff", cleanEmail),
        {
          email: cleanEmail,
          role: "admin",
          active: true,
          protected: false,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          addedBy: user?.email || OWNER_EMAIL,
        },
        { merge: true },
      );

      setMessage(`${cleanEmail} now has full admin access.`);
      setEmail("");
    } catch (error) {
      console.error("Unable to add admin:", error);
      setMessage("Unable to add this administrator.");
    } finally {
      setWorkingEmail(null);
    }
  }

  async function toggleAdmin(member: StaffMember) {
    if (member.role === "owner") return;

    setWorkingEmail(member.email);
    setMessage("");

    try {
      await updateDoc(doc(db, "staff", member.id), {
        active: !member.active,
        updatedAt: serverTimestamp(),
      });
      setMessage(
        `${member.email} was ${member.active ? "disabled" : "enabled"}.`,
      );
    } catch (error) {
      console.error("Unable to update admin:", error);
      setMessage("Unable to update this administrator.");
    } finally {
      setWorkingEmail(null);
    }
  }

  async function removeAdmin(member: StaffMember) {
    if (member.role === "owner") return;

    if (!window.confirm(`Remove admin access for ${member.email}?`)) {
      return;
    }

    setWorkingEmail(member.email);
    setMessage("");

    try {
      await deleteDoc(doc(db, "staff", member.id));
      setMessage(`${member.email} was removed from staff.`);
    } catch (error) {
      console.error("Unable to remove admin:", error);
      setMessage("Unable to remove this administrator.");
    } finally {
      setWorkingEmail(null);
    }
  }

  if (authLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black text-white">
        Checking owner account...
      </main>
    );
  }

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black px-6 text-white">
        <section className="w-full max-w-md rounded-3xl border border-blue-900 bg-black/90 p-8 text-center">
          <p className="text-sm font-black uppercase tracking-[0.35em] text-blue-400">
            N² Scrims
          </p>
          <h1 className="mt-4 text-4xl font-black uppercase">
            Staff Management
          </h1>
          <button
            type="button"
            onClick={() => void signInWithPopup(auth, googleProvider)}
            className="mt-8 w-full rounded-xl bg-blue-700 px-6 py-4 font-black uppercase"
          >
            Sign In With Google
          </button>
        </section>
      </main>
    );
  }

  if (!isOwner) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black px-6 text-white">
        <section className="w-full max-w-lg rounded-3xl border border-red-900 bg-black/90 p-8 text-center">
          <h1 className="text-3xl font-black uppercase text-red-400">
            Owner Only
          </h1>
          <p className="mt-4 text-gray-400">
            Only {OWNER_EMAIL} can add, disable, or remove administrators.
          </p>
          <button
            type="button"
            onClick={() => void signOut(auth)}
            className="mt-7 rounded-xl bg-blue-700 px-6 py-3 font-bold uppercase"
          >
            Sign Out
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black px-4 py-8 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <header className="rounded-3xl border border-blue-900 bg-black/90 p-6">
          <p className="text-sm font-black uppercase tracking-[0.3em] text-blue-400">
            N² Scrims Owner
          </p>
          <div className="mt-2 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-3xl font-black uppercase sm:text-4xl">
                Staff Management
              </h1>
              <p className="mt-2 text-sm text-gray-400">
                Admins can manage everything except staff roles.
              </p>
            </div>
            <Link
              href="/admin"
              className="rounded-xl border border-blue-700 px-5 py-3 text-center text-sm font-black uppercase text-blue-300"
            >
              Back to Admin
            </Link>
          </div>
        </header>

        {message && (
          <div className="mt-5 rounded-xl border border-blue-900 bg-blue-950/30 px-4 py-3 text-sm text-blue-200">
            {message}
          </div>
        )}

        <section className="mt-6 grid gap-3 sm:grid-cols-3">
          <Stat label="Owner" value="1" />
          <Stat label="Active Admins" value={String(activeAdmins.length)} />
          <Stat label="Total Staff" value={String(staff.length)} />
        </section>

        <section className="mt-6 rounded-3xl border border-blue-900 bg-black/90 p-6">
          <h2 className="text-2xl font-black uppercase">Add Administrator</h2>
          <p className="mt-2 text-sm text-gray-400">
            The account must sign in with this exact Google email address.
          </p>

          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="friend@gmail.com"
              className="flex-1 rounded-xl border border-gray-700 bg-gray-950 px-4 py-3 text-white outline-none focus:border-blue-500"
            />
            <button
              type="button"
              onClick={() => void addAdmin()}
              disabled={workingEmail !== null}
              className="rounded-xl bg-blue-700 px-6 py-3 font-black uppercase disabled:opacity-50"
            >
              Add Admin
            </button>
          </div>
        </section>

        <section className="mt-6 overflow-hidden rounded-3xl border border-blue-900 bg-black/90">
          <div className="border-b border-blue-900 px-6 py-5">
            <h2 className="text-2xl font-black uppercase">Current Staff</h2>
          </div>

          <div className="divide-y divide-gray-900">
            {staff.map((member) => {
              const isWorking = workingEmail === member.email;
              const isProtected = member.role === "owner";

              return (
                <div
                  key={member.id}
                  className="flex flex-col gap-4 px-6 py-5 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-black">{member.email}</p>
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-black uppercase ${
                          member.role === "owner"
                            ? "bg-yellow-500/20 text-yellow-300"
                            : "bg-blue-500/20 text-blue-300"
                        }`}
                      >
                        {member.role}
                      </span>
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-black uppercase ${
                          member.active
                            ? "bg-green-500/20 text-green-300"
                            : "bg-red-500/20 text-red-300"
                        }`}
                      >
                        {member.active ? "Active" : "Disabled"}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-gray-500">
                      {isProtected
                        ? "Protected owner account"
                        : "Full admin access except staff management"}
                    </p>
                  </div>

                  {isProtected ? (
                    <span className="rounded-xl border border-yellow-700/50 px-4 py-2 text-sm font-black uppercase text-yellow-300">
                      Protected
                    </span>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void toggleAdmin(member)}
                        disabled={isWorking}
                        className="rounded-xl border border-blue-700 px-4 py-2 text-sm font-black uppercase text-blue-300 disabled:opacity-50"
                      >
                        {member.active ? "Disable" : "Enable"}
                      </button>
                      <button
                        type="button"
                        onClick={() => void removeAdmin(member)}
                        disabled={isWorking}
                        className="rounded-xl border border-red-700 bg-red-950/40 px-4 py-2 text-sm font-black uppercase text-red-300 disabled:opacity-50"
                      >
                        Remove
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-blue-900 bg-black/90 p-5">
      <p className="text-xs font-black uppercase tracking-widest text-gray-500">
        {label}
      </p>
      <p className="mt-2 text-3xl font-black text-blue-300">{value}</p>
    </div>
  );
}
