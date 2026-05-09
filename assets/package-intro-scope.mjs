function removePackageIntroOutsidePackages() {
  if (location.pathname.startsWith("/packages")) return;
  document.querySelectorAll(".package-seo-copy").forEach((section) => section.remove());
}

function removeServiceAreasFromHeader() {
  document.querySelectorAll('.site-header nav a[href="/service-areas"]').forEach((link) => link.remove());
}

function applyScopedPageAdjustments() {
  removePackageIntroOutsidePackages();
  removeServiceAreasFromHeader();
}

function scheduleScopedPageAdjustments() {
  window.requestAnimationFrame(applyScopedPageAdjustments);
}

function initPackageIntroScope() {
  applyScopedPageAdjustments();
  new MutationObserver(scheduleScopedPageAdjustments).observe(document.body, { childList: true, subtree: true });
  window.addEventListener("popstate", scheduleScopedPageAdjustments);

  ["pushState", "replaceState"].forEach((method) => {
    const original = history[method];
    history[method] = function patchedPackageIntroScope(...args) {
      const result = original.apply(this, args);
      scheduleScopedPageAdjustments();
      return result;
    };
  });
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initPackageIntroScope, { once: true });
  } else {
    initPackageIntroScope();
  }
}
