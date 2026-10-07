import type { Pds, WriteSession } from "./pds.ts";
import type { Config, CalendarData, EventView } from "./contracts.ts";
import {
  EVENT,
  CLAIM,
  clubs,
  categories,
  validateEvent,
  eventSchema,
} from "./contracts.ts";
import { readAuthority } from "./verifier.ts";
export function createService(pds: Pds, config: Config) {
  // Serialize grants/revocations/publication within this single demo process.
  let queue: Promise<unknown> = Promise.resolve();
  const serial = <T>(fn: () => Promise<T>): Promise<T> => {
    const job = queue.then(fn);
    queue = job.catch(() => {});
    return job;
  };
  async function identities() {
    const [issuerDid, subjectDid] = await Promise.all([
      pds.resolve(config.issuer),
      pds.resolve(config.organiser),
    ]);
    if (issuerDid === subjectDid)
      throw new Error("Issuer and organiser must be separate accounts");
    if (config.issuerDid && issuerDid !== config.issuerDid)
      throw new Error("Issuer DID does not match configured trust anchor");
    return { issuerDid, subjectDid };
  }
  const login = (role: "issuer" | "organiser") =>
    pds.login(config[role], config[`${role}Password`]);
  const policy = (
    ids: { issuerDid: string; subjectDid: string },
    clubId: string,
  ) => ({ ...ids, clubId });
  async function grant(clubId: string, subjectDid?: string) {
    if (!clubs.some((c) => c.id === clubId)) throw new Error("Ukjent klubb");
    const ids = await identities();
    if (subjectDid) {
      if (typeof subjectDid !== "string" || !subjectDid.startsWith("did:"))
        throw new Error("Invalid subject");
      ids.subjectDid = await pds.resolve(subjectDid);
    }
    const current = await readAuthority(pds, policy(ids, clubId));
    if (current.valid) return current;
    if (current.reason === "unavailable")
      throw new Error("Utsteder kan ikke kontrolleres");
    const session = await login("issuer");
    return pds.create(session, CLAIM, {
      $type: CLAIM,
      version: 1,
      demo: true,
      subject: ids.subjectDid,
      clubId,
      issuedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
    });
  }
  async function publish(input: unknown, oauth?: WriteSession) {
    let data;
    try {
      data = validateEvent(input);
    } catch (error) {
      throw Object.assign(
        error instanceof Error ? error : new Error("Ugyldig aktivitet"),
        { status: 400 },
      );
    }
    const ids = await identities();
    const session = oauth || (await login("organiser"));
    ids.subjectDid = session.did;
    const authority = await readAuthority(pds, policy(ids, data.clubId));
    if (!authority.valid) {
      const error = new Error(
        "Klubben har ingen gyldig publiseringstillatelse. Gi tillatelse i demo-panelet først.",
      );
      Object.assign(error, { status: 403 });
      throw error;
    }
    return pds.create(session, EVENT, {
      $type: EVENT,
      name: data.name,
      description: data.description,
      createdAt: new Date().toISOString(),
      startsAt: data.startsAt,
      endsAt: data.endsAt,
      mode: `${EVENT}#inperson`,
      status: `${EVENT}#scheduled`,
      rsvpExpected: false,
      locations: [
        {
          $type: "community.lexicon.location.address",
          name: data.location,
          locality: "Oslo",
          country: "NO",
        },
      ],
      loftet: {
        version: 1,
        demo: true,
        clubId: data.clubId,
        category: data.category,
        authority: { uri: authority.uri, cid: authority.cid },
      },
    });
  }
  return {
    identities,
    grant: (clubId: string, subjectDid?: string) =>
      serial(() => grant(clubId, subjectDid)),
    publish: (input: unknown, oauth?: WriteSession) =>
      serial(() => publish(input, oauth)),
    revoke: (clubId: string, subjectDid?: string) =>
      serial(async () => {
        if (!clubs.some((c) => c.id === clubId))
          throw new Error("Ukjent klubb");
        const ids = await identities(),
          session = await login("issuer");
        if (subjectDid) {
          if (typeof subjectDid !== "string" || !subjectDid.startsWith("did:"))
            throw new Error("Invalid subject");
          ids.subjectDid = await pds.resolve(subjectDid);
        }
        const records = await pds.list(ids.issuerDid, CLAIM);
        for (const record of records.filter(
          (r) =>
            r.value.subject === ids.subjectDid && r.value.clubId === clubId,
        ))
          await pds.remove(session, CLAIM, record.uri.split("/").at(-1) ?? "");
        return { revoked: true };
      }),
    async state({
      viewerDid,
      repos = [],
    }: { viewerDid?: string; repos?: string[] } = {}): Promise<CalendarData> {
      const ids = await identities();
      const organiserDid = ids.subjectDid;
      if (viewerDid) ids.subjectDid = viewerDid;
      const [records, permissions] = await Promise.all([
        Promise.all(
          [...new Set([organiserDid, ...repos])].map(async (did) => {
            try {
              return await pds.list(did, EVENT);
            } catch (error) {
              if (did === organiserDid) throw error;
              return [];
            }
          }),
        ).then((pages) => pages.flat()),
        Promise.all(
          clubs.map(async (c) => ({
            ...c,
            authority: await readAuthority(pds, policy(ids, c.id)),
          })),
        ),
      ]);
      const events: EventView[] = [];
      for (const record of records) {
        const parsed = eventSchema.safeParse(record.value);
        if (!parsed.success) continue;
        const v = parsed.data;
        events.push({
          ...record,
          value: v,
          authority: v.loftet.authority
            ? await readAuthority(
                pds,
                policy(
                  { ...ids, subjectDid: record.uri.split("/")[2] },
                  v.loftet.clubId,
                ),
                v.loftet.authority,
              )
            : { valid: false, reason: "missing" },
        });
      }
      return {
        clubs: permissions,
        categories,
        events: events.sort((a, b) =>
          a.value.startsAt.localeCompare(b.value.startsAt),
        ),
        ...ids,
        organiser: config.organiser,
        issuer: config.issuer,
        environment: config.environment,
      };
    },
    seed: () =>
      serial(async () => {
        const ids = await identities();
        if (
          (await pds.list(ids.subjectDid, EVENT)).some(
            (r) => eventSchema.safeParse(r.value).success,
          )
        )
          return { seeded: false };
        await grant("fjord");
        await grant("marka");
        const fixtures: Array<
          [string, string, string, string, number, number, string]
        > = [
          [
            "Fellestur langs Akerselva",
            "Friluftsliv",
            "marka",
            "Nydalen torg",
            1,
            10,
            "En rolig fellestur med plass til alle. Vi følger elva, tar en kaffepause og blir kjent med nye turvenner. Ta med gode sko og noe varmt i koppen.",
          ],
          [
            "Løpeglede, helt uten stoppeklokke",
            "Løping",
            "fjord",
            "Sognsvann",
            3,
            17,
            "Bli med på en sosial løpeøkt i ditt eget tempo. Vi deler oss i små grupper, og avslutter med en felles strekk. Ingen forkunnskaper nødvendig.",
          ],
          [
            "Åpen svømmehall",
            "Svømming",
            "fjord",
            "Fjordbadet · demoarena",
            5,
            12,
            "Prøv svømming i trygge og hyggelige omgivelser. Våre frivillige viser deg rundt. Ta med badetøy og håndkle.",
          ],
          [
            "En kveld rundt bålet",
            "Fellesskap",
            "marka",
            "Sognsvann · bålplassen",
            7,
            18,
            "Vi samles til en uformell kveld ute. Ta med kveldsmat og en venn, eller kom alene og møt noen nye.",
          ],
        ];
        for (const [
          name,
          category,
          clubId,
          location,
          offset,
          hour,
          description,
        ] of fixtures) {
          const start = new Date();
          start.setUTCDate(start.getUTCDate() + offset);
          start.setUTCHours(hour, 0, 0, 0);
          await publish({
            name,
            category,
            clubId,
            location,
            description,
            startsAt: start.toISOString(),
            endsAt: new Date(+start + 90 * 60000).toISOString(),
          });
        }
        return { seeded: true };
      }),
  };
}

export type CalendarService = ReturnType<typeof createService>;
