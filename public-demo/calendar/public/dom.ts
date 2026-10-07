export function element<T extends Element>(
  selector: string,
  type: { new (): T },
): T {
  const node = document.querySelector(selector);
  if (!(node instanceof type)) throw new Error(`Missing ${selector}`);
  return node;
}
export const node = (selector: string) => element(selector, HTMLElement);
export const button = (selector: string) =>
  element(selector, HTMLButtonElement);
export const input = (selector: string) => element(selector, HTMLInputElement);
export const select = (selector: string) =>
  element(selector, HTMLSelectElement);
export const form = (selector: string) => element(selector, HTMLFormElement);
export const dialog = (selector: string) =>
  element(selector, HTMLDialogElement);
export function asForm(target: EventTarget | null) {
  if (!(target instanceof HTMLFormElement)) throw new Error("Expected a form");
  return target;
}
export function field(target: HTMLFormElement, name: string) {
  const item = target.elements.namedItem(name);
  if (!(
    item instanceof HTMLInputElement ||
    item instanceof HTMLTextAreaElement ||
    item instanceof HTMLSelectElement
  ))
    throw new Error(`Missing form field ${name}`);
  return item;
}
export const message = (error: unknown) =>
  error instanceof Error ? error.message : "Noe gikk galt";
export const escapeHtml = (value: unknown) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ] ?? char,
  );
// The same-origin server validates and constructs each documented API response.
export async function request<T>(
  path: string,
  data?: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(
    path,
    data === undefined
      ? {}
      : {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(data),
        },
  );
  const value: unknown = await response.json();
  if (!response.ok)
    throw new Error(
      value &&
        typeof value === "object" &&
        "error" in value &&
        typeof value.error === "string"
        ? value.error
        : "Noe gikk galt",
    );
  return value as T;
}
