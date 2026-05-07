function removePackageIntroOutsidePackages() {
  if (location.pathname.startsWith("/packages")) return;
  document.querySelectorAll(".package-seo-copy").forEach((section) => section.remove());
}

function schedulePackageIntroScopeCheck() {
  window.requestAnimationFrame(removePackageIntroOutsidePackages);
}

function initPackageIntroScope() {
  removePackageIntroOutsidePackages();
  new MutationObserver(schedulePackageIntroScopeCheck).observe(document.body, { childList: true, subtree: true });
  window.addEventListener("popstate", schedulePackageIntroScopeCheck);

  ["pushState", "replaceState"].forEach((method) => {
    const original = history[method];
    history[method] = function patchedPackageIntroScope(...args) {
      const result = original.apply(this, args);
      schedulePackageIntroScopeCheck();
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
