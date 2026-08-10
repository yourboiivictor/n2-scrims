"use client";

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
  getDoc,
} from "firebase/firestore";
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  User,
} from "firebase/auth";
import Link from "next/link";
import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { auth, db, googleProvider } from "@/firebase";

type Player = {
  name: string;
  role?: string;
};

type SquadStatus = "pending" | "approved" | "rejected";

type Squad = {
  id: string;
  squadName: string;
  players: Player[];
  logoUrl?: string;
  logoPublicId?: string;
  ownerName?: string;
  ownerEmail?: string;
  facebookName?: string;
  countryCode?: string;
  countryName?: string;
  status: SquadStatus;
  slot?: number;
  createdAt?: Timestamp | Date | null;
};

const OWNER_EMAIL = "victornicetry2@gmail.com";

const COUNTRIES = [
  ["AF", "Afghanistan"],
  ["AL", "Albania"],
  ["DZ", "Algeria"],
  ["AS", "American Samoa"],
  ["AD", "Andorra"],
  ["AO", "Angola"],
  ["AI", "Anguilla"],
  ["AQ", "Antarctica"],
  ["AG", "Antigua and Barbuda"],
  ["AR", "Argentina"],
  ["AM", "Armenia"],
  ["AW", "Aruba"],
  ["AU", "Australia"],
  ["AT", "Austria"],
  ["AZ", "Azerbaijan"],
  ["BS", "Bahamas"],
  ["BH", "Bahrain"],
  ["BD", "Bangladesh"],
  ["BB", "Barbados"],
  ["BY", "Belarus"],
  ["BE", "Belgium"],
  ["BZ", "Belize"],
  ["BJ", "Benin"],
  ["BM", "Bermuda"],
  ["BT", "Bhutan"],
  ["BO", "Bolivia"],
  ["BQ", "Bonaire, Sint Eustatius and Saba"],
  ["BA", "Bosnia and Herzegovina"],
  ["BW", "Botswana"],
  ["BV", "Bouvet Island"],
  ["BR", "Brazil"],
  ["IO", "British Indian Ocean Territory"],
  ["BN", "Brunei"],
  ["BG", "Bulgaria"],
  ["BF", "Burkina Faso"],
  ["BI", "Burundi"],
  ["CV", "Cabo Verde"],
  ["KH", "Cambodia"],
  ["CM", "Cameroon"],
  ["CA", "Canada"],
  ["KY", "Cayman Islands"],
  ["CF", "Central African Republic"],
  ["TD", "Chad"],
  ["CL", "Chile"],
  ["CN", "China"],
  ["CX", "Christmas Island"],
  ["CC", "Cocos (Keeling) Islands"],
  ["CO", "Colombia"],
  ["KM", "Comoros"],
  ["CG", "Congo"],
  ["CD", "Congo, Democratic Republic of the"],
  ["CK", "Cook Islands"],
  ["CR", "Costa Rica"],
  ["HR", "Croatia"],
  ["CU", "Cuba"],
  ["CW", "Curaçao"],
  ["CY", "Cyprus"],
  ["CZ", "Czechia"],
  ["CI", "Côte d’Ivoire"],
  ["DK", "Denmark"],
  ["DJ", "Djibouti"],
  ["DM", "Dominica"],
  ["DO", "Dominican Republic"],
  ["EC", "Ecuador"],
  ["EG", "Egypt"],
  ["SV", "El Salvador"],
  ["GQ", "Equatorial Guinea"],
  ["ER", "Eritrea"],
  ["EE", "Estonia"],
  ["SZ", "Eswatini"],
  ["ET", "Ethiopia"],
  ["FK", "Falkland Islands"],
  ["FO", "Faroe Islands"],
  ["FJ", "Fiji"],
  ["FI", "Finland"],
  ["FR", "France"],
  ["GF", "French Guiana"],
  ["PF", "French Polynesia"],
  ["TF", "French Southern Territories"],
  ["GA", "Gabon"],
  ["GM", "Gambia"],
  ["GE", "Georgia"],
  ["DE", "Germany"],
  ["GH", "Ghana"],
  ["GI", "Gibraltar"],
  ["GR", "Greece"],
  ["GL", "Greenland"],
  ["GD", "Grenada"],
  ["GP", "Guadeloupe"],
  ["GU", "Guam"],
  ["GT", "Guatemala"],
  ["GG", "Guernsey"],
  ["GN", "Guinea"],
  ["GW", "Guinea-Bissau"],
  ["GY", "Guyana"],
  ["HT", "Haiti"],
  ["HM", "Heard Island and McDonald Islands"],
  ["VA", "Holy See"],
  ["HN", "Honduras"],
  ["HK", "Hong Kong"],
  ["HU", "Hungary"],
  ["IS", "Iceland"],
  ["IN", "India"],
  ["ID", "Indonesia"],
  ["IR", "Iran"],
  ["IQ", "Iraq"],
  ["IE", "Ireland"],
  ["IM", "Isle of Man"],
  ["IL", "Israel"],
  ["IT", "Italy"],
  ["JM", "Jamaica"],
  ["JP", "Japan"],
  ["JE", "Jersey"],
  ["JO", "Jordan"],
  ["KZ", "Kazakhstan"],
  ["KE", "Kenya"],
  ["KI", "Kiribati"],
  ["KP", "Korea, North"],
  ["KR", "Korea, South"],
  ["KW", "Kuwait"],
  ["KG", "Kyrgyzstan"],
  ["LA", "Laos"],
  ["LV", "Latvia"],
  ["LB", "Lebanon"],
  ["LS", "Lesotho"],
  ["LR", "Liberia"],
  ["LY", "Libya"],
  ["LI", "Liechtenstein"],
  ["LT", "Lithuania"],
  ["LU", "Luxembourg"],
  ["MO", "Macao"],
  ["MG", "Madagascar"],
  ["MW", "Malawi"],
  ["MY", "Malaysia"],
  ["MV", "Maldives"],
  ["ML", "Mali"],
  ["MT", "Malta"],
  ["MH", "Marshall Islands"],
  ["MQ", "Martinique"],
  ["MR", "Mauritania"],
  ["MU", "Mauritius"],
  ["YT", "Mayotte"],
  ["MX", "Mexico"],
  ["FM", "Micronesia"],
  ["MD", "Moldova"],
  ["MC", "Monaco"],
  ["MN", "Mongolia"],
  ["ME", "Montenegro"],
  ["MS", "Montserrat"],
  ["MA", "Morocco"],
  ["MZ", "Mozambique"],
  ["MM", "Myanmar"],
  ["NA", "Namibia"],
  ["NR", "Nauru"],
  ["NP", "Nepal"],
  ["NL", "Netherlands"],
  ["NC", "New Caledonia"],
  ["NZ", "New Zealand"],
  ["NI", "Nicaragua"],
  ["NE", "Niger"],
  ["NG", "Nigeria"],
  ["NU", "Niue"],
  ["NF", "Norfolk Island"],
  ["MK", "North Macedonia"],
  ["MP", "Northern Mariana Islands"],
  ["NO", "Norway"],
  ["OM", "Oman"],
  ["PK", "Pakistan"],
  ["PW", "Palau"],
  ["PS", "Palestine"],
  ["PA", "Panama"],
  ["PG", "Papua New Guinea"],
  ["PY", "Paraguay"],
  ["PE", "Peru"],
  ["PH", "Philippines"],
  ["PN", "Pitcairn"],
  ["PL", "Poland"],
  ["PT", "Portugal"],
  ["PR", "Puerto Rico"],
  ["QA", "Qatar"],
  ["RO", "Romania"],
  ["RU", "Russia"],
  ["RW", "Rwanda"],
  ["RE", "Réunion"],
  ["BL", "Saint Barthélemy"],
  ["SH", "Saint Helena"],
  ["KN", "Saint Kitts and Nevis"],
  ["LC", "Saint Lucia"],
  ["MF", "Saint Martin"],
  ["PM", "Saint Pierre and Miquelon"],
  ["VC", "Saint Vincent and the Grenadines"],
  ["WS", "Samoa"],
  ["SM", "San Marino"],
  ["ST", "Sao Tome and Principe"],
  ["SA", "Saudi Arabia"],
  ["SN", "Senegal"],
  ["RS", "Serbia"],
  ["SC", "Seychelles"],
  ["SL", "Sierra Leone"],
  ["SG", "Singapore"],
  ["SX", "Sint Maarten"],
  ["SK", "Slovakia"],
  ["SI", "Slovenia"],
  ["SB", "Solomon Islands"],
  ["SO", "Somalia"],
  ["ZA", "South Africa"],
  ["GS", "South Georgia and the South Sandwich Islands"],
  ["SS", "South Sudan"],
  ["ES", "Spain"],
  ["LK", "Sri Lanka"],
  ["SD", "Sudan"],
  ["SR", "Suriname"],
  ["SJ", "Svalbard and Jan Mayen"],
  ["SE", "Sweden"],
  ["CH", "Switzerland"],
  ["SY", "Syria"],
  ["TW", "Taiwan"],
  ["TJ", "Tajikistan"],
  ["TZ", "Tanzania"],
  ["TH", "Thailand"],
  ["TL", "Timor-Leste"],
  ["TG", "Togo"],
  ["TK", "Tokelau"],
  ["TO", "Tonga"],
  ["TT", "Trinidad and Tobago"],
  ["TN", "Tunisia"],
  ["TM", "Turkmenistan"],
  ["TC", "Turks and Caicos Islands"],
  ["TV", "Tuvalu"],
  ["TR", "Türkiye"],
  ["UG", "Uganda"],
  ["UA", "Ukraine"],
  ["AE", "United Arab Emirates"],
  ["GB", "United Kingdom"],
  ["US", "United States"],
  ["UM", "United States Minor Outlying Islands"],
  ["UY", "Uruguay"],
  ["UZ", "Uzbekistan"],
  ["VU", "Vanuatu"],
  ["VE", "Venezuela"],
  ["VN", "Vietnam"],
  ["VG", "Virgin Islands, British"],
  ["VI", "Virgin Islands, U.S."],
  ["WF", "Wallis and Futuna"],
  ["EH", "Western Sahara"],
  ["YE", "Yemen"],
  ["ZM", "Zambia"],
  ["ZW", "Zimbabwe"],
  ["AX", "Åland Islands"],
] as const;

function countryFlag(code: string) {
  if (!/^[A-Za-z]{2}$/.test(code)) return "";

  return code
    .toUpperCase()
    .replace(/./g, (character) =>
      String.fromCodePoint(127397 + character.charCodeAt(0)),
    );
}



export default function AdminPage() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [squads, setSquads] = useState<Squad[]>([]);
  const [loadingSquads, setLoadingSquads] = useState(false);
  const [registrationOpen, setRegistrationOpen] = useState(true);
  const [loadingRegistration, setLoadingRegistration] = useState(true);
  const [changingRegistration, setChangingRegistration] = useState(false);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [selectedLogo, setSelectedLogo] = useState<{
    url: string;
    squadName: string;
  } | null>(null);
  const [editingSquad, setEditingSquad] = useState<Squad | null>(null);
  const [editSquadName, setEditSquadName] = useState("");
  const [editFacebookName, setEditFacebookName] = useState("");
  const [editCountrySearch, setEditCountrySearch] = useState("");
  const [editCountryCode, setEditCountryCode] = useState("");
  const [editPlayerNames, setEditPlayerNames] = useState(["", "", "", ""]);
  const [editLogoFile, setEditLogoFile] = useState<File | null>(null);
  const [editLogoPreview, setEditLogoPreview] = useState("");
  const [removeCurrentLogo, setRemoveCurrentLogo] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [showAddSquad, setShowAddSquad] = useState(false);
  const [newSquadName, setNewSquadName] = useState("");
  const [newFacebookName, setNewFacebookName] = useState("");
  const [newPlayerNames, setNewPlayerNames] = useState(["", "", "", ""]);
  const [newSlot, setNewSlot] = useState("");
  const [newLogoFile, setNewLogoFile] = useState<File | null>(null);
  const [newLogoPreview, setNewLogoPreview] = useState("");
  const [savingNewSquad, setSavingNewSquad] = useState(false);
  const [staffLoading, setStaffLoading] = useState(true);
  const [hasAdminAccess, setHasAdminAccess] = useState(false);

  const isOwner =
    user?.email?.toLowerCase() === OWNER_EMAIL.toLowerCase();
  const isAdmin = isOwner || hasAdminAccess;

  useEffect(() => {
    return onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
    });
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function checkStaffAccess() {
      if (!user?.email) {
        setHasAdminAccess(false);
        setStaffLoading(false);
        return;
      }

      if (user.email.toLowerCase() === OWNER_EMAIL.toLowerCase()) {
        setHasAdminAccess(true);
        setStaffLoading(false);
        return;
      }

      try {
        setStaffLoading(true);
        const staffSnapshot = await getDoc(
          doc(db, "staff", user.email.toLowerCase()),
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
    if (isAdmin) {
      void loadSquads();
    }
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) {
      setLoadingRegistration(false);
      return;
    }

    return onSnapshot(
      doc(db, "settings", "registration"),
      (snapshot) => {
        setRegistrationOpen(
          snapshot.exists() ? snapshot.data().isOpen !== false : true,
        );
        setLoadingRegistration(false);
      },
      (error) => {
        console.error("Unable to load registration status:", error);
        setMessage("Unable to load registration status.");
        setLoadingRegistration(false);
      },
    );
  }, [isAdmin]);

  useEffect(() => {
    function closeWithEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setSelectedLogo(null);
      }
    }

    window.addEventListener("keydown", closeWithEscape);
    return () => window.removeEventListener("keydown", closeWithEscape);
  }, []);

  async function signInWithGoogle() {
    try {
      setMessage("");
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error(error);
      setMessage("Google sign-in failed. Please try again.");
    }
  }

  async function handleSignOut() {
    try {
      await signOut(auth);
      setSquads([]);
    } catch (error) {
      console.error(error);
      setMessage("Sign-out failed.");
    }
  }

  async function loadSquads() {
    setLoadingSquads(true);
    setMessage("");

    try {
      let snapshot;

      try {
        snapshot = await getDocs(
          query(collection(db, "squads"), orderBy("createdAt", "desc")),
        );
      } catch {
        snapshot = await getDocs(collection(db, "squads"));
      }

      const loadedSquads: Squad[] = snapshot.docs.map((squadDocument) => {
        const data = squadDocument.data();

        return {
          id: squadDocument.id,
          squadName:
            typeof data.squadName === "string"
              ? data.squadName
              : "Unnamed Squad",
          players: Array.isArray(data.players) ? data.players : [],
          logoUrl:
            typeof data.logoUrl === "string" ? data.logoUrl : "",
          logoPublicId:
            typeof data.logoPublicId === "string" ? data.logoPublicId : "",
          ownerName:
            typeof data.ownerName === "string" ? data.ownerName : "",
          ownerEmail:
            typeof data.ownerEmail === "string" ? data.ownerEmail : "",
          facebookName:
            typeof data.facebookName === "string" ? data.facebookName : "",
          countryCode:
            typeof data.countryCode === "string" ? data.countryCode : "",
          countryName:
            typeof data.countryName === "string" ? data.countryName : "",
          status:
            data.status === "approved" || data.status === "rejected"
              ? data.status
              : "pending",
          slot: typeof data.slot === "number" ? data.slot : undefined,
          createdAt: data.createdAt || null,
        };
      });

      loadedSquads.sort(
        (first, second) =>
          getCreatedTime(second.createdAt) -
          getCreatedTime(first.createdAt),
      );

      setSquads(loadedSquads);
    } catch (error) {
      console.error(error);
      setMessage("Unable to load squads from Firestore.");
    } finally {
      setLoadingSquads(false);
    }
  }

  async function toggleRegistration() {
    if (loadingRegistration || changingRegistration) return;

    const nextValue = !registrationOpen;

    if (
      !window.confirm(
        nextValue
          ? "Open registration for new squads?"
          : "Close registration for new squads?",
      )
    ) {
      return;
    }

    setChangingRegistration(true);
    setMessage("");

    try {
      await updateDoc(doc(db, "settings", "registration"), {
        isOpen: nextValue,
      });

      setMessage(
        nextValue
          ? "Registration is now open."
          : "Registration is now closed.",
      );
    } catch (error) {
      console.error(error);
      setMessage("Unable to update registration.");
    } finally {
      setChangingRegistration(false);
    }
  }

  async function updateStatus(
    squadId: string,
    status: SquadStatus,
  ) {
    setWorkingId(squadId);
    setMessage("");

    try {
      await updateDoc(doc(db, "squads", squadId), { status });

      setSquads((current) =>
        current.map((squad) =>
          squad.id === squadId ? { ...squad, status } : squad,
        ),
      );

      setMessage(`Squad status changed to ${status}.`);
    } catch (error) {
      console.error(error);
      setMessage("Unable to update squad status.");
    } finally {
      setWorkingId(null);
    }
  }

  function resetAddSquadForm() {
    setNewSquadName("");
    setNewFacebookName("");
    setNewPlayerNames(["", "", "", ""]);
    setNewSlot("");
    setNewLogoFile(null);
    setNewLogoPreview("");
  }

  function closeAddSquad() {
    if (savingNewSquad) return;
    setShowAddSquad(false);
    resetAddSquadForm();
  }

  function handleNewLogoChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setMessage("The logo must be a PNG, JPG, JPEG, or WebP image.");
      event.target.value = "";
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setMessage("The logo must be smaller than 5 MB.");
      event.target.value = "";
      return;
    }

    setNewLogoFile(file);
    setNewLogoPreview(URL.createObjectURL(file));
  }

  async function createAdminSquad() {
    if (!user || savingNewSquad) return;

    const cleanSquadName = newSquadName.trim();
    const cleanFacebookName = newFacebookName.trim();
    const cleanPlayers = newPlayerNames.map((name) => name.trim());
    const parsedSlot = newSlot.trim() ? Number.parseInt(newSlot, 10) : null;

    if (!cleanSquadName) {
      setMessage("Squad name is required.");
      return;
    }

    if (cleanPlayers.some((name) => !name)) {
      setMessage("All 4 player names are required.");
      return;
    }

    if (new Set(cleanPlayers.map((name) => name.toLowerCase())).size !== 4) {
      setMessage("Each player must have a different name.");
      return;
    }

    if (parsedSlot !== null && (Number.isNaN(parsedSlot) || parsedSlot < 1)) {
      setMessage("Slot must be a positive number.");
      return;
    }

    setSavingNewSquad(true);
    setMessage("");

    try {
      const duplicateSnapshot = await getDocs(
        query(
          collection(db, "squads"),
          where("squadNameLower", "==", cleanSquadName.toLowerCase()),
        ),
      );

      if (!duplicateSnapshot.empty) {
        setMessage("That squad name is already registered.");
        return;
      }

      let logoUrl = "";
      let logoPublicId = "";

      if (newLogoFile) {
        const formData = new FormData();
        formData.append("file", newLogoFile);

        const response = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        });
        const result = await response.json();

        if (!response.ok || !result.logoUrl) {
          throw new Error(result.error || "Unable to upload the team logo.");
        }

        logoUrl = result.logoUrl;
        logoPublicId = result.logoPublicId || "";
      }

      const players = cleanPlayers.map((name, index) => ({
        name,
        role: index === 0 ? "Captain" : `Player ${index + 1}`,
      }));

      const payload: Record<string, unknown> = {
        squadName: cleanSquadName,
        squadNameLower: cleanSquadName.toLowerCase(),
        facebookName: cleanFacebookName,
        players,
        logoUrl,
        logoPublicId,
        status: "approved",
        ownerUid: user.uid,
        ownerName: user.displayName || "Admin",
        ownerEmail: user.email || "",
        createdByAdmin: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      if (parsedSlot !== null) payload.slot = parsedSlot;

      await addDoc(collection(db, "squads"), payload);

      setMessage(`${cleanSquadName} was added and approved.`);
      setShowAddSquad(false);
      resetAddSquadForm();
      await loadSquads();
    } catch (error) {
      console.error("Unable to add squad:", error);
      setMessage(error instanceof Error ? error.message : "Unable to add squad.");
    } finally {
      setSavingNewSquad(false);
    }
  }

  function openEditSquad(squad: Squad) {
    setEditingSquad(squad);
    setEditSquadName(squad.squadName);
    setEditFacebookName(squad.facebookName || "");
    setEditCountryCode(squad.countryCode || "");
    setEditCountrySearch(
      squad.countryCode
        ? `${countryFlag(squad.countryCode)} ${squad.countryName || ""}`.trim()
        : "",
    );
    setEditPlayerNames([0, 1, 2, 3].map((index) => squad.players[index]?.name || ""));
    setEditLogoFile(null);
    setEditLogoPreview(squad.logoUrl || "");
    setRemoveCurrentLogo(false);
    setMessage("");
  }

  function closeEditSquad() {
    if (savingEdit) return;
    setEditingSquad(null);
    setEditLogoFile(null);
    setEditLogoPreview("");
    setRemoveCurrentLogo(false);
  }

  function handleEditLogoChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setMessage("The logo must be a PNG, JPG, JPEG, or WebP image.");
      event.target.value = "";
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setMessage("The logo must be smaller than 5 MB.");
      event.target.value = "";
      return;
    }

    setEditLogoFile(file);
    setEditLogoPreview(URL.createObjectURL(file));
    setRemoveCurrentLogo(false);
  }

  async function saveSquadEdits() {
    if (!editingSquad || savingEdit) return;

    const cleanSquadName = editSquadName.trim();
    const cleanFacebookName = editFacebookName.trim();
    const cleanPlayers = editPlayerNames.map((name) => name.trim());

    if (!cleanSquadName) {
      setMessage("Squad name is required.");
      return;
    }

    if (cleanPlayers.some((name) => !name)) {
      setMessage("All 4 player names are required.");
      return;
    }

    if (new Set(cleanPlayers.map((name) => name.toLowerCase())).size !== 4) {
      setMessage("Each player must have a different name.");
      return;
    }

    if (editCountrySearch.trim() && !editCountryCode) {
      setMessage("Select a country or region from the list.");
      return;
    }

    setSavingEdit(true);
    setWorkingId(editingSquad.id);
    setMessage("");

    try {
      const duplicateSnapshot = await getDocs(
        query(
          collection(db, "squads"),
          where("squadNameLower", "==", cleanSquadName.toLowerCase()),
        ),
      );

      if (duplicateSnapshot.docs.some((item) => item.id !== editingSquad.id)) {
        setMessage("That squad name is already registered.");
        return;
      }

      let logoUrl = removeCurrentLogo ? "" : editingSquad.logoUrl || "";
      let logoPublicId = removeCurrentLogo ? "" : editingSquad.logoPublicId || "";

      if (editLogoFile) {
        const formData = new FormData();
        formData.append("file", editLogoFile);

        const response = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        });
        const result = await response.json();

        if (!response.ok || !result.logoUrl) {
          throw new Error(result.error || "Unable to upload the new logo.");
        }

        logoUrl = result.logoUrl;
        logoPublicId = result.logoPublicId || "";
      }

      const players = cleanPlayers.map((name, index) => ({
        name,
        role: index === 0 ? "Captain" : `Player ${index + 1}`,
      }));

      const selectedCountry = COUNTRIES.find(
        ([code]) => code === editCountryCode,
      );

      await updateDoc(doc(db, "squads", editingSquad.id), {
        squadName: cleanSquadName,
        squadNameLower: cleanSquadName.toLowerCase(),
        facebookName: cleanFacebookName,
        countryCode: editCountryCode,
        countryName: selectedCountry?.[1] || "",
        players,
        logoUrl,
        logoPublicId,
      });

      setSquads((current) =>
        current.map((squad) =>
          squad.id === editingSquad.id
            ? {
                ...squad,
                squadName: cleanSquadName,
                facebookName: cleanFacebookName,
                countryCode: editCountryCode,
                countryName: selectedCountry?.[1] || "",
                players,
                logoUrl,
                logoPublicId,
              }
            : squad,
        ),
      );

      setMessage(`${cleanSquadName} was updated.`);
      setEditingSquad(null);
    } catch (error) {
      console.error(error);
      setMessage(error instanceof Error ? error.message : "Unable to update squad.");
    } finally {
      setSavingEdit(false);
      setWorkingId(null);
    }
  }

  async function removeRejectedSquad(squad: Squad) {
    if (squad.status !== "rejected") return;

    if (
      !window.confirm(
        `Permanently remove "${squad.squadName}"?`,
      )
    ) {
      return;
    }

    setWorkingId(squad.id);

    try {
      await deleteDoc(doc(db, "squads", squad.id));
      setSquads((current) =>
        current.filter((item) => item.id !== squad.id),
      );
      setMessage(`${squad.squadName} was removed.`);
    } catch (error) {
      console.error(error);
      setMessage("Unable to remove squad.");
    } finally {
      setWorkingId(null);
    }
  }

  const filteredSquads = useMemo(() => {
    const term = search.trim().toLowerCase();

    if (!term) return squads;

    return squads.filter((squad) => {
      const playerNames = squad.players
        .map((player) => player.name)
        .join(" ")
        .toLowerCase();

      return (
        squad.squadName.toLowerCase().includes(term) ||
        squad.ownerName?.toLowerCase().includes(term) ||
        squad.ownerEmail?.toLowerCase().includes(term) ||
        squad.facebookName?.toLowerCase().includes(term) ||
        squad.countryName?.toLowerCase().includes(term) ||
        squad.countryCode?.toLowerCase().includes(term) ||
        squad.status.toLowerCase().includes(term) ||
        playerNames.includes(term)
      );
    });
  }, [squads, search]);

  const pendingSquads = squads.filter(
    (squad) => squad.status === "pending",
  ).length;
  const approvedSquads = squads.filter(
    (squad) => squad.status === "approved",
  ).length;
  const rejectedSquads = squads.filter(
    (squad) => squad.status === "rejected",
  ).length;

  if (authLoading || staffLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black text-white">
        Loading admin page...
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
            Admin Dashboard
          </h1>
          <button
            type="button"
            onClick={() => void signInWithGoogle()}
            className="mt-8 w-full rounded-xl bg-blue-700 px-6 py-4 font-black uppercase"
          >
            Sign In With Google
          </button>
          {message && (
            <p className="mt-4 text-sm text-red-300">
              {message}
            </p>
          )}
        </section>
      </main>
    );
  }

  if (!isAdmin) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black px-6 text-white">
        <section className="w-full max-w-lg rounded-3xl border border-red-900 bg-black/90 p-8 text-center">
          <h1 className="text-3xl font-black uppercase text-red-400">
            Access Denied
          </h1>
          <button
            type="button"
            onClick={() => void handleSignOut()}
            className="mt-7 rounded-xl bg-blue-700 px-6 py-3 font-bold uppercase"
          >
            Sign Out
          </button>
        </section>
      </main>
    );
  }

  return (
    <>
      <main className="min-h-screen bg-black px-4 py-8 text-white sm:px-6 lg:px-8">
        <div className="mx-auto max-w-[1500px]">
          <header className="rounded-3xl border border-blue-900 bg-black/90 p-6">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-sm font-black uppercase tracking-[0.3em] text-blue-400">
                  N² Scrims
                </p>
                <h1 className="mt-2 text-3xl font-black uppercase sm:text-4xl">
                  Admin Dashboard
                </h1>
                <p className="mt-2 text-sm text-gray-400">
                  Signed in as {user.email}
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => {
                    resetAddSquadForm();
                    setShowAddSquad(true);
                    setMessage("");
                  }}
                  className="rounded-xl bg-green-700 px-5 py-3 text-sm font-black uppercase hover:bg-green-600"
                >
                  + Add Squad
                </button>

                <button
                  type="button"
                  onClick={() => void loadSquads()}
                  disabled={loadingSquads}
                  className="rounded-xl bg-blue-700 px-5 py-3 text-sm font-black uppercase disabled:opacity-50"
                >
                  {loadingSquads ? "Refreshing..." : "Refresh Squads"}
                </button>

              </div>
            </div>
          </header>

          <section className="mt-6">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.25em] text-blue-400">
                Tournament Management
              </p>
              <h2 className="mt-2 text-2xl font-black uppercase">
                Admin Tools
              </h2>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <AdminButton
                href="/admin/matches"
                title="Matches"
                description="Create matches and manage live scoring"
                icon="🎮"
              />
              <AdminButton
                href="/admin/tournament"
                title="Standings"
                description="View and manage the tournament leaderboard"
                icon="🏆"
              />
              <AdminButton
                href="/admin/history"
                title="History"
                description="Review completed match results"
                icon="📋"
              />
              <AdminButton
                href="/admin/archive"
                title="Archive"
                description="Open previous tournament records"
                icon="🗂️"
              />
              <AdminButton
                href="/admin/settings"
                title="Tournament Settings"
                description="Edit tournament details, maps, rules, and schedule"
                icon="⚙️"
              />
              <AdminButton
                href="/admin/graphics"
                title="Graphics"
                description="Generate tournament result graphics"
                icon="🖼️"
              />
              {isOwner && (
                <AdminButton
                  href="/admin/staff"
                  title="Staff Management"
                  description="Add or remove administrators"
                  icon="👑"
                />
              )}
            </div>
          </section>

          <section className="mt-8 rounded-3xl border border-blue-900 bg-blue-950/10 p-5 sm:p-6">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.25em] text-cyan-300">
                Stream Control Center
              </p>
              <h2 className="mt-2 text-2xl font-black uppercase">
                Overlays
              </h2>
              <p className="mt-2 text-sm text-gray-400">
                Open any broadcast screen in a separate tab for TikTok Live Studio or OBS.
              </p>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <AdminButton
                href="/overlay"
                title="Live Standings"
                description="Open the live side standings overlay"
                icon="🎥"
                openInNewTab
              />
              <AdminButton
                href="/overlay/results"
                title="Match Results"
                description="Open the complete end-of-match results screen"
                icon="🏁"
                openInNewTab
              />
              <AdminButton
                href="/overlay/champion-team"
                title="Champion Team"
                description="Show the winning squad and all four player names"
                icon="👑"
                openInNewTab
              />
              <AdminButton
                href="/overlay/champion"
                title="Most Points"
                description="Show the squad with the most tournament points"
                icon="🏆"
                openInNewTab
              />
              <AdminButton
                href="/overlay/kill-leader"
                title="Top Kills"
                description="Show the squad with the most tournament kills"
                icon="🔥"
                openInNewTab
              />
              <AdminButton
                href="/overlay/top5"
                title="Top Chicken Dinners"
                description="Show the top 5 squads ranked by chicken dinners"
                icon="⭐"
                openInNewTab
              />
            </div>
          </section>

          {message && (
            <div className="mt-5 rounded-xl border border-blue-900 bg-blue-950/30 px-4 py-3 text-sm text-blue-200">
              {message}
            </div>
          )}

          <section className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Total" value={squads.length} />
            <StatCard label="Pending" value={pendingSquads} />
            <StatCard label="Approved" value={approvedSquads} />
            <StatCard label="Rejected" value={rejectedSquads} />
          </section>

          <section
            className={`mt-6 rounded-3xl border p-6 ${
              registrationOpen
                ? "border-green-800 bg-green-950/20"
                : "border-red-800 bg-red-950/20"
            }`}
          >
            <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.25em] text-gray-400">
                  Tournament Registration
                </p>
                <h2
                  className={`mt-2 text-2xl font-black uppercase ${
                    registrationOpen
                      ? "text-green-300"
                      : "text-red-300"
                  }`}
                >
                  Registration {registrationOpen ? "Open" : "Closed"}
                </h2>
              </div>

              <button
                type="button"
                onClick={() => void toggleRegistration()}
                disabled={
                  loadingRegistration || changingRegistration
                }
                className={`rounded-xl px-6 py-4 text-sm font-black uppercase disabled:opacity-50 ${
                  registrationOpen
                    ? "bg-red-700"
                    : "bg-green-700"
                }`}
              >
                {changingRegistration
                  ? "Updating..."
                  : registrationOpen
                    ? "Close Registration"
                    : "Open Registration"}
              </button>
            </div>
          </section>

          <section className="mt-6 rounded-2xl border border-blue-900 bg-black/90 p-4">
            <label className="text-xs font-black uppercase tracking-widest text-blue-400">
              Search Squads
            </label>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search squad, player, Messenger name, email, or status..."
              className="mt-3 w-full rounded-xl border border-gray-800 bg-gray-950 px-4 py-3 text-white outline-none"
            />
          </section>

          {loadingSquads ? (
            <div className="mt-8 rounded-2xl border border-blue-900 bg-black/90 p-10 text-center text-blue-300">
              Loading squads...
            </div>
          ) : (
            <div className="mt-6 overflow-x-auto rounded-2xl border border-blue-900 bg-black/90">
              <table className="w-full min-w-[1320px] text-left text-sm">
                <thead className="border-b border-blue-900 bg-blue-950/30">
                  <tr className="text-xs uppercase tracking-wider text-blue-300">
                    <th className="px-3 py-3">#</th>
                    <th className="px-3 py-3">Logo</th>
                    <th className="px-3 py-3">Squad</th>
                    <th className="px-3 py-3">Country</th>
                    <th className="px-3 py-3">Slot</th>
                    <th className="px-3 py-3">Players</th>
                    <th className="px-3 py-3">Facebook / Messenger</th>
                    <th className="px-3 py-3">Registered By</th>
                    <th className="px-3 py-3">Status</th>
                    <th className="px-3 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSquads.map((squad, index) => {
                    const isWorking = workingId === squad.id;

                    return (
                      <tr
                        key={squad.id}
                        className="border-b border-gray-900"
                      >
                        <td className="px-3 py-3">
                          {index + 1}
                        </td>
                        <td className="px-3 py-3">
                          {squad.logoUrl ? (
                            <button
                              type="button"
                              onClick={() =>
                                setSelectedLogo({
                                  url: squad.logoUrl || "",
                                  squadName: squad.squadName,
                                })
                              }
                              className="h-14 w-14 overflow-hidden rounded-xl border border-blue-800"
                            >
                              <img
                                src={squad.logoUrl}
                                alt=""
                                className="h-full w-full object-contain"
                              />
                            </button>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-3 py-3 font-black">
                          {squad.squadName}
                        </td>
                        <td className="px-3 py-3 text-xs">
                          {squad.countryCode ? (
                            <span className="font-bold">
                              {countryFlag(squad.countryCode)}{" "}
                              {squad.countryName || squad.countryCode}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-3 py-3 font-black text-blue-300">
                          {squad.slot ?? "—"}
                        </td>
                        <td className="px-3 py-3 text-xs text-gray-300">
                          {squad.players
                            .map((player) => player.name)
                            .join(", ")}
                        </td>
                        <td className="px-3 py-3 text-xs">
                          <div className="font-bold text-blue-300">
                            {squad.facebookName || "—"}
                          </div>
                          {squad.facebookName && (
                            <button
                              type="button"
                              onClick={() =>
                                void navigator.clipboard.writeText(
                                  squad.facebookName || "",
                                )
                              }
                              className="mt-2 rounded-lg border border-blue-800 px-3 py-1.5 text-[11px] font-black uppercase text-blue-300 hover:bg-blue-950"
                            >
                              Copy Name
                            </button>
                          )}
                        </td>
                        <td className="px-3 py-3 text-xs">
                          <div>{squad.ownerName || "Unknown"}</div>
                          <div className="text-gray-500">
                            {squad.ownerEmail}
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          {squad.status}
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              disabled={isWorking}
                              onClick={() => openEditSquad(squad)}
                              className="rounded-lg border border-blue-600 bg-blue-950 px-3 py-2 text-xs font-black uppercase text-blue-300 disabled:opacity-40"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              disabled={isWorking}
                              onClick={() =>
                                void updateStatus(
                                  squad.id,
                                  "approved",
                                )
                              }
                              className="rounded-lg bg-green-700 px-3 py-2 text-xs font-black uppercase disabled:opacity-40"
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              disabled={isWorking}
                              onClick={() =>
                                void updateStatus(
                                  squad.id,
                                  "pending",
                                )
                              }
                              className="rounded-lg bg-yellow-700 px-3 py-2 text-xs font-black uppercase disabled:opacity-40"
                            >
                              Pending
                            </button>
                            <button
                              type="button"
                              disabled={isWorking}
                              onClick={() =>
                                void updateStatus(
                                  squad.id,
                                  "rejected",
                                )
                              }
                              className="rounded-lg bg-red-700 px-3 py-2 text-xs font-black uppercase disabled:opacity-40"
                            >
                              Reject
                            </button>
                            {squad.status === "rejected" && (
                              <button
                                type="button"
                                disabled={isWorking}
                                onClick={() =>
                                  void removeRejectedSquad(squad)
                                }
                                className="rounded-lg border border-red-700 bg-red-950 px-3 py-2 text-xs font-black uppercase text-red-300 disabled:opacity-40"
                              >
                                Remove
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {showAddSquad && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/90 p-4 sm:p-8">
          <div className="mx-auto w-full max-w-2xl rounded-3xl border border-green-800 bg-gray-950 p-6 text-white sm:p-8">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-green-400">Admin Squad Manager</p>
                <h2 className="mt-2 text-3xl font-black">Add Squad</h2>
                <p className="mt-2 text-sm text-gray-400">This squad will be approved immediately. No separate Gmail account is required.</p>
              </div>
              <button type="button" onClick={closeAddSquad} className="rounded-lg border border-gray-700 px-4 py-2 font-black">Close</button>
            </div>

            <div className="mt-7 grid gap-4 sm:grid-cols-[minmax(0,1fr)_150px]">
              <label className="block">
                <span className="text-sm font-bold text-gray-300">Squad Name</span>
                <input value={newSquadName} onChange={(event) => setNewSquadName(event.target.value)} className="mt-2 w-full rounded-xl border border-gray-700 bg-black px-4 py-3" placeholder="Squad name" />
              </label>
              <label className="block">
                <span className="text-sm font-bold text-gray-300">Slot (optional)</span>
                <input type="number" min={1} value={newSlot} onChange={(event) => setNewSlot(event.target.value)} className="mt-2 w-full rounded-xl border border-gray-700 bg-black px-4 py-3" placeholder="1" />
              </label>
            </div>

            <label className="mt-5 block text-sm font-bold text-gray-300">Facebook / Messenger Name (optional)</label>
            <input value={newFacebookName} onChange={(event) => setNewFacebookName(event.target.value)} className="mt-2 w-full rounded-xl border border-gray-700 bg-black px-4 py-3" placeholder="Messenger name" />

            <div className="mt-6 rounded-2xl border border-gray-800 p-5">
              <h3 className="text-xl font-black text-blue-300">Players</h3>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {newPlayerNames.map((name, index) => (
                  <label key={index} className="block">
                    <span className="text-sm font-bold text-gray-400">{index === 0 ? "Player 1 — Captain" : `Player ${index + 1}`}</span>
                    <input
                      value={name}
                      onChange={(event) => setNewPlayerNames((current) => current.map((item, playerIndex) => playerIndex === index ? event.target.value : item))}
                      className="mt-2 w-full rounded-xl border border-gray-700 bg-black px-4 py-3"
                      placeholder={`Player ${index + 1} name`}
                    />
                  </label>
                ))}
              </div>
            </div>

            <div className="mt-6 rounded-2xl border border-blue-900 p-5">
              <h3 className="text-xl font-black text-blue-300">Team Logo (optional)</h3>
              {newLogoPreview ? (
                <img src={newLogoPreview} alt="New squad logo preview" className="mt-4 h-36 w-36 rounded-2xl border border-blue-800 object-contain p-2" />
              ) : (
                <div className="mt-4 flex h-36 w-36 items-center justify-center rounded-2xl border border-dashed border-gray-700 text-gray-500">No Logo</div>
              )}
              <div className="mt-4 flex flex-wrap gap-3">
                <label className="cursor-pointer rounded-xl bg-blue-700 px-5 py-3 text-sm font-black uppercase">
                  Upload Logo
                  <input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleNewLogoChange} className="hidden" />
                </label>
                {newLogoPreview && (
                  <button type="button" onClick={() => { setNewLogoFile(null); setNewLogoPreview(""); }} className="rounded-xl border border-red-700 px-5 py-3 text-sm font-black uppercase text-red-300">Remove Logo</button>
                )}
              </div>
            </div>

            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <button type="button" onClick={() => void createAdminSquad()} disabled={savingNewSquad} className="flex-1 rounded-xl bg-green-700 px-6 py-4 font-black uppercase disabled:opacity-50">{savingNewSquad ? "Adding Squad..." : "Add & Approve Squad"}</button>
              <button type="button" onClick={closeAddSquad} disabled={savingNewSquad} className="flex-1 rounded-xl border border-gray-700 px-6 py-4 font-black uppercase disabled:opacity-50">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {editingSquad && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/90 p-4 sm:p-8">
          <div className="mx-auto w-full max-w-2xl rounded-3xl border border-blue-800 bg-gray-950 p-6 text-white sm:p-8">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-blue-400">Admin Edit</p>
                <h2 className="mt-2 text-3xl font-black">Edit Squad</h2>
              </div>
              <button type="button" onClick={closeEditSquad} className="rounded-lg border border-gray-700 px-4 py-2 font-black">Close</button>
            </div>

            <label className="mt-7 block text-sm font-bold text-gray-300">Squad Name</label>
            <input value={editSquadName} onChange={(event) => setEditSquadName(event.target.value)} className="mt-2 w-full rounded-xl border border-gray-700 bg-black px-4 py-3" />

            <label className="mt-5 block text-sm font-bold text-gray-300">Facebook / Messenger Name</label>
            <input value={editFacebookName} onChange={(event) => setEditFacebookName(event.target.value)} className="mt-2 w-full rounded-xl border border-gray-700 bg-black px-4 py-3" />
            <label className="mt-5 block text-sm font-bold text-gray-300">
              Country / Region
            </label>
            <input
              list="edit-country-options"
              value={editCountrySearch}
              onChange={(event) => {
                const value = event.target.value;
                setEditCountrySearch(value);

                const match = COUNTRIES.find(
                  ([code, name]) =>
                    `${countryFlag(code)} ${name}` === value ||
                    name.toLowerCase() === value.toLowerCase(),
                );

                setEditCountryCode(match?.[0] || "");
              }}
              placeholder="Search country or region"
              autoComplete="off"
              className="mt-2 w-full rounded-xl border border-gray-700 bg-black px-4 py-3"
            />
            <datalist id="edit-country-options">
              {COUNTRIES.map(([code, name]) => (
                <option key={code} value={`${countryFlag(code)} ${name}`} />
              ))}
            </datalist>
            <p className="mt-2 text-xs text-gray-500">
              Current flag: {editCountryCode ? countryFlag(editCountryCode) : "—"}
            </p>

            <div className="mt-6 rounded-2xl border border-gray-800 p-5">
              <h3 className="text-xl font-black text-blue-300">Players</h3>
              <div className="mt-4 space-y-3">
                {editPlayerNames.map((name, index) => (
                  <div key={index}>
                    <label className="text-sm font-bold text-gray-400">{index === 0 ? "Player 1 — Captain" : `Player ${index + 1}`}</label>
                    <input
                      value={name}
                      onChange={(event) => setEditPlayerNames((current) => current.map((item, playerIndex) => playerIndex === index ? event.target.value : item))}
                      className="mt-2 w-full rounded-xl border border-gray-700 bg-black px-4 py-3"
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-6 rounded-2xl border border-blue-900 p-5">
              <h3 className="text-xl font-black text-blue-300">Team Logo</h3>
              {editLogoPreview && !removeCurrentLogo ? (
                <img src={editLogoPreview} alt="Logo preview" className="mt-4 h-36 w-36 rounded-2xl border border-blue-800 object-contain p-2" />
              ) : (
                <div className="mt-4 flex h-36 w-36 items-center justify-center rounded-2xl border border-dashed border-gray-700 text-gray-500">No Logo</div>
              )}
              <div className="mt-4 flex flex-wrap gap-3">
                <label className="cursor-pointer rounded-xl bg-blue-700 px-5 py-3 text-sm font-black uppercase">
                  Replace Logo
                  <input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleEditLogoChange} className="hidden" />
                </label>
                <button type="button" onClick={() => { setRemoveCurrentLogo(true); setEditLogoFile(null); setEditLogoPreview(""); }} className="rounded-xl border border-red-700 px-5 py-3 text-sm font-black uppercase text-red-300">Remove Logo</button>
              </div>
            </div>

            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <button type="button" onClick={() => void saveSquadEdits()} disabled={savingEdit} className="flex-1 rounded-xl bg-green-700 px-6 py-4 font-black uppercase disabled:opacity-50">{savingEdit ? "Saving..." : "Save Changes"}</button>
              <button type="button" onClick={closeEditSquad} disabled={savingEdit} className="flex-1 rounded-xl border border-gray-700 px-6 py-4 font-black uppercase disabled:opacity-50">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {selectedLogo && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-6"
          onClick={() => setSelectedLogo(null)}
        >
          <div className="w-full max-w-lg rounded-3xl border border-blue-800 bg-gray-950 p-6 text-center">
            <h2 className="text-2xl font-black">
              {selectedLogo.squadName}
            </h2>
            <img
              src={selectedLogo.url}
              alt=""
              className="mt-6 max-h-[420px] w-full object-contain"
            />
          </div>
        </div>
      )}
    </>
  );
}

function AdminButton({
  href,
  title,
  description,
  icon,
  openInNewTab = false,
}: {
  href: string;
  title: string;
  description: string;
  icon: string;
  openInNewTab?: boolean;
}) {
  return (
    <Link
      href={href}
      target={openInNewTab ? "_blank" : undefined}
      rel={openInNewTab ? "noopener noreferrer" : undefined}
      className="rounded-2xl border border-blue-900 bg-blue-950/20 p-5 transition hover:border-blue-500 hover:bg-blue-950/40"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="text-3xl">{icon}</div>

        {openInNewTab && (
          <span className="rounded-full border border-blue-800 bg-blue-950/60 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-blue-300">
            New Tab
          </span>
        )}
      </div>

      <h2 className="mt-3 text-xl font-black uppercase">
        {title}
      </h2>

      <p className="mt-1 text-sm text-gray-400">
        {description}
      </p>
    </Link>
  );
}

function StatCard({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-2xl border border-blue-900 bg-black/90 p-4">
      <p className="text-xs font-black uppercase tracking-widest text-gray-500">
        {label}
      </p>
      <p className="mt-2 text-3xl font-black text-blue-300">
        {value}
      </p>
    </div>
  );
}

function getCreatedTime(createdAt: Squad["createdAt"]) {
  if (!createdAt) return 0;
  if (createdAt instanceof Date) return createdAt.getTime();

  if (
    typeof createdAt === "object" &&
    "toDate" in createdAt &&
    typeof createdAt.toDate === "function"
  ) {
    return createdAt.toDate().getTime();
  }

  return 0;
}
