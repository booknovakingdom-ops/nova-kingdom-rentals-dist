// Nova Kingdom Rentals — "I want this" interest form for the city Future Attractions
// pages (/future-attractions-<town>-<prov>). Sends to Web3Forms (same inbox as the
// contact form) so the owner can see demand per attraction and per town. Fires the
// Meta Pixel Lead event only after a successful submission.
const W3F_KEY = "909ed8f7-78ca-494f-b960-1713b60bc012";

function init() {
  const form = document.getElementById("fi-form");
  if (!form || form.dataset.ready) return;
  form.dataset.ready = "1";
  const err = document.getElementById("fi-err");
  const ok = document.getElementById("fi-ok");
  const btn = document.getElementById("fi-send");
  const undecided = document.getElementById("fi-undecided");
  const date = document.getElementById("fi-date");
  if (undecided && date) undecided.addEventListener("change", () => { date.disabled = undecided.checked; if (undecided.checked) date.value = ""; });

  // "I want this" buttons on each card tick that attraction and jump to the form
  document.querySelectorAll("[data-want]").forEach((b) => b.addEventListener("click", (e) => {
    e.preventDefault();
    const cb = form.querySelector('input[name="attr"][value="' + b.dataset.want + '"]');
    if (cb) cb.checked = true;
    form.scrollIntoView({ behavior: "smooth", block: "start" });
  }));

  const show = (t) => { err.textContent = t; err.hidden = false; err.scrollIntoView({ behavior: "smooth", block: "center" }); };
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    err.hidden = true;
    const v = (n) => (form.elements[n] && form.elements[n].value != null ? String(form.elements[n].value).trim() : "");
    const attrs = Array.from(form.querySelectorAll('input[name="attr"]:checked')).map((c) => c.value);
    const name = v("name"), phone = v("phone"), email = v("email"), town = v("town");
    const likely = (form.querySelector('input[name="likely"]:checked') || {}).value || "";
    if (!attrs.length) return show("Please tick at least one attraction you want.");
    if (!name) return show("Please enter your name.");
    if (!phone && !email) return show("Please enter a phone number or email so we can reach you.");
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return show("Please check your email address.");
    if (!town) return show("Please enter your town or city.");
    if (!likely) return show("Please tell us how likely you are to book.");
    btn.disabled = true; btn.textContent = "Sending…";
    const payload = {
      access_key: W3F_KEY,
      botcheck: "",
      subject: "I want this (2027): " + attrs.join(" + ") + " — " + town,
      from_name: name,
      business: "Nova Kingdom Rentals",
      enquiryType: "Future attraction interest (2027) — not a booking",
      attractions: attrs.join("; "),
      name: name,
      phone: phone || "Not provided",
      email: email || "Not provided",
      town: town,
      cityPage: form.dataset.city || "",
      eventDate: undecided && undecided.checked ? "Date undecided" : (v("eventDate") || "Not provided"),
      eventType: v("eventType") || "Not provided",
      likelyToBook: likely,
      notes: v("notes") || "None",
      page: window.location.pathname,
    };
    form.querySelectorAll('input[name="attr"]').forEach((c) => { payload["want_" + c.dataset.key] = c.checked ? "Yes" : "No"; });
    if (email) payload.replyto = email;
    try {
      const res = await fetch("https://api.web3forms.com/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) throw new Error(data.message || "Submission failed");
      try { if (window.fbq) window.fbq("track", "Lead"); } catch (x) {}
      form.hidden = true; ok.hidden = false;
      ok.scrollIntoView({ behavior: "smooth", block: "center" });
    } catch (x) {
      show("Sorry — that didn't send. Please try again, or call or text 902-990-0005.");
      btn.disabled = false; btn.textContent = "Send my vote";
    }
  });
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
else init();
