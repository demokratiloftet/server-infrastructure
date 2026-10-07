import type { CalendarData, EventView } from "../src/contracts.ts";
type CalendarState = (
  | (CalendarData & { loggedOut?: false })
  | {
      loggedOut: true;
      events: [];
      clubs: [];
      categories: [];
      environment: string;
    }
) & { auth: AuthState; authenticated?: boolean };
import {
  node as $,
  button,
  input,
  select,
  form,
  dialog as getDialog,
  asForm,
  field,
  message,
  escapeHtml as escape,
  request,
} from "./dom.js";
import type { AuthState } from "../src/auth.ts";
import { openAccount } from "./auth-ui.js";
let demoClub = "fjord";
let state: CalendarState | undefined;
let filter = "Alle aktiviteter",
  view = "list",
  month = new Date(),
  toastTimer: ReturnType<typeof setTimeout> | undefined;
const date = (value: string | Date, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("nb-NO", {
    timeZone: "Europe/Oslo",
    ...options,
  }).format(new Date(value));
const dayKey = (value: string | Date) =>
  new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Oslo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
function toast(message: string) {
  $("#toast").textContent = message;
  $("#toast").hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ($("#toast").hidden = true), 5500);
}
async function api<T = Record<string, unknown>>(
  path: string,
  data?: Record<string, unknown>,
) {
  return request<T>("/api/" + path, data);
}
async function load() {
  try {
    state = await api<CalendarState>("state");
    $("#error").hidden = true;
    if (state.loggedOut) {
      $("#events").innerHTML =
        '<div class="empty"><h3>Velkommen til demoen</h3><p>Opprett konto eller logg inn for å se og publisere aktiviteter. Data lagres i vår egen demo.</p></div>';
      $("#result-count").textContent = "Logg inn for å se aktiviteter";
      $("#demo-journey").hidden = true;
      return;
    }
    $("#categories").innerHTML = state.categories
      .map(
        (c) =>
          `<button data-category="${escape(c)}" aria-pressed="${filter === c}">${escape(c)}</button>`,
      )
      .join("");
    const selection = select("#club").value;
    select("#club").innerHTML =
      '<option value="all">Alle arrangører</option>' +
      state.clubs
        .map((c) => `<option value="${c.id}">${escape(c.name)}</option>`)
        .join("");
    select("#club").value = selection;
    const eventSelection = select("#event-club").value;
    select("#event-club").innerHTML = state.clubs
      .map((c) => `<option value="${c.id}">${escape(c.name)}</option>`)
      .join("");
    if (eventSelection) select("#event-club").value = eventSelection;
    select("#event-category").innerHTML = state.categories
      .slice(1)
      .map((c) => `<option>${escape(c)}</option>`)
      .join("");
    render();
    renderDemo();
    renderJourney();
    publishStatus();
  } catch (e) {
    $("#error").textContent = message(e);
    $("#error").hidden = false;
    $("#result-count").textContent = "Sandkassen er ikke tilgjengelig";
    $("#events").innerHTML = "";
    state = undefined;
  }
}
function filtered() {
  const current = state;
  if (!current || current.loggedOut) return [];
  const query = input("#search").value.toLocaleLowerCase("nb");
  return current.events.filter(
    ({ value: v }) =>
      (filter === "Alle aktiviteter" || v.loftet.category === filter) &&
      (select("#club").value === "all" ||
        v.loftet.clubId === select("#club").value) &&
      [
        v.name,
        v.description,
        v.locations?.[0]?.name,
        current.clubs.find((c) => c.id === v.loftet.clubId)?.name,
      ].some((s) =>
        String(s || "")
          .toLocaleLowerCase("nb")
          .includes(query),
      ),
  );
}
function render() {
  const current = state;
  if (!current || current.loggedOut) return;
  if (!current) return;
  const events = filtered();
  $("#result-count").textContent =
    `${events.length} ${events.length === 1 ? "aktivitet" : "aktiviteter"} · Fiktive demodata`;
  $("#month-nav").hidden = view !== "month";
  $("#events").className = view === "month" ? "month-grid" : "event-grid";
  if (view === "month") {
    renderMonth(events);
    return;
  }
  if (!events.length && current.environment === "public-demo") {
    $("#events").innerHTML =
      '<div class="empty"><h3>Ingen aktiviteter ennå.</h3><p>Bruk stegene over for å få demotillatelse og publisere en aktivitet.</p></div>';
    return;
  }
  if (!events.length) {
    $("#events").innerHTML =
      `<div class="empty"><h3>${current.events.length ? "Ingen aktiviteter passer søket." : "Et fellesskap begynner et sted."}</h3><p>${current.events.length ? "Prøv en annen aktivitet eller arrangør." : "Åpne demo-panelet for å legge inn fire eksempelaktiviteter."}</p><button class="text-button" id="empty-demo">Åpne demo-panelet ↗</button></div>`;
    button("#empty-demo").onclick = openDemo;
    return;
  }
  $("#events").innerHTML = events
    .map(({ uri, value: v, authority }) => {
      const c = current.clubs.find((c) => c.id === v.loftet.clubId);
      if (!c) return "";
      return `<article class="event-card"><div class="card-top"><span class="category ${c.color}">${escape(v.loftet.category)}</span><time class="event-time" datetime="${escape(v.startsAt)}">${date(v.startsAt, { day: "numeric", month: "short" })} · ${date(v.startsAt, { hour: "2-digit", minute: "2-digit" })}</time></div><button class="card-open" data-event="${escape(uri)}"><h3>${escape(v.name)}</h3></button><p class="event-location">⌖ ${escape(v.locations?.[0]?.name)}</p><div class="card-footer"><span class="club-avatar ${c.color}">${c.short}</span><span class="club-name">${escape(c.name)}</span><span class="badge ${authority.valid ? "" : "inactive"}">${authority.valid ? "✓ Tillatelse bekreftet" : "○ Tillatelse ikke bekreftet"}</span><button class="card-open arrow" data-event="${escape(uri)}" aria-label="Åpne ${escape(v.name)}">↗</button></div></article>`;
    })
    .join("");
}
function renderMonth(events: EventView[]) {
  const year = month.getFullYear(),
    m = month.getMonth(),
    first = new Date(year, m, 1),
    offset = (first.getDay() + 6) % 7;
  $("#month-label").textContent = new Intl.DateTimeFormat("nb-NO", {
    month: "long",
    year: "numeric",
  }).format(first);
  let html = ["Man", "Tir", "Ons", "Tor", "Fre", "Lør", "Søn"]
    .map((d) => `<div class="weekday">${d}</div>`)
    .join("");
  for (let i = 0; i < 42; i++) {
    const d = new Date(year, m, 1 - offset + i),
      key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    html += `<div class="day ${d.getMonth() !== m ? "outside" : ""} ${key === dayKey(new Date()) ? "today" : ""}"><span>${d.getDate()}</span>${events
      .filter((e) => dayKey(e.value.startsAt) === key)
      .map(
        (e) =>
          `<button data-event="${escape(e.uri)}">${date(e.value.startsAt, { hour: "2-digit", minute: "2-digit" })} ${escape(e.value.name)}</button>`,
      )
      .join("")}</div>`;
  }
  $("#events").innerHTML = html;
}
function openDetail(uri: string | undefined) {
  const current = state;
  if (!current || current.loggedOut) return;
  const event = current.events.find((e) => e.uri === uri);
  if (!event) return;
  const v = event.value,
    club = current.clubs.find((c) => c.id === v.loftet.clubId);
  if (!club) return;
  $("#detail-content").innerHTML =
    `<span class="category">${escape(v.loftet.category)}</span><h2>${escape(v.name)}</h2><div class="detail-meta"><span>${date(v.startsAt, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</span><span>${date(v.startsAt, { hour: "2-digit", minute: "2-digit" })}–${date(v.endsAt, { hour: "2-digit", minute: "2-digit" })} (Oslo)</span><span>⌖ ${escape(v.locations?.[0]?.name)}</span></div><p class="detail-description">${escape(v.description)}</p><p class="notice">${event.authority.valid ? "✓ Gjeldende publiseringstillatelse bekreftet" : "○ Gjeldende tillatelse kan ikke bekreftes"}<br>${escape(club.name)} · Demo-utsteder<br><small>Tillatelsen kontrolleres nå. Aktiviteten beholdes hvis tillatelsen utløper eller trekkes tilbake. Dette er ikke et uavhengig bevis på historisk autorisasjon.</small></p><details><summary>Se AT Protocol-posten</summary><p class="record">${escape(event.uri)}<br>CID: ${escape(event.cid)}</p><pre>${escape(JSON.stringify(event.value, null, 2))}</pre></details>`;
  getDialog("#detail-dialog").showModal();
}
function openDemo() {
  renderDemo();
  getDialog("#demo-dialog").showModal();
}
function renderDemo() {
  const current = state;
  const root = $("#demo-content");
  if (current?.environment === "public-demo") {
    root.innerHTML =
      "<p>Alle data er demonstrasjonsdata. Opprett en konto, få din egen demotillatelse og publiser en aktivitet. Ingen offentlig føderering er aktivert.</p>";
    return;
  }
  if (!current || current.loggedOut) {
    root.innerHTML =
      "<p>Start den lokale PDS-sandkassen først, og last siden på nytt.</p>";
    return;
  }
  if (!current.authenticated) {
    root.innerHTML = `<form id="login-form"><label>Demokode<input name="key" type="password" required autocomplete="current-password"></label><p class="login-note">${current.environment === "local" ? "Lokal demokode: local-demo-only" : "Bruk koden du fikk fra den som drifter sandkassen."}</p><button class="button dark wide">Åpne demokontrollene</button></form><p class="muted">Alle med demokoden kan styre begge fiktive roller. Dette er ikke personlig innlogging.</p>`;
    form("#login-form").onsubmit = async (e) => {
      e.preventDefault();
      await action(e.submitter, async () => {
        await api("session", {
          key: new FormData(asForm(e.target)).get("key"),
        });
        await load();
        toast("Demokontrollene er åpne.");
      });
    };
    return;
  }
  root.innerHTML = `${current.clubs.map((c) => `<div class="demo-club"><span class="club-avatar ${c.color}">${c.short}</span><div><strong>${escape(c.name)}</strong><p>${c.authority.valid ? "✓ Kan publisere" : "○ Kan ikke publisere"}${c.authority.valid ? " · Gyldig i opptil 7 dager" : ""}</p></div><button class="button ${c.authority.valid ? "secondary" : "dark"}" data-authority="${c.authority.valid ? "revoke" : "grant"}" data-club="${c.id}">${c.authority.valid ? "Trekk tilbake" : "Gi tillatelse"}</button></div>`).join("")}<button id="seed" class="button secondary wide">Legg inn eksempelaktiviteter</button><p class="record">Tillatelser gjelder: ${escape(current.subjectDid)}</p><p class="muted">Utstederen skriver en tillatelse i sin egen konto. Kalenderen krever en gyldig tillatelse før publisering. Tilbaketrekking sletter tillatelsen, og blokkerer nye aktiviteter.</p><details><summary>Teknisk innsyn</summary><p class="record">Arrangør: ${escape(current.organiser)}<br>${escape(current.subjectDid)}<br>Utsteder: ${escape(current.issuer)}<br>${escape(current.issuerDid)}</p><p class="muted">Leser direkte fra konfigurert PDS. Ingen offentlig relé eller NIF-integrasjon. Kontokoblinger bruker lokal OIDC og lagres privat. Verifikasjonen stoler på PDS-transporten; uavhengig signaturkontroll er ikke implementert.</p></details>`;
  root.querySelectorAll<HTMLButtonElement>("[data-authority]").forEach(
    (b) =>
      (b.onclick = () =>
        action(b, async () => {
          await api(b.dataset.authority ?? "", {
            clubId: b.dataset.club,
            subjectDid: current.subjectDid,
          });
          await load();
          toast(
            b.dataset.authority === "grant"
              ? "Tillatelse gitt. Klubben kan publisere."
              : "Tillatelse trukket tilbake. Nye publiseringer blokkeres.",
          );
        })),
  );
  button("#seed").onclick = (e) =>
    action(e.currentTarget, async () => {
      const result = await api("seed", {});
      await load();
      toast(
        result.seeded
          ? "Fire aktiviteter er publisert i PDS."
          : "Eksempelaktiviteter finnes allerede.",
      );
    });
}
async function action(button: EventTarget | null, fn: () => Promise<unknown>) {
  if (!(button instanceof HTMLButtonElement)) return;
  button.disabled = true;
  try {
    await fn();
  } catch (e) {
    toast(message(e));
  } finally {
    button.disabled = false;
  }
}
function publishStatus() {
  const current = state;
  if (!current || current.loggedOut) return;
  const club = current?.clubs.find((c) => c.id === select("#event-club").value),
    ok = current?.auth?.user && club?.authority.valid;
  $("#publish-status").textContent = !current?.auth?.user
    ? "Start med å logge inn som en testperson."
    : club?.authority.valid
      ? "✓ Klubben har gyldig tillatelse. Den kontrolleres på nytt ved publisering."
      : "Du mangler publiseringstillatelse for denne klubben. I den lokale demoen kan du simulere klubbens godkjenning nedenfor.";
  button("#event-form button[type=submit]").disabled = !ok;
  button("#create-permission").hidden = !(
    ["local", "public-demo"].includes(current?.environment) &&
    current?.auth?.user &&
    !club?.authority.valid
  );
}
button("#create").onclick = () => openCreate();
button("#demo-open").onclick = openDemo;
button("#trust-details").onclick = openDemo;
for (const dialog of document.querySelectorAll("dialog")) {
  const close = dialog.querySelector<HTMLButtonElement>(".close");
  if (close) close.onclick = () => dialog.close();
}
input("#search").oninput = render;
select("#club").onchange = render;
select("#event-club").onchange = publishStatus;
$("#categories").onclick = (e) => {
  const b = (
    e.target instanceof Element ? e.target : null
  )?.closest<HTMLButtonElement>("button");
  if (!b) return;
  filter = b.dataset.category ?? "Alle aktiviteter";
  $("#categories")
    .querySelectorAll("button")
    .forEach((c) => c.setAttribute("aria-pressed", String(c === b)));
  render();
};
$("#events").onclick = (e) => {
  const b = (
    e.target instanceof Element ? e.target : null
  )?.closest<HTMLElement>("[data-event]");
  if (b) openDetail(b.dataset.event);
};
for (const mode of ["list", "month"])
  button(`#${mode}-view`).onclick = () => {
    view = mode;
    button("#list-view").setAttribute("aria-pressed", String(mode === "list"));
    button("#month-view").setAttribute(
      "aria-pressed",
      String(mode === "month"),
    );
    render();
  };
button("#previous-month").onclick = () => {
  month = new Date(month.getFullYear(), month.getMonth() - 1, 1);
  render();
};
button("#next-month").onclick = () => {
  month = new Date(month.getFullYear(), month.getMonth() + 1, 1);
  render();
};
$("#form-timezone").textContent =
  `Skjemaet bruker din tidssone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}. Kalenderen viser Europe/Oslo.`;
form("#event-form").onsubmit = (e) => {
  e.preventDefault();
  action(e.submitter, async () => {
    const data = Object.fromEntries(new FormData(asForm(e.target)));
    data.startsAt = new Date(String(data.startsAt)).toISOString();
    data.endsAt = new Date(String(data.endsAt)).toISOString();
    await api("events", data);
    getDialog("#create-dialog").close();
    asForm(e.target).reset();
    await load();
    toast("Aktiviteten er publisert. Velkommen med!");
  });
};
await load();

setInterval(() => {
  if (!document.hidden && !document.querySelector("dialog[open]")) load();
}, 30000);

window.addEventListener("auth-changed", () => load());

function openCreate() {
  const current = state;
  if (!current?.auth?.user) {
    openAccount();
    return;
  }
  select("#event-club").value = demoClub;
  publishStatus();
  getDialog("#create-dialog").showModal();
}
async function demoPermission(actionName: string, clubId: string) {
  await api("demo/permission", { action: actionName, clubId });
  await load();
  toast(
    actionName === "grant"
      ? "Demo-utstederen ga deg publiseringstillatelse. Klar for steg 3."
      : "Demotillatelsen er trukket tilbake. Nye publiseringer blir blokkert.",
  );
}
function renderJourney() {
  const current = state;
  if (!current || current.loggedOut) return;
  const root = $("#demo-journey");
  root.hidden = !["local", "public-demo"].includes(current.environment);
  if (root.hidden) return;
  const signed = !!current.auth?.user,
    club = current.clubs.find((c) => c.id === demoClub) || current.clubs[0],
    ready = signed && club.authority.valid;
  root.innerHTML = `<p class="eyebrow">PRØV HELE FLYTEN · KUN DEMO</p><h2>Fra testperson til publisert aktivitet</h2><p>Tre steg. Fiktive personer og klubber, ekte innlogging og lagring.</p><ol class="journey-steps"><li class="${signed ? "complete" : ""}"><strong>1. Logg inn</strong><p>${signed ? "✓ Du er innlogget." : "Velg en testperson, eller lag en ny for å prøve fra starten."}</p><button id="journey-login" class="button secondary">${signed ? "Min testkonto" : "Start demoen"}</button></li><li class="${ready ? "complete" : ""}"><strong>2. Få demotillatelse</strong><label>Klubb<select id="journey-club">${current.clubs.map((c) => `<option value="${c.id}" ${c.id === club.id ? "selected" : ""}>${escape(c.name)}</option>`).join("")}</select></label><p>${ready ? "✓ Demo-utstederen bekrefter at du kan publisere for denne klubben." : "Simuler at klubben gir kontoen din lov til å publisere."}</p><button id="journey-grant" class="button secondary" ${!signed || ready ? "disabled" : ""}>${ready ? "Demotillatelse bekreftet" : "Simuler klubbens godkjenning"}</button></li><li><strong>3. Publiser en aktivitet</strong><p>Lag en aktivitet for klubben. Du kan bruke et ferdig eksempel.</p><button id="journey-publish" class="button dark" ${!ready ? "disabled" : ""}>Lag aktivitet</button></li></ol><p class="field-note">Godkjenningen er en simulering fra vår demo-utsteder, ikke verifisering fra NIF, Idrettens ID eller klubben.</p>${ready ? '<details><summary>Test hva som skjer når tillatelsen trekkes tilbake</summary><p>Aktiviteten blir stående, men merket endres og du kan ikke publisere nye aktiviteter for klubben.</p><button id="journey-revoke" class="button secondary">Trekk tilbake min demotillatelse</button></details>' : ""}`;
  button("#journey-login").onclick = () => openAccount();
  select("#journey-club").onchange = () => {
    demoClub = select("#journey-club").value;
    renderJourney();
  };
  button("#journey-grant").onclick = (event) =>
    action(event.currentTarget, () => demoPermission("grant", demoClub));
  button("#journey-publish").onclick = openCreate;
  if (document.querySelector("#journey-revoke"))
    button("#journey-revoke").onclick = (event) =>
      action(event.currentTarget, () => demoPermission("revoke", demoClub));
}
button("#create-permission").onclick = (event) =>
  action(event.currentTarget, () =>
    demoPermission("grant", select("#event-club").value),
  );
button("#example-event").onclick = () => {
  const eventForm = form("#event-form"),
    start = new Date();
  start.setDate(start.getDate() + 1);
  start.setHours(18, 0, 0, 0);
  const local = (value: Date) =>
    new Date(value.getTime() - value.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
  field(eventForm, "name").value = "Demo: fellestur i nærmiljøet";
  field(eventForm, "location").value = "Ved klubbhuset (fiktivt møtested)";
  field(eventForm, "description").value =
    "En fiktiv aktivitet for å vise publisering og kontroll av demotillatelse. Ikke et virkelig arrangement.";
  field(eventForm, "startsAt").value = local(start);
  field(eventForm, "endsAt").value = local(new Date(+start + 3600000));
};
