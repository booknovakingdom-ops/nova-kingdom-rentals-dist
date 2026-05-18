const DATA_PATHS = {
  packages: "/data/packages.json",
  products: "/data/products.json",
  lawnGames: "/data/lawnGames.json"
};

export const LAWN_GAMES_LIST = [
  "Cornhole",
  "Giant Connect 4",
  "Giant Jenga",
  "Ladder Toss",
  "Ring Toss",
  "Badminton",
  "Tug of War",
  "Bocce Ball",
  "Spikeball",
  "Giant Tic Tac Toe",
  "Croquet",
  "Birch Wood Washer Toss"
];

const state = {
  packages: [],
  products: [],
  lawnGames: [],
  activePackageId: null,
  observer: null,
  enhancing: false
};

const moneyValue = (value = "") => Number(String(value).replace(/[^0-9.]/g, "")) || 0;
const normalize = (value = "") => String(value).toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, " ").trim();
const escapeHtml = (value = "") => String(value).replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]);

export function packageIncludesFiveLawnGames(pkg) {
  return [...(pkg.includedItems || []), ...(pkg.included || []), pkg.name || ""]
    .some((item) => /5\s*lawn\s*games?/i.test(String(item)));
}

export function packageIncludesAnyLawnGames(pkg) {
  return [...(pkg.includedItems || []), ...(pkg.included || []), pkg.name || ""]
    .some((item) => /lawn\s*games?/i.test(String(item)));
}

export function getLawnGameAddonLine(pkg) {
  if (packageIncludesFiveLawnGames(pkg)) {
    return "This package includes 5 Lawn Games. You can upgrade to 10 Lawn Games (+$75) or all 12 Lawn Games (+$105 — includes all 12 games including Cornhole). Cornhole add-on +$25 available with the 5 or 10 game selection.";
  }
  if (!packageIncludesAnyLawnGames(pkg)) {
    return "Lawn Game packages can be added separately — 5 Lawn Games ($175), 10 Lawn Games ($250), or all 12 Lawn Games ($280 — includes Cornhole). Cornhole add-on +$25 available with the 5 or 10 game selection.";
  }
  return "";
}

export function getUpgradeSuggestions(packages, currentPackage, limit = 3) {
  const currentPrice = moneyValue(currentPackage.price);
  return packages
    .filter((pkg) => pkg.id !== currentPackage.id && moneyValue(pkg.price) > currentPrice)
    .sort((a, b) => moneyValue(a.price) - moneyValue(b.price))
    .slice(0, limit);
}

async function loadJson(path) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) throw new Error(`Could not load ${path}`);
  return response.json();
}

async function ensureData() {
  if (state.packages.length) return state;
  const [packages, products, lawnGames] = await Promise.all([
    loadJson(DATA_PATHS.packages),
    loadJson(DATA_PATHS.products),
    loadJson(DATA_PATHS.lawnGames)
  ]);
  state.packages = packages;
  state.products = products;
  state.lawnGames = lawnGames;
  return state;
}

function findPackageByName(name) {
  const normalizedName = normalize(name);
  return state.packages.find((pkg) => normalize(pkg.name) === normalizedName);
}

function imageForItem(itemName) {
  const normalizedItem = normalize(itemName).replace(/^5 lawn games?$/, "cornhole");
  const product = state.products.find((item) => normalize(item.name) === normalizedItem || normalize(itemName).includes(normalize(item.name)));
  if (product?.image) return { image: product.image, caption: product.name, type: product.category || "Rental" };

  const lawnGame = state.lawnGames.find((item) => normalize(item.name) === normalizedItem || normalize(itemName).includes(normalize(item.name)));
  if (lawnGame?.image) return { image: lawnGame.image, caption: lawnGame.name, type: "Lawn Game" };

  if (/lawn\s*games?/i.test(itemName)) {
    return { image: "/images/lawn-games/cornhole.png", caption: "Lawn games", type: "Lawn Game Add-On" };
  }

  return { image: "", caption: itemName, type: "Included Item" };
}

function itemDescription(itemName) {
  if (/5\s*lawn\s*games?/i.test(itemName)) return "Five lawn games are included with this package. Ask which games best fit your age group, space, and event style.";
  const product = state.products.find((item) => normalize(item.name) === normalize(itemName));
  if (product?.shortDescription) return product.shortDescription;
  const lawnGame = state.lawnGames.find((item) => normalize(item.name) === normalize(itemName));
  if (lawnGame?.description) return lawnGame.description;
  return "Included in this package subject to availability and setup suitability.";
}

function renderIncludedItems(pkg) {
  return (pkg.includedItems || pkg.included || []).map((item) => {
    const asset = imageForItem(item);
    return `
      <article class="package-detail-item">
        ${asset.image ? `<img src="${escapeHtml(asset.image)}" alt="${escapeHtml(asset.caption)} included in ${escapeHtml(pkg.name)}" loading="lazy" onerror="this.remove()">` : ""}
        <div>
          <span>${escapeHtml(asset.type)}</span>
          <h4>${escapeHtml(item)}</h4>
          <p>${escapeHtml(itemDescription(item))}</p>
        </div>
      </article>
    `;
  }).join("");
}

function renderUpgradeCards(pkg) {
  const upgrades = getUpgradeSuggestions(state.packages, pkg);
  if (!upgrades.length) {
    return `<p class="package-upgrade-empty">This is one of our biggest package options. Ask us about custom event builds.</p>`;
  }

  return upgrades.map((upgrade) => `
    <button class="package-upgrade-card" type="button" data-package-upgrade="${escapeHtml(upgrade.id)}">
      ${upgrade.image ? `<img src="${escapeHtml(upgrade.image)}" alt="${escapeHtml(upgrade.name)} package upgrade" loading="lazy" onerror="this.remove()">` : ""}
      <span>${escapeHtml(upgrade.badge || "Upgrade Option")}</span>
      <strong>${escapeHtml(upgrade.name)}</strong>
      <em>${escapeHtml(upgrade.price)}${upgrade.regularValue ? ` value ${escapeHtml(upgrade.regularValue)}` : ""}</em>
    </button>
  `).join("");
}

function renderPackagePanel(pkg) {
  const addonLine = getLawnGameAddonLine(pkg);
  return `
    <section class="package-detail-panel" aria-label="${escapeHtml(pkg.name)} package details">
      <button class="package-detail-close" type="button" aria-label="Close package details">×</button>
      <div class="package-detail-hero">
        <div>
          <p class="eyebrow">Package Details</p>
          <h2>${escapeHtml(pkg.name)}</h2>
          <p>${escapeHtml(pkg.description || "A bundled Nova Kingdom Rentals package for easier planning and more event fun.")}</p>
        </div>
        <div class="package-detail-price">
          <span>${escapeHtml(pkg.price)}</span>
          ${pkg.regularValue ? `<small>Regular value: ${escapeHtml(pkg.regularValue)}</small>` : ""}
          ${pkg.savings ? `<strong>Save ${escapeHtml(pkg.savings)}</strong>` : ""}
        </div>
      </div>

      <div class="package-detail-facts">
        <article><span>Rental length</span><strong>${escapeHtml(pkg.duration || "Up to 6 hours for package rentals")}</strong></article>
        <article><span>Setup</span><strong>Setup and takedown included</strong></article>
        <article><span>Delivery</span><strong>First 15 km from Bridgewater free, then $0.72/km unless otherwise quoted</strong></article>
        <article><span>Booking</span><strong>Final availability and setup suitability are confirmed manually</strong></article>
      </div>

      <div class="package-detail-copy">
        <h3>Included items and related photos</h3>
        <p>These Bridgewater-based party rental packages include the items below. Photos use Nova Kingdom Rentals' existing rental and lawn game images where available.</p>
      </div>
      <div class="package-detail-items">${renderIncludedItems(pkg)}</div>

      <div class="package-addon-box">
        <h3>Optional add-ons</h3>
        <p><strong>Lawn Games:</strong> ${escapeHtml(addonLine)}</p>
        <small>Available lawn game lineup: ${escapeHtml(LAWN_GAMES_LIST.join(", "))}.</small>
        <p style="margin-top:0.75rem;"><strong>Crown Carnival Challenge:</strong> Add the Crown Carnival Challenge inflatable game to any package for $200 (standalone price $270). Features basketball shoot, elephant toss, Tic Tac Toe, and on-point target game in one unit.</p>
      </div>

      <div class="package-upgrades">
        <h3>Want more fun? Upgrade your package.</h3>
        <div class="package-upgrade-grid">${renderUpgradeCards(pkg)}</div>
      </div>

      <div class="package-detail-actions">
        <a class="button button-gold" href="/contact?interest=${encodeURIComponent(pkg.name)}">Check Availability</a>
        <a class="button button-ghost-dark" href="tel:+19029900005">Call Nova Kingdom Rentals</a>
      </div>
    </section>
  `;
}

function setActiveButton(packageId) {
  document.querySelectorAll("[data-package-detail-button]").forEach((button) => {
    const isActive = button.dataset.packageDetailButton === packageId;
    button.setAttribute("aria-expanded", String(isActive));
    button.textContent = "View What’s Included";
  });
}

function openPackage(pkg, card) {
  document.querySelector(".package-detail-panel")?.remove();
  state.activePackageId = pkg.id;
  const packageGrid = card.closest(".package-grid");
  packageGrid?.insertAdjacentHTML("beforebegin", renderPackagePanel(pkg));
  setActiveButton(pkg.id);
  const panel = document.querySelector(".package-detail-panel");
  panel?.querySelector(".package-detail-close")?.addEventListener("click", () => {
    panel.remove();
    state.activePackageId = null;
    setActiveButton("");
  });
  panel?.querySelectorAll("[data-package-upgrade]").forEach((button) => {
    button.addEventListener("click", () => {
      const upgrade = state.packages.find((item) => item.id === button.dataset.packageUpgrade);
      const upgradeCard = findPackageCard(upgrade);
      if (upgrade && upgradeCard) openPackage(upgrade, upgradeCard);
    });
  });
  panel?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function findPackageCard(pkg) {
  if (!pkg) return null;
  return [...document.querySelectorAll(".package-card")].find((card) => normalize(card.querySelector("h3")?.textContent) === normalize(pkg.name));
}

function addSeoCopy(packageGrid) {
  if (document.querySelector(".package-seo-copy")) return;
  const section = document.createElement("section");
  section.className = "package-seo-copy page-section cream compact";
  section.innerHTML = `
    <p class="eyebrow">Bridgewater Party Packages</p>
    <h2>Inflatable packages and lawn game add-ons for South Shore events.</h2>
    <p>Nova Kingdom Rentals is Bridgewater-based and helps families, schools, community organizers, and festival planners across South Shore Nova Scotia compare inflatable packages, water-slide bundles, interactive games, and lawn game add-ons without guessing what is included.</p>
  `;
  packageGrid.closest("section")?.insertAdjacentElement("beforebegin", section);
}

function enhancePackageCards() {
  if (!location.pathname.startsWith("/packages")) return;
  const packageGrid = document.querySelector(".package-grid");
  if (!packageGrid || !state.packages.length) return;
  addSeoCopy(packageGrid);

  document.querySelectorAll(".package-card").forEach((card) => {
    const pkg = findPackageByName(card.querySelector("h3")?.textContent || "");
    if (!pkg || card.querySelector("[data-package-detail-button]")) return;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "button button-gold package-detail-button";
    button.dataset.packageDetailButton = pkg.id;
    button.setAttribute("aria-expanded", "false");
    button.textContent = "View What’s Included";
    button.addEventListener("click", () => openPackage(pkg, card));
    const availabilityButton = card.querySelector(".button");
    availabilityButton?.insertAdjacentElement("beforebegin", button) || card.appendChild(button);
  });

  if (state.activePackageId && !document.querySelector(".package-detail-panel")) {
    const pkg = state.packages.find((item) => item.id === state.activePackageId);
    const card = findPackageCard(pkg);
    if (pkg && card) openPackage(pkg, card);
  }
}

async function initPackageDetails() {
  try {
    await ensureData();
    enhancePackageCards();
    state.observer = new MutationObserver(() => {
      if (state.enhancing) return;
      state.enhancing = true;
      window.requestAnimationFrame(() => {
        enhancePackageCards();
        state.enhancing = false;
      });
    });
    state.observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("popstate", () => window.setTimeout(enhancePackageCards, 50));
    ["pushState", "replaceState"].forEach((method) => {
      const original = history[method];
      history[method] = function patchedHistoryMethod(...args) {
        const result = original.apply(this, args);
        window.setTimeout(enhancePackageCards, 50);
        return result;
      };
    });
  } catch (error) {
    console.warn("Package detail system could not initialize", error);
  }
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initPackageDetails, { once: true });
  } else {
    initPackageDetails();
  }
}
