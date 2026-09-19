# Koble Min idrett / Idrettens ID til Loftet

Min idrett bruker **Idrettens ID**. Vi gjenbruker derfor kalenderens eksisterende
OIDC-kobling; ingen ny innloggingstjeneste eller endring i attestasjonsutstederen.

Status: testkonfigurasjon er klargjort i
[providers/idrettens-id.example.json](providers/idrettens-id.example.json).
Ikke aktivert eller testet med en registrert NIF-klient. Ingen VPS-endringer.

## Tekst til NIF Digital

Hei!

Vi utvikler Loftet, en aktivitetskalender i Demokratiloftet, og ønsker å teste
kontokobling med Idrettens ID. Brukeren logger først inn med sin AT Protocol-konto,
velger å koble Idrettens ID, autentiserer seg hos dere og bekrefter koblingen i
Loftet. Koblingen lagres privat og kan fjernes av brukeren.

I første omgang trenger vi kun en stabil identifikator for personen som faktisk
logger inn. Vi ber ikke om medlemskap, verv, familierelasjoner, fødselsnummer eller
rett til å publisere på vegne av et idrettslag.

Kan dere hjelpe oss med:

1. Godkjenning for en testpilot og aktuelle avtaler, priser og personvernkrav?
   Demoen er foreløpig privat via Tailscale. Dokumentasjonen deres omtaler krav
   om allmenn tilgjengelighet; kan en privat utviklingspilot godkjennes?
2. En OIDC-testklient med `client_id`, klienthemmelighet levert sikkert, og
   testbrukere. Bekreft gjeldende issuer/discovery-URL og klientautentisering.
3. Registrering av denne eksakte callback-URL-en:
   `https://calendar.dev.demokratiloftet.no/auth/oidc/idrettens-id/callback`.
   Nettleseren har tilgang via Tailscale; er dette støttet i testmiljøet?
4. Bekreftelse på Authorization Code med S256 PKCE, `openid`, signerte ID-tokens
   med RS256, `nonce` og støtte for `prompt=login`, `max_age=300` og `auth_time`.
   Dette er profilen vår eksisterende adapter bruker, ikke et krav om å endre deres tjeneste.
5. Bekreftelse på at `iss` + `sub` er en stabil nøkkel for innlogget person,
   også når brukeren kan administrere barn/familie. Hvordan håndteres endringer
   i personkontoen, og er identifikatoren forskjellig mellom klienter og miljøer?
6. Et teknisk kontaktpunkt og eventuelle krav til godkjenning før produksjon.

Vi sender organisasjonsnummer, ansvarlig organisasjon og kontaktperson ved søknad.
Målet nå er bare en frivillig kontokobling, uten medlemsregisterintegrasjon.

Vennlig hilsen
Edvin / Demokratiloftet

## Aktivering når vi har svar

- Fyll inn NIFs klientverdier i en privat kopi av JSON-malen og legg objektet til
  eksisterende `OIDC_PROVIDERS_JSON`; behold andre leverandører. Ikke legg hemmeligheter i Git.
- Bekreft issuer, autentiseringsmetode og signeringsalgoritme mot tildelt klient.
  Malen bruker NIFs publiserte testmiljø; produksjon må registreres separat.
- Tillat kun avtalte OIDC-endepunkter i appens origin-allowlist og en begrenset
  utgående nettverkspolicy. Dagens VPS-policy tillater bare private adresser;
  den må utvides målrettet før aktivering. Behold den lokale sandkassen isolert.
- Test innlogging, avbrudd, eksplisitt bekreftelse, duplikatkobling og fjerning med
  NIFs testbrukere. Ikke svekk tokenkontrollene hvis profilen ikke passer.

Knappen dukker automatisk opp under **Min konto** når leverandøren konfigureres.
Vi lagrer privat `issuer` + `sub` knyttet til brukerens DID; ingen matching på navn
eller e-post. Dette er kontokobling, ikke Vipps-/NIF-basert tilgang til PDS-en.
Koblingen gir ingen klubbrolle. Eventuelle medlemskapsattestasjoner er et separat,
senere arbeid med egen avtale og datakilde.

## Kilder (kontrollert 18. september 2026)

- [NIF: Min idrett bruker Idrettens ID](https://www.idrettsforbundet.no/digital/minidrett/artikler/kom-i-gang-med-min-idrett/).
- [NIF: OIDC, søknadsprosess og miljøer](https://idrettsforbundet.atlassian.net/wiki/spaces/DDTII/pages/12386350/).
  NIF administrerer godkjenning; Buypass forvalter den tekniske løsningen.
- [Publisert søknadsskjema](https://forms.office.com/r/LNSJAxKJZu).
- [Testmiljøets discovery](https://auth.nif.test4.buypass.no/auth/realms/nif/.well-known/openid-configuration)
  svarte ved kontroll og annonserte S256, RS256 og `client_secret_basic`.
  Dette verifiserer metadata, ikke at vår klient er godkjent eller at en faktisk
  innlogging fungerer.
