const PACKAGE_DATA_PATH = "/data/packages.json";
const POSTER_STYLE_ID = "package-poster-detail-style";

let packages = [];

const normalize = (value = "") => String(value).toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, " ").trim();

function ensurePosterStyles() {
  if (document.getElementById(POSTER_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = POSTER_STYLE_ID;
  style.textContent = `
    .package-detail-main-image {
      margin: 1.25rem auto;
      max-width: 760px;
    }

    .package-detail-main-image img {
      aspect-ratio: 4 / 5;
      border-radius: 20px;
      box-shadow: 0 18px 45px rgba(16, 26, 58, .13);
      display: block;
      height: auto;
      object-fit: cover;
      width: 100%;
    }
  `;
  document.head.appendChild(style);
}

function insertActivePackagePoster() {
  if (!location.pathname.startsWith("/packages")) return;
  const panel = document.querySelector(".package-detail-panel");
  if (!panel || panel.querySelector(".package-detail-main-image")) return;

  const packageName = panel.querySelector(".package-detail-hero h2")?.textContent || "";
  const pkg = packages.find((item) => normalize(item.name) === normalize(packageName));
  if (!pkg?.image) return;

  const figure = document.createElement("figure");
  figure.className = "package-detail-main-image";

  const image = document.createElement("img");
  image.src = pkg.image;
  image.alt = `${pkg.name} package poster`;
  image.loading = "lazy";
  figure.appendChild(image);

  panel.querySelector(".package-detail-hero")?.insertAdjacentElement("afterend", figure);
}

async function initPackagePosters() {
  if (!location.pathname.startsWith("/packages")) return;
  try {
    const response = await fetch(PACKAGE_DATA_PATH, { cache: "no-store" });
    if (!response.ok) throw new Error(`Could not load ${PACKAGE_DATA_PATH}`);
    packages = await response.json();
    ensurePosterStyles();
    insertActivePackagePoster();
    new MutationObserver(insertActivePackagePoster).observe(document.body, { childList: true, subtree: true });
  } catch (error) {
    console.warn("Package poster helper could not initialize", error);
  }
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initPackagePosters, { once: true });
  } else {
    initPackagePosters();
  }
}
