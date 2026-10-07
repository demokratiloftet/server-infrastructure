import {
  node as $,
  button,
  select,
  form,
  asForm,
  message,
  escapeHtml as esc,
  request,
} from "./dom.js";
import type { AuthState } from "../src/auth.ts";
let account: AuthState = {
  local: false,
  user: null,
  providers: [],
  links: [],
  pending: null,
  entryProviders: [],
  onboarding: null,
};
const dialog = document.createElement("dialog");
dialog.id = "account-dialog";
document.body.append(dialog);
export async function refreshAccount() {
  account = await request<AuthState>("/api/auth");
  button("#account-open").textContent = account.user ? "Min konto" : "Logg inn";
  if (dialog.open) render();
  return account;
}
async function post<T = Record<string, unknown>>(
  path: string,
  data: Record<string, unknown> = {},
) {
  return request<T>(path, data);
}
async function act(button: EventTarget | null, fn: () => Promise<unknown>) {
  if (!(button instanceof HTMLButtonElement)) return;
  button.disabled = true;
  try {
    await fn();
  } catch (e) {
    const error = $("#account-error");
    error.hidden = false;
    error.textContent = message(e);
  } finally {
    button.disabled = false;
  }
}
function render() {
  dialog.innerHTML = `<div class="dialog-top"><span class="eyebrow">DIN KONTO</span><button class="close" aria-label="Lukk konto">×</button></div><h2>${account.user ? "Én konto. Flere forbindelser." : "Velkommen til Loftet."}</h2><div id="account-error" class="error" role="alert" hidden></div><div id="account-body"></div>`;
  button("#account-dialog .close").onclick = () => dialog.close();
  const body = $("#account-body");
  if (account.onboarding) {
    renderOnboarding(body);
    return;
  }
  if (!account.user) {
    body.innerHTML = `<details><summary>Jeg vil logge inn direkte med en AT-konto</summary><p class="muted">Logg inn med din AT Protocol-konto. Passordet oppgis bare hos kontoleverandøren din.</p><form id="at-login"><label>AT Protocol-konto<input name="handle" required maxlength="253" placeholder="${account.local ? "organiser.test" : "Din konto på den private PDS-en"}" autocomplete="username"></label><button class="button dark wide">Fortsett med AT Protocol ↗</button></form>${account.local ? '<p class="login-note">I den lokale sandkassen: organiser.test. Demopassordet hos PDS er local-sandbox-only.</p>' : '<p class="login-note">Bruk din konto på den private PDS-en, eller demokontoen du fikk fra administratoren.</p>'}<p class="notice">Når du er innlogget, kan du koble en annen identitet til kontoen din. En kobling bekrefter ikke medlemskap eller klubbroller.</p></details>`;
    const entryButtons = document.createElement("div");
    entryButtons.innerHTML = (account.entryProviders || [])
      .map(
        (p) =>
          `<button class="button dark wide" data-entry-provider="${esc(p.id)}">${p.demo ? "Velg eller lag en testperson" : `Logg inn med ${esc(p.label)}`} ↗</button>${p.demo ? '<p class="login-note">Start her. Du kan lage en helt ny testperson eller fortsette med en du har brukt før. Dette simulerer organisasjonens innlogging.</p>' : ""}`,
      )
      .join("");
    body.prepend(entryButtons);
    if (account.publicDemo) {
      body.innerHTML =
        '<p>Bruk kalenderens demokonto, eller opprett en ny konto på neste side.</p><button id="public-login" class="button dark wide">Opprett konto / Logg inn ↗</button>';
      button("#public-login").onclick = (e) =>
        act(e.currentTarget, async () => {
          const r = await post<{ url: string }>("/auth/atproto/start", {});
          location.assign(r.url);
        });
      return;
    }
    entryButtons
      .querySelectorAll<HTMLButtonElement>("[data-entry-provider]")
      .forEach(
        (button) =>
          (button.onclick = () =>
            act(button, async () => {
              const r = await post<{ url: string }>("/auth/identity/start", {
                provider: button.dataset.entryProvider,
              });
              location.assign(r.url);
            })),
      );
    form("#at-login").onsubmit = (e) => {
      e.preventDefault();
      act(e.submitter, async () => {
        const r = await post<{ url: string }>("/auth/atproto/start", {
          handle: new FormData(asForm(e.target)).get("handle"),
        });
        location.assign(r.url);
      });
    };
    return;
  }
  body.innerHTML = `<p class="muted">Innlogget med AT Protocol</p><p class="record account-did">${esc(account.user.did)}</p><p class="notice">Koblinger lagres privat. De publiseres ikke på AT Protocol og gir ingen publiseringstillatelse.</p>${account.pending ? `<div class="link-confirm"><h3>Bekreft kontokoblingen</h3><p>Koble <strong>${esc(account.pending.displayName)}</strong> fra ${esc(account.providers.find((p) => p.id === account.pending?.provider)?.label)} til AT Protocol-kontoen ovenfor?</p><p class="record">Utsteder: ${esc(account.pending.issuer)}</p><button id="confirm-link" class="button dark">Ja, koble kontoene</button> <button id="cancel-link" class="button secondary">Avbryt</button></div>` : ""}<h3 class="account-subtitle">Tilkoblede identiteter</h3>${account.providers
    .map((p) => {
      const link = account.links.find((l) => l.provider === p.id);
      return `<div class="provider-row"><span class="provider-icon">${p.demo ? "◇" : "↗"}</span><div><strong>${esc(p.label)}</strong><p>${link ? `Koblet · ${esc(link.displayName)}` : p.demo ? "Fiktive personer · OIDC-demo" : "Koble din konto"}${link ? `<br><small>${esc(new Date(link.linkedAt ?? "").toLocaleDateString("nb-NO"))}</small>` : ""}</p></div><button class="button ${link ? "secondary" : "dark"}" data-provider="${esc(p.id)}" data-action="${link ? "remove" : "start"}">${link ? "Fjern kobling" : "Koble konto"}</button></div>`;
    })
    .join(
      "",
    )}<p class="muted">Klar for flere leverandører</p><div class="future-providers">${[
    "Idrettens ID",
    "BankID",
    "Vipps",
    "Feide",
  ]
    .filter(
      (label) =>
        !account.providers.some(
          (p) => p.id === label.toLowerCase() || p.label === label,
        ),
    )
    .map((label) => `<span>${label}<small>Ikke konfigurert</small></span>`)
    .join(
      "",
    )}</div><p class="field-note">Reelle leverandører krever klientregistrering, riktige tilganger og en egen nettverkskonfigurasjon.</p><div class="account-footer"><button id="reauth" class="text-button">Bekreft AT-konto på nytt ↗</button><button id="logout" class="text-button">Logg ut</button></div>`;
  body.querySelectorAll<HTMLButtonElement>("[data-provider]").forEach(
    (button) =>
      (button.onclick = () =>
        act(button, async () => {
          if (button.dataset.action === "remove") {
            // Deliberate button press is the unlink confirmation; no account merges.
            await post("/auth/link/remove", {
              provider: button.dataset.provider,
            });
            await refreshAccount();
          } else {
            const r = await post<{ url: string }>("/auth/link/start", {
              provider: button.dataset.provider,
            });
            location.assign(r.url);
          }
        })),
  );
  if (account.pending) {
    button("#confirm-link").onclick = (e) =>
      act(e.currentTarget, async () => {
        await post("/auth/link/confirm");
        await refreshAccount();
      });
    button("#cancel-link").onclick = (e) =>
      act(e.currentTarget, async () => {
        await post("/auth/link/cancel");
        await refreshAccount();
      });
  }
  button("#logout").onclick = (e) =>
    act(e.currentTarget, async () => {
      await post("/auth/logout");
      await refreshAccount();
      window.dispatchEvent(new Event("auth-changed"));
    });
  button("#reauth").onclick = (e) =>
    act(e.currentTarget, async () => {
      const r = await post<{ url: string }>("/auth/atproto/start", {
        handle: account.user?.did,
      });
      location.assign(r.url);
    });
}
export async function openAccount() {
  await refreshAccount();
  render();
  if (!dialog.open) dialog.showModal();
}
button("#account-open").onclick = () => openAccount();
await refreshAccount();
const outcome = new URL(location.href).searchParams.get("auth");
if (outcome) {
  history.replaceState({}, "", location.pathname);
  if (!account.user || account.pending || outcome === "failed")
    await openAccount();
  if (outcome === "failed") {
    $("#account-error").hidden = false;
    $("#account-error").textContent =
      "Innlogging eller kobling ble avbrutt, utløp eller kunne ikke bekreftes. Start på nytt fra denne nettleseren.";
  }
}

function renderOnboarding(body: HTMLElement) {
  const e = account.onboarding;
  if (!e) return;
  const explanation =
    '<p class="notice">Testperson → kalenderkonto → demotillatelse. Du er på steg 1. Ingen medlemskap eller klubbrolle bekreftes av innloggingen.</p>';
  let content;
  if (e.needsReview)
    content =
      "<p>Vi kunne ikke bekrefte kontoopp­rettelsen. Kontakt den som viser demoen. Ikke prøv å opprette samme konto på nytt.</p>";
  else if (e.candidateDid)
    content = `<h3>Klar til å koble sammen</h3><p>Bruk ${esc(e.displayName)} til å logge inn på denne kalenderkontoen senere.</p><details><summary>Se konto-ID</summary><p class="record">${esc(e.candidateDid)}</p></details><button id="confirm-identity" class="button dark wide">Bekreft og fortsett til demotillatelse</button>`;
  else if (e.expectedDid)
    content = `<h3>Godkjenn kalenderkontoen</h3><p>Kontoen er klar. Neste side tilhører kontoleverandøren. Logg inn der, og velg <strong>Authorize</strong> for å gi kalenderen tilgang.</p>${account.local ? '<p class="notice">Har du brukt hurtigopprettelsen? Testpassordet er <code>local-sandbox-only</code>. Eldre kontoer bruker passordet de ble opprettet med.</p>' : ""}<form id="identity-at"><input type="hidden" name="handle" value="${esc(e.expectedHandle || e.expectedDid)}"><button class="button dark wide">Fortsett til godkjenning ↗</button></form>`;
  else
    content = `<h3>Gi testpersonen en kalenderkonto</h3><p>Anbefalt for en ny gjennomgang: opprett en egen demokonto. Bekreft det foreslåtte brukernavnet før kontoen opprettes.</p>${e.canCreate ? `<label>Brukernavn<select id="identity-handle">${(e.suggestions || []).map((s) => `<option value="${esc(s.handle)}">${esc(s.handle)}</option>`).join("")}</select></label><button id="quick-create" class="button dark wide">Opprett demokonto for meg</button><p class="login-note">Kun lokal demo. Kontoen får det delte testpassordet <code>local-sandbox-only</code>. Ikke bruk den til ekte data.</p>` : ""}<details><summary>Jeg har allerede en AT-konto</summary><form id="identity-at"><label>Kontonavn<input name="handle" required maxlength="253" placeholder="organiser.test"></label><button class="button secondary wide">Koble eksisterende konto ↗</button></form></details>`;
  body.innerHTML = `<p>Testperson: <strong>${esc(e.displayName)}</strong></p>${explanation}${content}<button id="cancel-identity" class="text-button">Avbryt og velg en annen testperson</button>`;
  const changed = async () => {
    await refreshAccount();
    window.dispatchEvent(new Event("auth-changed"));
  };
  button("#cancel-identity").onclick = (event) =>
    act(event.currentTarget, async () => {
      await post("/auth/logout");
      await changed();
    });
  if (document.querySelector("#confirm-identity"))
    button("#confirm-identity").onclick = (event) =>
      act(event.currentTarget, async () => {
        await post("/auth/identity/confirm");
        await changed();
        dialog.close();
        document
          .querySelector("#demo-journey")
          ?.scrollIntoView({ behavior: "smooth" });
      });
  if (document.querySelector("#identity-at"))
    form("#identity-at").onsubmit = (event) => {
      event.preventDefault();
      act(event.submitter, async () => {
        const r = await post<{ url: string }>("/auth/atproto/start", {
          handle: new FormData(asForm(event.target)).get("handle"),
        });
        location.assign(r.url);
      });
    };
  if (document.querySelector("#quick-create"))
    button("#quick-create").onclick = (event) =>
      act(event.currentTarget, async () => {
        await post("/auth/identity/create", {
          handle: select("#identity-handle").value,
          password: "local-sandbox-only",
        });
        await changed();
      });
}
