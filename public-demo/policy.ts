import { isRecord } from "./types.ts";
// Deliberately enumerate methods. Adding a feature requires reviewing its API.
export const anonymous = new Map([
  ["com.atproto.server.describeServer", "GET"],
  ["com.atproto.server.createAccount", "POST"],
  ["com.atproto.server.createSession", "POST"],
  ["com.atproto.server.refreshSession", "POST"],
]);
// Public presentation reads only; repository and synchronization APIs stay private.
export const publicReads = new Set([
  "com.atproto.identity.resolveHandle",
  "app.bsky.actor.getProfile",
  "app.bsky.actor.getProfiles",
  "app.bsky.actor.getSuggestions",
  "app.bsky.actor.searchActors",
  "app.bsky.actor.searchActorsTypeahead",
  "app.bsky.feed.getAuthorFeed",
  "app.bsky.feed.getPosts",
  "app.bsky.feed.getPostThread",
  "app.bsky.feed.getLikes",
  "app.bsky.feed.getRepostedBy",
  "app.bsky.feed.getFeed",
  "app.bsky.feed.getFeedGenerator",
  "app.bsky.feed.getFeedGenerators",
  "app.bsky.feed.getSuggestedFeeds",
  "app.bsky.feed.searchPosts",
  "app.bsky.graph.getFollowers",
  "app.bsky.graph.getFollows",
  "app.bsky.graph.getLists",
  "app.bsky.graph.getList",
  "app.bsky.graph.getSuggestedFollowsByActor",
  "app.bsky.labeler.getServices",
  "app.bsky.unspecced.getConfig",
  "app.bsky.unspecced.getPopularFeedGenerators",
  "app.bsky.unspecced.getSuggestedFeeds",
  "app.bsky.unspecced.getSuggestedUsers",
]);
export const authenticated = new Map([
  ...[
    "com.atproto.server.getSession",
    "com.atproto.repo.getRecord",
    "com.atproto.repo.listRecords",
    "com.atproto.repo.describeRepo",
    "com.atproto.identity.resolveHandle",
    "app.bsky.actor.getProfile",
    "app.bsky.actor.getProfiles",
    "app.bsky.actor.getPreferences",
    "app.bsky.actor.getSuggestions",
    "app.bsky.actor.searchActors",
    "app.bsky.actor.searchActorsTypeahead",
    "app.bsky.feed.getTimeline",
    "app.bsky.feed.getAuthorFeed",
    "app.bsky.feed.getPosts",
    "app.bsky.feed.getPostThread",
    "app.bsky.feed.getLikes",
    "app.bsky.feed.getRepostedBy",
    "app.bsky.feed.getFeed",
    "app.bsky.feed.getFeedGenerator",
    "app.bsky.feed.getFeedGenerators",
    "app.bsky.feed.getSuggestedFeeds",
    "app.bsky.feed.searchPosts",
    "app.bsky.feed.getActorLikes",
    "app.bsky.graph.getFollowers",
    "app.bsky.graph.getFollows",
    "app.bsky.graph.getBlocks",
    "app.bsky.graph.getMutes",
    "app.bsky.graph.getLists",
    "app.bsky.graph.getList",
    "app.bsky.graph.getRelationships",
    "app.bsky.graph.getSuggestedFollowsByActor",
    "app.bsky.notification.listNotifications",
    "app.bsky.notification.getUnreadCount",
    "app.bsky.notification.getPreferences",
    "app.bsky.labeler.getServices",
    "app.bsky.unspecced.getConfig",
    "app.bsky.unspecced.getPopularFeedGenerators",
    "app.bsky.unspecced.getSuggestedFeeds",
    "app.bsky.unspecced.getSuggestedUsers",
  ].map((x) => [x, "GET"] as const),
  ...[
    "com.atproto.server.deleteSession",
    "com.atproto.repo.createRecord",
    "com.atproto.repo.putRecord",
    "com.atproto.repo.deleteRecord",
    "com.atproto.repo.applyWrites",
    "com.atproto.repo.uploadBlob",
    "app.bsky.actor.putPreferences",
    "app.bsky.graph.muteActor",
    "app.bsky.graph.unmuteActor",
    "app.bsky.notification.updateSeen",
    "app.bsky.notification.putPreferences",
  ].map((x) => [x, "POST"] as const),
]);
export const oauthPosts = new Set([
  "sign-in",
  "sign-up",
  "sign-out",
  "verify-handle-availability",
  "consent",
  "reject",
]);
export function safePath(raw: unknown): raw is string {
  if (
    typeof raw !== "string" ||
    !raw.startsWith("/") ||
    raw.startsWith("//") ||
    raw.includes("\\")
  )
    return false;
  const p = raw.split("?")[0];
  return (
    !p.includes("%") &&
    !p.includes("//") &&
    !p.split("/").some((x) => x === "." || x === "..")
  );
}
export function rpcPolicy(method: string, verb: string) {
  if (verb === "GET" && publicReads.has(method)) return "public-read";
  if (anonymous.get(method) === verb) return "anonymous";
  if (authenticated.get(method) === verb) return "authenticated";
  return "deny";
}
export function signupBody(input: unknown, domain: string) {
  if (!isRecord(input)) throw new Error("Invalid signup");
  if (
    Object.keys(input).some((k) => !["handle", "email", "password"].includes(k))
  )
    throw new Error("Unsupported signup field");
  const suffix = "." + domain;
  if (
    typeof input.handle !== "string" ||
    !input.handle.endsWith(suffix) ||
    !/^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/.test(
      input.handle.slice(0, -suffix.length),
    )
  )
    throw new Error("Choose a local handle");
  if (
    typeof input.password !== "string" ||
    input.password.length < 12 ||
    input.password.length > 256
  )
    throw new Error("Use a password of 12–256 characters");
  if (
    typeof input.email !== "string" ||
    input.email.length > 254 ||
    !/^\S+@\S+\.\S+$/.test(input.email)
  )
    throw new Error("Invalid email");
  return { handle: input.handle, email: input.email, password: input.password };
}
export function rewriteMedia(
  value: unknown,
  appview: string,
  publicOrigin: string,
): unknown {
  if (typeof value === "string" && value.startsWith(appview + "/img/"))
    return publicOrigin + "/media/" + value.slice((appview + "/img/").length);
  if (Array.isArray(value))
    return value.map((x) => rewriteMedia(x, appview, publicOrigin));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [
        k,
        rewriteMedia(v, appview, publicOrigin),
      ]),
    );
  return value;
}
