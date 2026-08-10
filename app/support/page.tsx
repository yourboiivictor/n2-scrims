"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";

type TierId = "supporter" | "elite" | "vip";

type Tier = {
  id: TierId;
  name: string;
  price: string;
  tagline: string;
  benefits: string[];
  featured?: boolean;
};

const TIERS: Tier[] = [
  {
    id: "supporter",
    name: "Supporter",
    price: "$2.99",
    tagline: "Help keep N² Scrims running.",
    benefits: [
      "Monthly support for N² Scrims",
      "Supporter recognition",
      "Helps cover hosting and AI match review costs",
    ],
  },
  {
    id: "elite",
    name: "Elite Supporter",
    price: "$5.99",
    tagline: "Extra support for the scrim community.",
    benefits: [
      "Everything in Supporter",
      "Elite supporter recognition",
      "Helps fund broadcasts, graphics, and tournament tools",
    ],
    featured: true,
  },
  {
    id: "vip",
    name: "N² VIP",
    price: "$9.99",
    tagline: "Highest monthly support tier.",
    benefits: [
      "Everything in Elite Supporter",
      "VIP supporter recognition",
      "Helps support prizes and future N² Scrims upgrades",
    ],
  },
];

export default function SupportPage() {
  const searchParams = useSearchParams();
  const [loadingTier, setLoadingTier] = useState<TierId | null>(null);
  const [message, setMessage] = useState("");

  const status = searchParams.get("status");

  async function subscribe(tier: TierId) {
    setLoadingTier(tier);
    setMessage("");

    try {
      const response = await fetch("/api/paypal/subscription", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ tier }),
      });

      const payload = await response.json();

      if (!response.ok || !payload?.approvalUrl) {
        throw new Error(
          payload?.error || "Unable to start PayPal subscription.",
        );
      }

      window.location.href = payload.approvalUrl;
    } catch (error) {
      console.error(error);
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to start PayPal subscription.",
      );
      setLoadingTier(null);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-24 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <section className="text-center">
          <p className="text-xs font-black uppercase tracking-[0.3em] text-fuchsia-300">
            N² Scrims Community
          </p>

          <h1 className="mt-4 text-4xl font-black sm:text-5xl">
            💜 Support N² Scrims
          </h1>

          <p className="mx-auto mt-4 max-w-2xl text-sm leading-6 text-slate-400 sm:text-base">
            Monthly support helps cover website hosting, AI screenshot review,
            tournament graphics, broadcasts, prizes, and future upgrades.
          </p>
        </section>

        {status === "success" && (
          <div className="mx-auto mt-8 max-w-2xl rounded-2xl border border-green-400/30 bg-green-400/10 px-5 py-4 text-center text-sm font-bold text-green-200">
            Thank you for supporting N² Scrims. PayPal approved your subscription.
          </div>
        )}

        {status === "cancelled" && (
          <div className="mx-auto mt-8 max-w-2xl rounded-2xl border border-yellow-400/30 bg-yellow-400/10 px-5 py-4 text-center text-sm font-bold text-yellow-100">
            PayPal checkout was cancelled. No subscription was created.
          </div>
        )}

        {message && (
          <div className="mx-auto mt-8 max-w-2xl rounded-2xl border border-red-400/30 bg-red-400/10 px-5 py-4 text-center text-sm font-bold text-red-100">
            {message}
          </div>
        )}

        <section className="mt-10 grid gap-5 lg:grid-cols-3">
          {TIERS.map((tier) => (
            <article
              key={tier.id}
              className={`relative rounded-3xl border p-6 ${
                tier.featured
                  ? "border-fuchsia-400/50 bg-fuchsia-500/10 shadow-2xl shadow-fuchsia-950/30"
                  : "border-white/10 bg-slate-900"
              }`}
            >
              {tier.featured && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-fuchsia-500 px-4 py-1 text-[10px] font-black uppercase tracking-wider text-white">
                  Most Popular
                </span>
              )}

              <h2 className="text-2xl font-black">{tier.name}</h2>
              <p className="mt-2 text-sm text-slate-400">{tier.tagline}</p>

              <div className="mt-6">
                <span className="text-4xl font-black">{tier.price}</span>
                <span className="ml-2 text-sm font-bold text-slate-500">
                  / month
                </span>
              </div>

              <ul className="mt-6 space-y-3 text-sm text-slate-300">
                {tier.benefits.map((benefit) => (
                  <li key={benefit} className="flex gap-2">
                    <span className="text-fuchsia-300">✓</span>
                    <span>{benefit}</span>
                  </li>
                ))}
              </ul>

              <button
                type="button"
                onClick={() => void subscribe(tier.id)}
                disabled={loadingTier !== null}
                className={`mt-8 w-full rounded-xl px-5 py-3.5 text-sm font-black transition disabled:cursor-not-allowed disabled:opacity-50 ${
                  tier.featured
                    ? "bg-fuchsia-500 text-white hover:bg-fuchsia-400"
                    : "bg-white text-black hover:bg-slate-200"
                }`}
              >
                {loadingTier === tier.id
                  ? "Opening PayPal..."
                  : `Subscribe ${tier.price}/mo`}
              </button>
            </article>
          ))}
        </section>

        <p className="mx-auto mt-8 max-w-2xl text-center text-xs leading-5 text-slate-500">
          Recurring subscriptions are processed by PayPal. Payments are sent to
          the PayPal Business account connected to N² Scrims.
        </p>
      </div>
    </main>
  );
}
