/*
 * Nova Kingdom Rentals — Inflatable Catalog PROTOTYPE data.
 * Prototype-only. Not wired to production. Uses canonical product IDs, names,
 * images and detail URLs from the live site so the same rental always maps to
 * the same identity. Prices here are the "latest approved" prototype standalone
 * prices supplied for this experiment and may differ from production display.
 *
 * Category tags answer "what TYPE of inflatable is this?" (one product can hold
 * several tags). "Best for" answers "what EVENT is it good for?" — kept separate.
 */
window.NKR_DATA = {
  // Canonical detail URL base on the live site (prototype links out to real pages).
  detailBase: "https://novakingdomrentals.com/rentals/",

  categories: [
    { id: "all",      label: "All Inflatables",       short: "All" },
    { id: "combos",   label: "Bounce & Slide Combos", short: "Combos" },
    { id: "obstacle", label: "Obstacle Courses",      short: "Obstacle" },
    { id: "water",    label: "Slides & Water Fun",    short: "Slides & Water" },
    { id: "games",    label: "Interactive Games",     short: "Games" },
    { id: "play",     label: "Play & Climb",          short: "Play & Climb" }
  ],

  // Shared rental policy copy (same for all inflatables).
  policy: {
    duration: "Private parties: up to 4 hours. Events, schools, community & festivals: up to 3 hours. Setup and takedown do not reduce your rental time.",
    delivery: "Delivery extra.",
    setupDry: "Setup and takedown included. Clear, level setup area and power access required. Adult supervision required at all times.",
    setupWet: "Setup and takedown included. Clear, level setup area, power access, a water source and safe drainage required. Adult supervision required at all times."
  },

  /*
   * products: canonical inflatable + inflatable-game inventory, each listed ONCE.
   * id/slug/name/image match the live canonical records. `tags` drives filtering;
   * every product also implicitly belongs to "all".
   */
  products: [
    {
      id: "crown-dino-combo", slug: "crown-dino-combo", name: "Crown Dino Combo",
      type: "Bounce & Slide Combo", price: 319, image: "/images/crown-dino-combo.jpeg",
      status: "available", wet: false, tags: ["combos"],
      dims: "13.1 ft L × 13.1 ft W × 9.8 ft H",
      bestFor: ["Dinosaur birthdays", "Younger kids", "Backyard parties"],
      blurb: "Dinosaur-themed combo with a bounce area and slide — a favourite for younger kids' birthdays and backyard parties."
    },
    {
      id: "crown-climber", slug: "crown-climber", name: "Crown Climber",
      type: "Play & Climb", price: 329, image: "/images/crown-climber.jpeg",
      status: "available", wet: false, tags: ["play"],
      dims: "16.4 ft L × 13.1 ft W × 13.1 ft H",
      bestFor: ["Younger kids", "Backyard birthdays", "Daycare events"],
      blurb: "A compact climbing inflatable built for younger children who love to climb and play."
    },
    {
      id: "crown-dash", slug: "crown-dash", name: "Crown Dash",
      type: "Active-Play Inflatable", price: 349, image: "/images/crown-dash.jpg",
      status: "available", wet: false, tags: [],
      dims: "13 ft L × 15 ft W × 10 ft H",
      bestFor: ["Birthdays", "Schools", "Community events"],
      blurb: "An active-play inflatable for birthdays, school events and community events."
    },
    {
      id: "crown-island-combo", slug: "crown-island-combo", name: "Crown Island Combo",
      type: "Bounce & Slide Combo", image: "/images/crown-island-combo.jpeg",
      status: "available", wet: true, tags: ["combos", "water"],
      // One product, two configurations. Card shows "From $349".
      configs: [
        { id: "dry", label: "Dry / Without pool", price: 349 },
        { id: "wet", label: "Wet / With pool",    price: 399 }
      ],
      price: 349, fromPrice: true,
      dims: "26 ft L × 14 ft W × 14.5 ft H",
      bestFor: ["Backyard birthdays", "Summer parties", "Younger kids"],
      blurb: "Tropical bounce-and-slide combo. Rent it dry, or add the pool for a wet summer setup."
    },
    {
      id: "crown-quest", slug: "crown-quest", name: "Crown Quest",
      type: "Obstacle Course", price: 369, image: "/images/crown-quest.jpeg",
      status: "available", wet: false, tags: ["obstacle"],
      dims: "",
      bestFor: ["Schools", "Community events", "Festivals"],
      blurb: "An obstacle-course inflatable built for movement and group fun. Rents on its own, or combines with Crown Cascade to form the full Crown Rush 42."
    },
    {
      id: "crown-cascade", slug: "crown-cascade", name: "Crown Cascade",
      type: "Water Slide", price: 379, image: "/images/crown-cascade.jpeg",
      status: "available", wet: true, tags: ["water"],
      dims: "",
      bestFor: ["Summer birthdays", "Backyard parties", "Water fun"],
      blurb: "A colourful water slide for warm-weather events. Rents on its own, or combines with Crown Quest to form the full Crown Rush 42."
    },
    {
      id: "crown-ice-palace-combo", slug: "crown-ice-palace-combo", name: "Crown Ice Palace Combo",
      type: "Bounce & Slide Combo", price: 389, image: "/images/crown-ice-palace-combo.jpg",
      status: "available", wet: false, tags: ["combos"],
      dims: "20 ft L × 17 ft W × 18 ft H",
      bestFor: ["Birthdays", "Schools", "Community events"],
      blurb: "An ice-palace-themed bounce-and-slide combo for birthdays, school events and community events."
    },
    {
      id: "crown-safari", slug: "crown-safari", name: "Crown Safari",
      type: "Large Inflatable", price: 449, image: "/images/crown-safari.jpg",
      status: "available", wet: false, tags: [],
      dims: "33 ft L × 12 ft W × 14 ft H",
      bestFor: ["Birthdays", "Schools", "Festivals"],
      blurb: "A large safari-themed inflatable — a big-footprint attraction for birthdays, schools and festivals."
    },
    {
      id: "crown-pirate-adventure", slug: "crown-pirate-adventure", name: "Crown Pirate Adventure",
      type: "Bounce & Slide Combo", price: 499, image: "/images/crown-pirate-adventure.png",
      status: "coming-soon", wet: false, tags: ["combos"],
      dims: "30 ft L × 13 ft W × 16 ft H",
      capacity: "Maximum 6–8 kids at one time",
      bestFor: ["Birthdays", "Schools", "Community events"],
      blurb: "A pirate-ship-themed bounce-and-slide combo. Coming soon — contact us to be notified when it launches."
    },
    {
      id: "crown-rush-42", slug: "crown-rush-42", name: "Crown Rush 42",
      type: "Obstacle Course", price: 549, image: "/images/crown-rush-42.jpeg",
      status: "available", wet: true, tags: ["obstacle", "water"],
      dims: "42 ft L × 8.2 ft W × 12 ft H",
      bestFor: ["Big birthdays", "Schools", "Larger events"],
      blurb: "The full 42 ft obstacle course — Crown Quest and Crown Cascade combined. Crown Quest and Crown Cascade can be rented separately or combined to create the full Crown Rush 42 obstacle course."
    },
    {
      id: "crown-play-palace", slug: "crown-play-palace", name: "Crown Play Palace",
      type: "Play Palace Inflatable", price: 699, image: "/images/crown-play-palace.jpg",
      status: "available", wet: false, tags: [],
      dims: "24 ft L × 10 ft W × 10 ft H",
      bestFor: ["Birthdays", "Schools", "Community events"],
      blurb: "A large play-palace inflatable for birthdays, school events and community events."
    },
    {
      id: "crown-axe-challenge", slug: "crown-axe-challenge", name: "Crown Axe Challenge",
      type: "Interactive Game", price: 199, image: "/images/crown-axe-challenge.jpeg",
      status: "available", wet: false, tags: ["games"],
      dims: "11.3 ft W × 7.9 ft D × 10.2 ft H",
      bestFor: ["Teens", "Adults", "Schools"],
      blurb: "Inflatable axe-throwing for friendly competition — great for teens, adults and school events."
    },
    {
      id: "crown-kick-darts", slug: "crown-kick-darts", name: "Crown Kick Darts",
      altName: "Football Darts", type: "Interactive Game", price: 199,
      image: "/images/crown-kick-darts.jpeg",
      status: "available", wet: false, tags: ["games"],
      dims: "12 ft L × 9.8 ft W × 5.3 ft H",
      bestFor: ["Sports parties", "Schools", "Teens"],
      blurb: "Giant inflatable football darts (also called Crown Kick Darts) — kick the ball and stick the target. One canonical rental."
    }
  ],

  // Standalone value used for package customization swaps and the lawn-games add-on.
  lawnGames: { id: "5-lawn-games", name: "5 Lawn Games", price: 100 },

  /*
   * Packages (prototype pricing). `items` are canonical product ids (or "5-lawn-games").
   * customizable:true allows swaps only (no removals). Full Kingdom Takeover is fixed.
   */
  packages: [
    { id: "family-kingdom", name: "Family Kingdom", price: 949, customizable: true,
      items: ["crown-dino-combo", "crown-island-combo", "crown-kick-darts"] },
    { id: "adventure-kingdom", name: "Adventure Kingdom", price: 1075, customizable: true,
      items: ["crown-dash", "crown-safari", "crown-axe-challenge"] },
    { id: "rush-party", name: "Rush Party", price: 1149, customizable: true,
      items: ["crown-rush-42", "crown-island-combo", "crown-kick-darts"] },
    { id: "royal-fun", name: "Royal Fun", price: 1949, customizable: true,
      items: ["crown-pirate-adventure", "crown-safari", "crown-ice-palace-combo", "crown-axe-challenge", "crown-kick-darts", "5-lawn-games"] },
    { id: "royal-kingdom", name: "Royal Kingdom", price: 2599, customizable: true,
      items: ["crown-rush-42", "crown-play-palace", "crown-pirate-adventure", "crown-dino-combo", "crown-kick-darts", "crown-axe-challenge"] },
    { id: "full-kingdom-takeover", name: "Full Kingdom Takeover", price: 4749, customizable: false,
      items: ["crown-rush-42", "crown-play-palace", "crown-safari", "crown-pirate-adventure", "crown-ice-palace-combo", "crown-island-combo", "crown-dash", "crown-climber", "crown-dino-combo", "crown-axe-challenge", "crown-kick-darts", "5-lawn-games"] }
  ],

  // Other (non-inflatable) rentals — discovery links to existing production areas.
  otherRentals: [
    { name: "Packages", desc: "Bundle attractions and save.", view: "packages" },
    { name: "Foam Party", desc: "$349–$800/hr by guest count, plus the Inflatable Foam Pit.", view: "foam" },
    { name: "Photo & Video Booths", desc: "360 Video Booth and Mirror Photo Booth.", view: "booths" },
    { name: "Event Essentials", desc: "White resin folding chairs, tables and tents.", view: "essentials" },
    { name: "Lawn Games", desc: "5 Lawn Games add-on — $100.", view: "other" },
    { name: "Generator Rentals", desc: "Power where there are no outlets — $150.", view: "other" }
  ]
};
