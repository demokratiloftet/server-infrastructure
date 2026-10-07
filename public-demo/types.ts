import type { IncomingHttpHeaders } from "node:http";
export interface GatewayConfig {
  socialHost: string;
  calendarHost: string;
  pdsHost: string;
  cookieDomain: string;
  pds: string;
  calendar: string;
  appview: string;
  appviewOrigin: string;
  appviewDid: string;
  labelerDid?: string;
  staticDir: string;
  spaces?: string;
}
export interface UpstreamResponse {
  status: number;
  headers: IncomingHttpHeaders;
  body: Buffer;
}
export function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
export function jsonRecord(buffer: Buffer): Record<string, unknown> {
  const value: unknown = JSON.parse(buffer.toString("utf8"));
  if (!isRecord(value)) throw new Error("Invalid JSON object");
  return value;
}
export function requiredEnv(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error("Missing " + key);
  return value;
}
