"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { onAuthStateChanged, signOut, User } from "firebase/auth";
import { auth } from "@/firebase";

const ADMIN_EMAIL = "victornicetry2@gmail.com";

export default function GlobalNavigation() {
  const pathname = usePathname();
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    return onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setReady(true);
      setSigningOut(false);
    });
  }, []);

  if (pathname.startsWith("/overlay")) {
    return null;
  }

  const isHome = pathname === "/";
  const isSupport = pathname.startsWith("/support");
  const isAdmin =
    user?.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();

  async function handleSignOut() {
    if (signingOut) return;

    setSigningOut(true);

    try {
      await signOut(auth);
      setSigningOut(false);
      router.replace("/");
      router.refresh();
    } catch (error) {
      console.error("Sign-out error:", error);
      setSigningOut(false);
    }
  }

  return (
    <div
      className={`fixed top-4 z-[100] flex flex-wrap gap-2 ${
        isHome ? "right-4" : "left-4"
      }`}
    >
      {!isHome && (
        <button
          type="button"
          onClick={() =>
            window.history.length > 1
              ? router.back()
              : router.push("/")
          }
          className="rounded-xl border border-white/15 bg-slate-950/90 px-4 py-2.5 text-sm font-black text-white backdrop-blur transition hover:border-violet-400/50 hover:bg-violet-600"
        >
          ← Back
        </button>
      )}

      {!isSupport && (
        <Link
          href="/support"
          className="rounded-xl border border-amber-400/40 bg-amber-400/10 px-4 py-2.5 text-sm font-black text-amber-300 backdrop-blur transition hover:bg-amber-400 hover:text-black"
        >
          ★ Support N²
        </Link>
      )}

      {isHome && ready && isAdmin && (
        <Link
          href="/admin"
          className="rounded-xl border border-violet-400/30 bg-slate-950/90 px-4 py-2.5 text-sm font-black text-violet-200 backdrop-blur transition hover:bg-violet-600 hover:text-white"
        >
          ⚙️ Admin
        </Link>
      )}

      {ready && user && (
        <button
          type="button"
          onClick={handleSignOut}
          disabled={signingOut}
          className="rounded-xl border border-red-500/30 bg-slate-950/90 px-4 py-2.5 text-sm font-black text-red-300 backdrop-blur transition hover:bg-red-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {signingOut ? "Signing Out..." : "🚪 Sign Out"}
        </button>
      )}
    </div>
  );
}
