"use client";

import { useMemo, useRef, useState } from "react";
import { COUNTRIES, flagUrl, getCountryByCode } from "@/lib/countries";

export default function CountryPicker({
  value,
  onChange,
  disabled = false,
  label = "Country / Region",
}: {
  value: string;
  onChange: (code: string, name: string) => void;
  disabled?: boolean;
  label?: string;
}) {
  const selected = getCountryByCode(value);
  const [search, setSearch] = useState(selected?.name || "");
  const [open, setOpen] = useState(false);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();

    if (!term) return COUNTRIES;

    return COUNTRIES.filter(
      (country) =>
        country.name.toLowerCase().includes(term) ||
        country.code.toLowerCase().includes(term),
    );
  }, [search]);

  function chooseCountry(code: string, name: string) {
    if (blurTimer.current) clearTimeout(blurTimer.current);
    onChange(code, name);
    setSearch(name);
    setOpen(false);
  }

  return (
    <div className="relative">
      <label className="block text-sm font-bold text-gray-300">
        {label}
      </label>

      <div className="relative mt-2">
        {selected?.code && (
          <img
            src={flagUrl(selected.code, 40)}
            alt=""
            className="pointer-events-none absolute left-3 top-1/2 h-5 w-7 -translate-y-1/2 rounded-sm object-cover shadow-sm"
          />
        )}

        <input
          type="text"
          value={search}
          disabled={disabled}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            blurTimer.current = setTimeout(() => setOpen(false), 150);
          }}
          onChange={(event) => {
            const next = event.target.value;
            setSearch(next);
            setOpen(true);

            const exact = COUNTRIES.find(
              (country) => country.name.toLowerCase() === next.toLowerCase(),
            );

            if (!exact) {
              onChange("", "");
            }
          }}
          placeholder="Search country or region"
          autoComplete="off"
          className={`w-full rounded-xl border border-gray-700 bg-gray-950 py-3 pr-10 text-white outline-none focus:border-blue-500 disabled:cursor-not-allowed disabled:opacity-60 ${
            selected?.code ? "pl-12" : "pl-4"
          }`}
        />

        <button
          type="button"
          disabled={disabled}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => setOpen((current) => !current)}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg px-2 py-1 text-gray-400 hover:text-white disabled:opacity-50"
          aria-label="Toggle country list"
        >
          ▾
        </button>
      </div>

      {open && !disabled && (
        <div className="absolute z-[80] mt-2 max-h-72 w-full overflow-y-auto rounded-xl border border-gray-700 bg-gray-950 shadow-2xl">
          {filtered.length ? (
            filtered.map((country) => (
              <button
                key={country.code}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => chooseCountry(country.code, country.name)}
                className="flex w-full items-center gap-3 border-b border-white/5 px-4 py-3 text-left text-sm text-white hover:bg-blue-950"
              >
                <img
                  src={flagUrl(country.code, 40)}
                  alt=""
                  className="h-5 w-7 shrink-0 rounded-sm object-cover shadow-sm"
                />
                <span className="font-bold">{country.name}</span>
              </button>
            ))
          ) : (
            <div className="px-4 py-4 text-sm text-gray-400">
              No countries found.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
