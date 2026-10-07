import { z } from "zod";
export const EVENT = "community.lexicon.calendar.event";
export const CLAIM = "no.demokratiloftet.demo.clubPublisher";
export const clubs = [
  {
    id: "fjord",
    name: "Fjord idrettslag",
    short: "FI",
    color: "green",
    area: "Oslo",
  },
  {
    id: "marka",
    name: "Marka friluftsklubb",
    short: "MF",
    color: "orange",
    area: "Oslo",
  },
];
export const categories = [
  "Alle aktiviteter",
  "Friluftsliv",
  "Løping",
  "Svømming",
  "Fellesskap",
];
const timestamp = z
  .string()
  .regex(/^\d{4}-\d\d-\d\dT.*(Z|[+-]\d\d:\d\d)$/)
  .refine((value) => Number.isFinite(Date.parse(value)), "Ugyldig tidspunkt")
  .transform((value) => new Date(value).toISOString());
const eventInput = z
  .object({
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().min(1).max(3000),
    location: z.string().trim().min(1).max(160),
    clubId: z
      .string()
      .refine(
        (value) => clubs.some((club) => club.id === value),
        "Ukjent klubb",
      ),
    category: z
      .string()
      .refine(
        (value) => categories.slice(1).includes(value),
        "Ukjent aktivitet",
      ),
    startsAt: timestamp,
    endsAt: timestamp,
  })
  .refine(
    (value) => Date.parse(value.endsAt) > Date.parse(value.startsAt),
    "Slutt må være etter start",
  );
export function validateEvent(input: unknown) {
  return eventInput.parse(input);
}
export const referenceSchema = z.object({ uri: z.string(), cid: z.string() });
export const recordSchema = referenceSchema.extend({
  value: z.record(z.string(), z.unknown()),
});
export const eventSchema = z
  .object({
    $type: z.literal(EVENT),
    name: z.string(),
    description: z.string(),
    createdAt: z.string(),
    startsAt: timestamp,
    endsAt: timestamp,
    locations: z.array(z.object({ name: z.string() }).passthrough()).optional(),
    loftet: z
      .object({
        version: z.literal(1),
        demo: z.literal(true),
        clubId: z
          .string()
          .refine((value) => clubs.some((club) => club.id === value)),
        category: z.string(),
        authority: referenceSchema.optional(),
      })
      .passthrough(),
  })
  .passthrough();
export type PdsRecord = z.infer<typeof recordSchema>;
export type RecordReference = z.infer<typeof referenceSchema>;
export type CalendarEvent = z.infer<typeof eventSchema>;
export type EventInput = z.infer<typeof eventInput>;
export type Authority =
  | {
      valid: true;
      reason: "active";
      uri: string;
      cid: string;
      expiresAt: string;
    }
  | { valid: false; reason: string };
export interface Policy {
  issuerDid: string;
  subjectDid: string;
  clubId: string;
  now?: number;
}
export interface Config {
  environment: string;
  issuer: string;
  issuerPassword: string;
  organiser: string;
  organiserPassword: string;
  issuerDid?: string;
}
export type EventView = {
  uri: string;
  cid: string;
  value: CalendarEvent;
  authority: Authority;
};
export type CalendarData = {
  clubs: Array<(typeof clubs)[number] & { authority: Authority }>;
  categories: string[];
  events: EventView[];
  issuerDid: string;
  subjectDid: string;
  organiser: string;
  issuer: string;
  environment: string;
};
