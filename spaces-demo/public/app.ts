import type { Account, GroupView } from "../protocol.ts";
const $ = (id: string): HTMLElement => {
  const element = document.getElementById(id);
  if (!element) throw new Error("Missing " + id);
  return element;
};
const form = (id: string): HTMLFormElement => {
  const element = $(id);
  if (!(element instanceof HTMLFormElement))
    throw new Error("Missing form " + id);
  return element;
};
const field = (id: string): HTMLInputElement => {
  const element = $(id);
  if (!(element instanceof HTMLInputElement))
    throw new Error("Missing field " + id);
  return element;
};
let space = "",
  account: Account | null = null;
async function api<T = unknown>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(
    "/spaces/api/" + path,
    body === undefined
      ? {}
      : {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
  );
  const result: unknown = await response.json();
  if (!response.ok)
    throw new Error(
      result &&
        typeof result === "object" &&
        "error" in result &&
        typeof result.error === "string"
        ? result.error
        : "Request failed",
    );
  return result as T;
}
function clearGroup() {
  $("group").hidden = true;
  $("notices").replaceChildren();
  $("members").textContent = "";
}
function signedIn(value: Account | null) {
  account = value;
  $("login").hidden = !!value;
  $("account").hidden = !value;
  $("identity").textContent = value ? "Signed in as " + value.username : "";
  clearGroup();
}
async function run(action: () => Promise<unknown>) {
  $("status").textContent = "";
  document.querySelectorAll("button").forEach((b) => (b.disabled = true));
  try {
    await action();
  } catch (error) {
    $("status").textContent =
      error instanceof Error ? error.message : "Request failed";
  } finally {
    document.querySelectorAll("button").forEach((b) => (b.disabled = false));
  }
}
async function openGroup(value: string) {
  clearGroup();
  space = value;
  const data = await api<GroupView>(
    "group?space=" +
      btoa(space).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", ""),
  );
  history.replaceState(null, "", "/spaces/#" + space);
  field("share-link").value = location.origin + "/spaces/#" + space;
  $("group-name").textContent = data.name;
  $("owner").hidden = !data.owner;
  $("members").textContent = data.members
    ? data.members.filter((m) => m.read).length +
      " invited reader(s) listed. The owner always has access."
    : "";
  for (const record of data.records) {
    const article = document.createElement("article");
    article.className = "notice";
    const date = document.createElement("time");
    date.textContent = new Date(record.value.createdAt).toLocaleString();
    const content = document.createElement("p");
    content.textContent = record.value.text;
    article.append(date, content);
    $("notices").append(article);
  }
  if (!data.records.length) $("notices").textContent = "No notices yet.";
  $("more").hidden = !data.more;
  $("group").hidden = false;
}
form("login-form").onsubmit = (event) => {
  event.preventDefault();
  const target = event.currentTarget;
  if (!(target instanceof HTMLFormElement)) return;
  const input = Object.fromEntries(new FormData(target));
  const action =
    event.submitter instanceof HTMLButtonElement
      ? event.submitter.value
      : "login";
  run(async () => {
    signedIn(await api<Account>(action, input));
    target.reset();
    if (location.hash) await openGroup(location.hash.slice(1));
  });
};
$("logout").onclick = () =>
  run(async () => {
    await api("logout", {});
    signedIn(null);
  });
form("create-form").onsubmit = (event) => {
  event.preventDefault();
  const target = event.currentTarget;
  if (!(target instanceof HTMLFormElement)) return;
  const input = Object.fromEntries(new FormData(target));
  run(async () => {
    const group = await api<{ uri: string }>("groups", input);
    await openGroup(group.uri);
    target.reset();
  });
};
form("open-form").onsubmit = (event) => {
  event.preventDefault();
  const target = event.currentTarget;
  if (!(target instanceof HTMLFormElement)) return;
  const link = String(new FormData(target).get("link") || "").trim();
  run(() =>
    openGroup(link.includes("#") ? link.slice(link.indexOf("#") + 1) : link),
  );
};
form("member-form").onsubmit = (event) => {
  event.preventDefault();
  const target = event.currentTarget;
  if (!(target instanceof HTMLFormElement)) return;
  const input = Object.fromEntries(new FormData(target));
  const remove =
    event.submitter instanceof HTMLButtonElement &&
    event.submitter.value === "remove";
  run(async () => {
    await api("members", { ...input, remove, space });
    await openGroup(space);
    $("status").textContent = remove
      ? "Reader removed."
      : "Reader added. Share the group link with them.";
    target.reset();
  });
};
form("notice-form").onsubmit = (event) => {
  event.preventDefault();
  const target = event.currentTarget;
  if (!(target instanceof HTMLFormElement)) return;
  const input = Object.fromEntries(new FormData(target));
  run(async () => {
    await api("notices", { ...input, space });
    await openGroup(space);
    target.reset();
  });
};
$("refresh").onclick = () => run(() => openGroup(space));
window.addEventListener("hashchange", () => {
  if (account && location.hash) run(() => openGroup(location.hash.slice(1)));
});
run(async () => {
  try {
    signedIn(await api<Account>("me"));
  } catch {
    signedIn(null);
  }
  if (account && location.hash) await openGroup(location.hash.slice(1));
});
