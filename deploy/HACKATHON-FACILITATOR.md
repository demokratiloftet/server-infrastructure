# Intern fasilitatorguide for hackathonets PDS

Bruk navnet **Demokratiløftets hackathon-PDS** når du presenterer tilbudet. Adressen er **https://pds.hackaton.demokratiloftet.no** — domenet staves `hackaton`. Det er et API, ikke en innloggingsside eller en ferdig sosial app.

Denne guiden er for Edvin og ligger i infrastrukturrepoet, utenfor den offentlige app-templaten. Den inneholder ingen kontohemmeligheter.

## Anbefal ett av tre oppsett

| Deltakerens behov                             | Anbefaling                                                                                                                 |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Vil raskt i gang og har/får Tailscale-tilgang | Felles hackathon-PDS, egen syntetisk testkonto per team. Appen kan kjøre lokalt hele dagen.                                |
| Vil eksperimentere selvstendig og har Docker  | `local-sandbox`: offentlig repo som kan klones direkte. Ingen Tailscale; kontoer, DIDs og records nullstilles ved restart. |
| Har allerede en PDS og et oppsett             | La dem bruke det. Bruk deres PDS-adresse og en testkonto.                                                                  |

Felles PDS er standardtilbudet, ikke et krav. Den gir deltakerne mindre lokalt oppsett og gjør det enklere å prøve apper mot hverandres records. Vanlige records kan leses av andre som når PDS-en; separate teamkontoer gir separate skriveidentiteter, ikke private leserom. Bruk testdata.

Si: «Du kan bruke vår test-PDS, kjøre en lokal sandkasse eller bruke din egen. Jeg kan hjelpe deg med testkonto og oppstart, og vi kan se på hosting når du har noe å vise.»

## Før deltakerne kommer

- [app-protospace PR 1](https://github.com/demokratiloftet/app-protospace/pull/1) er merget. Opprett nye repoer fra den oppdaterte templaten; `.env`-støtten og veiledningene ligger på `main`.
- Sørg for en fungerende måte å gi deltakerne Tailscale-tilgang til riktig nettverk. Tailscale på egen maskin er ikke nok; tilgangen må også være gitt.
- Del [local-sandbox](https://github.com/demokratiloftet/local-sandbox) med dem som vil ha lokal PDS. Repoet er offentlig; de trenger Docker og Node.js, men ingen GitHub-invitasjon.
- På en Tailscale-tilkoblet maskin, sjekk:

```sh
curl --fail --show-error --max-time 10 \
  https://pds.hackaton.demokratiloftet.no/xrpc/com.atproto.server.describeServer
```

Et JSON-svar med `inviteCodeRequired: true` er forventet. Dette sjekker tilgjengelighet, ikke innlogging. Sist kontrollert 15. oktober 2026: API svarte normalt, `hackathon-pds-1` var `running healthy`, og den installerte konto-oppretteren samsvarte med kilden i dette repoet.

## Klargjør ett team

Teamet trenger ingen VPS- eller administratortilgang. Kjør dette fra **Edvins infrastruktur-checkout** med den eksisterende SSH-nøkkelen. Velg et kort teamnavn med små bokstaver, tall og bindestrek; bytt ut `team-name`.

### 1. Opprett eller gjenbruk teamets testkonto

```sh
HACKATHON_TEAM=team-name
ssh -i /Users/edvin/.ssh/hostinger \
  -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=yes \
  root@187.124.129.149 \
  "python3 /root/loftet-protospace-bootstrap-20261013/pds-account.py ${HACKATHON_TEAM}"
```

Dette bruker den installerte konto-oppretteren. En ny konto får handle `<team>.pds.hackaton.demokratiloftet.no`. Samme teamnavn gjenbruker den lagrede kontoen. Skriptet skriver bare handle og filsti til terminalen. Det lagrer kontopassordet i en root-beskyttet fil på VPS-en; det er ikke et apppassord ennå.

### 2. Lag en deltakerfil med apppassord

Fortsatt på Edvins maskin, koblet til Tailscale:

```sh
umask 077
mkdir -p .runtime
scp -i /Users/edvin/.ssh/hostinger \
  -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=yes \
  "root@187.124.129.149:/etc/loftet-deploy/hackathon/accounts/${HACKATHON_TEAM}.json" \
  ".runtime/${HACKATHON_TEAM}.account.json"
```

Følgende bruker kontopassordet til å lage et eget apppassord og skriver en ferdig `.env`-fil. Det skriver ingen hemmeligheter til terminalen. `.runtime/` er ignorert av Git.

```sh
node --input-type=module - "$HACKATHON_TEAM" <<'JS'
import { readFile, writeFile, access } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
const team = process.argv[2];
if (!/^[a-z][a-z0-9-]{0,49}$/.test(team)) throw new Error('Invalid team name');
const output = `.runtime/${team}.env`;
try {
  await access(output);
  throw new Error('Deltakerfilen finnes allerede. Bruk den eksisterende filen.');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
const account = JSON.parse(await readFile(`.runtime/${team}.account.json`, 'utf8'));
const base = 'https://pds.hackaton.demokratiloftet.no';
async function rpc(method, body, token) {
  const response = await fetch(`${base}/xrpc/${method}`, {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000),
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${method}: HTTP ${response.status}`);
  return response.json();
}
const session = await rpc('com.atproto.server.createSession', {
  identifier: account.identifier, password: account.password,
});
const app = await rpc('com.atproto.server.createAppPassword', {
  name: `hackathon-${team}-${randomUUID()}`, privileged: false,
}, session.accessJwt);
if (typeof app.password !== 'string' || !app.password) throw new Error('App password missing');
await writeFile(output, [
  `PDS_URL=${base}`,
  `PDS_IDENTIFIER=${account.identifier}`,
  `PDS_APP_PASSWORD=${JSON.stringify(app.password)}`,
  '',
].join('\n'), { mode: 0o600, flag: 'wx' });
console.log(`Deltakerfil klar: ${output}`);
JS
```

Del bare teamets `.env`-fil privat med det teamet. Behold `.account.json` hos deg; den inneholder kontopassordet. Ikke vis filinnhold på storskjerm eller legg det i Git, issues eller felles chat. Kjør ikke kodeblokken om igjen for å finne et glemt passord: bruk den eksisterende deltakerfilen. Apppassord kan tilbakekalles via `com.atproto.server.revokeAppPassword` med navnet fra `listAppPasswords` når tilgangen skal avsluttes.

### 3. Bekreft sammen med deltakeren

1. Gi dem Tailscale-tilgang og sjekk `describeServer`-adressen over fra deres maskin.
2. La dem opprette og klone sitt eget repo fra templaten. Node.js 24.17.0 og pnpm 11.8.0 skal være installert.
3. Kopier innholdet fra deltakerfilen til `.env` i apprepoet. Hvis `.env` allerede finnes, legg til de tre PDS-verdiene uten å overskrive annen konfigurasjon.
4. Kjør `pnpm install`, deretter `pnpm pds:demo`. Forvent en `at://`-adresse og `Synthetic record removed.`
5. Kjør `pnpm dev`, åpne http://127.0.0.1:5173, og hjelp dem å endre den første skjermen.

Nå virker utviklingsmiljø og ekte record-operasjoner. Neste oppgave er å koble deres eget grensesnitt til de operasjonene de trenger. Templaten har ennå ingen innloggingsskjerm/OAuth eller automatisk feed på tvers av brukere.

## Når de vil dele eller hoste appen

Besøkende kan bruke de tre publiserte appene uten Tailscale: [template-eksempel](https://app-protospace.hackaton.demokratiloftet.no), [sports-publisher](https://sports-publisher.hackaton.demokratiloftet.no) og [sports-viewer](https://sports-viewer.hackaton.demokratiloftet.no). Publisering i sportsappen krever demopassordet. Appenes backend når den private PDS-en; nettleseren kobler ikke direkte til PDS-en. Lokal utvikling mot felles PDS krever fortsatt Tailscale. Nettleserbasert PDS/OAuth-innlogging er derfor ikke automatisk tilgjengelig for publikum.

Dette publiserer appenes tillatte HTTP-ruter, ikke PDS-en, relay eller Jetstream. Data som appene viser offentlig kan likevel kopieres av besøkende. Bruk testdata.

To lokale apper kan allerede dele records via felles PDS. For å la en annen app lese, del record-adressen og formatet; ikke skrivernes passord.

Be om repo-lenke, kontaktperson og behov for database, eksterne API-er eller bakgrunnsjobber. Repoet kan eies av teamet. Nåværende automatiske VPS-registrering støtter repoer i `demokratiloftet` med `main`; andre eiere/stakker må avklares separat. Driftstrinnene finnes i [SANDBOX.md](SANDBOX.md).

Nye apper starter privat. Du kan tilby offentlig HTTPS etter en kort sjekk av appens ruter, innlogging og ressursbehov. Hver app får sin egen avgrensede rute og DNS-record; wildcard/PDS forblir privat. Se [PUBLIC-HACKATHON.md](PUBLIC-HACKATHON.md). Teamene får ikke VPS-shell, Docker-tilgang eller org-verifier-tilgang.

En app på VPS-en når ikke en PDS på deltakerens `localhost`. Ved overgang fra lokal sandkasse trengs ny konto/konfigurasjon, nye testdata og oppdaterte DID-/record-referanser. Ingen automatisk migrering skjer. Det delte VPS-oppsettet kobler til hackathon-PDS-en; andre eksterne tjenester må få eget oppsett.

Avtal etter arrangementet hvem som eier appen, hvor lenge den skal kjøre, og hvilke testdata som skal beholdes. Felles PDS-data ligger på et eget vedvarende volum; ikke kjør `down -v` for en vanlig omstart.

## Hvis noe stopper opp

| Symptom                                          | Neste steg                                                                                                                        |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| Timeout mot felles PDS                           | Kontroller Tailscale-tilgang på deltakerens maskin.                                                                               |
| PDS er tilgjengelig, men innlogging feiler       | Sjekk at handle og apppassord hører til valgt PDS. Ikke bruk lokale fixture-kontoer på felles PDS.                                |
| `.env` ser riktig ut, men appen bruker noe annet | Restart `pnpm dev`; allerede eksporterte shell-variabler overstyrer `.env`.                                                       |
| Lokal sandbox kan ikke klones                    | Repoet er offentlig. Sjekk repo-URL, Git og nettforbindelse; det kreves ingen invitasjon.                                         |
| Lokal port er opptatt                            | `DEV_PORT=5174 API_PORT=3001 pnpm dev`; åpne port 5174.                                                                           |
| Felles PDS svarer ikke for noen                  | Sjekk `docker inspect` for `hackathon-pds-1` og infrastrukturen. Ikke nullstill PDS eller endre nettverksgrensene som en snarvei. |

Kilde til apppassord-operasjonen: [AT Protocol createAppPassword](https://github.com/bluesky-social/atproto/blob/main/lexicons/com/atproto/server/createAppPassword.json).
