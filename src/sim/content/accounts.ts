/** Fictional social-media accounts, grouped by persona. */
export type Persona =
  | "bro"
  | "doomer"
  | "economist"
  | "regular"
  | "homebuyer"
  | "business"
  | "retiree"
  | "news"
  | "crypto"
  | "politician"
  | "landlord"
  | "student"
  | "genz"
  | "farmer"
  | "meme";

export const ACCOUNTS: Record<Persona, { name: string; handle: string }[]> = {
  bro: [
    { name: "Chad Ventura 🚀", handle: "diamondhands_chad" },
    { name: "Tendies Capital", handle: "tendiescap" },
    { name: "Brayden | Options Wizard", handle: "0dte_brayden" },
    { name: "Alpha Wolf Trading 🐺", handle: "alphawolf_trades" },
  ],
  doomer: [
    { name: "Collapse Watch", handle: "collapse_watch" },
    { name: "Gold Bug Gary", handle: "goldbuggary" },
    { name: "It's Over", handle: "its_so_over_" },
    { name: "Prepper Pete", handle: "bunker_pete" },
  ],
  economist: [
    { name: "Dr. Ana Kowalski", handle: "akowalski_econ" },
    { name: "Fed Watcher", handle: "fedwatcher" },
    { name: "Macro Mike", handle: "macro_mike" },
    { name: "Prof. Lena Ortiz", handle: "lena_ortiz_phd" },
  ],
  regular: [
    { name: "Jess 🌻", handle: "jess_in_ohio" },
    { name: "Mike R.", handle: "mike_drives_trucks" },
    { name: "Rina", handle: "rina_rents" },
    { name: "Dev", handle: "dev_codes_stuff" },
    { name: "Tasha K.", handle: "tasha_teaches" },
    { name: "Carlos", handle: "carlos_fixes_hvac" },
  ],
  homebuyer: [
    { name: "House Hunting Hal", handle: "househunting_hal" },
    { name: "Priya & Sam 🏡", handle: "priyasam_buy" },
  ],
  business: [
    { name: "Maria's Bakery", handle: "mariasbakery" },
    { name: "Tom @ Hardware Co.", handle: "tom_hardware_co" },
    { name: "Ngozi | Food Truck", handle: "ngozi_eats" },
  ],
  retiree: [
    { name: "Grandpa Lou", handle: "lou_retired_1962" },
    { name: "Barb in Boca", handle: "barb_boca_77" },
  ],
  news: [
    { name: "Market Pulse", handle: "marketpulse" },
    { name: "Breaking Econ", handle: "breakingecon" },
    { name: "Wire Desk", handle: "wiredesk" },
  ],
  crypto: [
    { name: "satoshi_maxi ₿", handle: "satoshi_maxi" },
    { name: "Laser Eyes Larry", handle: "lasereyes_larry" },
  ],
  politician: [
    { name: "Sen. Dale Brooks", handle: "sendalebrooks" },
    { name: "Rep. Carla Nunez", handle: "repcarlanunez" },
  ],
  landlord: [{ name: "Rick | Real Estate Investor", handle: "rick_doors_17" }],
  student: [
    { name: "Aiden (broke)", handle: "aiden_studentloans" },
    { name: "Mei", handle: "mei_gradschool" },
  ],
  genz: [
    { name: "zoe ✨", handle: "zoe.exe" },
    { name: "Jaylen", handle: "jaylen_irl" },
  ],
  farmer: [{ name: "Dale's Farm 🌽", handle: "dales_farm_iowa" }],
  meme: [
    { name: "Fed Memes", handle: "fedmemes" },
    { name: "Economics Shitposter", handle: "econ_posting" },
  ],
};

export const PERSONA_COLORS: Record<Persona, string> = {
  bro: "var(--c-green)",
  doomer: "var(--c-red)",
  economist: "var(--c-purple)",
  regular: "var(--c-blue)",
  homebuyer: "var(--c-orange)",
  business: "var(--c-orange)",
  retiree: "var(--muted)",
  news: "var(--text)",
  crypto: "var(--c-orange)",
  politician: "var(--c-red)",
  landlord: "#c9a227",
  student: "#5ec4d6",
  genz: "#e37cf0",
  farmer: "#8bc34a",
  meme: "#ffd166",
};
