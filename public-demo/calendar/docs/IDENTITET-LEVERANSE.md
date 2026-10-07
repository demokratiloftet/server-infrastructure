# Identitetskomponenten: status og første steg

Vurdert 18. september 2026 mot leveranseteksten i budsjettet.
**Vi har deler av komponenten, men leveransen er ikke ferdig.**

## Hva budsjettposten innebærer

«Innlogging med egen OIDC-leverandør og kontoopprettelse» må sees sammen med
«klargjøring av kontoer på infrastruktur for Matrix- og AT-protokollsystemer».
Det er mer enn å koble Idrettens ID til en eksisterende kalenderkonto.

Vi må kunne demonstrere at en ny bruker autentiserer seg med avtalt OIDC-leverandør,
bekrefter opprettelse, får nødvendige protokollkontoer og faktisk kan bruke dem.
«Egen OIDC-leverandør» må avklares: organisasjonens eksisterende leverandør, en
felles leverandør vi drifter, eller begge. Første modul er uavhengig av dette valget.

## Hva vi har

| Del | Faktisk status |
| --- | --- |
| AT Protocol OAuth | Implementert og testet i kalenderen; krever en eksisterende konto. |
| OIDC-kontokobling | Implementert med eksplisitt bekreftelse, privat lagring og fjerning. |
| Vipps / Idrettens ID | Forberedte konfigurasjoner; ingen godkjente klienter eller reell innlogging testet. |
| Egen identitetsleverandør | Kun en syntetisk demoleverandør. Ikke egnet som virkelig brukerkatalog. |
| Kontoopprettelse | Tidligere bare administrativ opprettelse av demokontoer. Nå finnes en nettleserflyt for OIDC-basert klargjøring med lokal PDS-adapter. |
| Matrix | Ingen Matrix-konfigurasjon eller konto-/innloggingstest funnet i prosjektet. |
| Komplett brukerflyt | Lokal onboarding er koblet til UI/ruter. Reell organisasjonsleverandør og produksjonsprovisjonering gjenstår; Matrix er utsatt. |

## Oppdatert første versjon

Avklart brukerreise: organisasjonen tar med egen OIDC-innlogging. Første versjon
skal gi tilgang til kalender og AT Protocol, tilby domener under organisasjonen
eller oss, og både opprette nye kontoer og koble eksisterende. Matrix utsettes.

[IdentityGateway](../../identity-component/packages/identity/README.md) er nå koblet til kalenderens
HTTP-ruter og kontodialog. Den tidligere isolerte enrollment-prototypen er erstattet.
OIDC-innlogging leder til valg mellom en eksisterende AT-konto og en ny lokal
`.test`-konto. Begge veier krever AT OAuth og eksplisitt bekreftelse av koblingen.
Senere OIDC-innlogging gjenbruker gyldig AT-autorisasjon eller ber om ny autorisasjon.
Tidligere identitetskoblinger blir ikke automatisk innloggingstillatelser.

Neste steg før organisasjonspilot er registrert OIDC-leverandør, avklart
adgangspolicy, adapter for kontoopp­rettelse på valgt PDS og organisasjonsdomene,
navnetilgjengelighet og operatørhåndtering av mislykket opprettelse. Lokal demo
krever at brukeren velger PDS-passord og deretter autoriserer hos PDS-en.
Dette er ikke ferdig passordfri SSO eller et komplett gjenopprettingssystem.

Ingen medlemskapsattester eller klubbroller følger av koblingen. Ingen ny kode
er deployet på VPS-en. Se modulens README for testflyt og begrensninger.

## Forholdet til de øvrige budsjettpostene

| Post | Vurdering ut fra prosjektet, ikke formell godkjenning |
| --- | --- |
| Kartlegging | Dette er et avgrenset identitetsnotat, ikke full kartlegging av eksisterende løsninger. |
| Utviklingssandkasse | Lokal PDS/PLC og privat VPS-demo finnes. Eurosky-hosting, eksperthjelp og tilgang for deltakermiljøer må dokumenteres separat. |
| AT-protokollklient | Kalenderen bruker reelle PDS-operasjoner og OAuth; den demonstrerer deler av leveransen. |
| Gjenbrukbare komponenter | Auth og protokollkode finnes. Organisasjonspilot og DPGA-verifisering/publisering er ikke dokumentert som fullført. |
| LLM/feedpersonalisering | Ikke dekket av denne implementasjonen; krever eget veikart/utforskning. |
| Kommunikasjon | Krever egen aktivitetsrapport; kode og demo erstatter ikke rapporten. |

## Teknisk grunnlag

- [AT Protocol: OAuth](https://atproto.com/specs/oauth): OIDC og AT OAuth er ulike
  protokollprofiler; OIDC-identitet erstatter ikke AT-autorisasjon.
- [AT Protocol: kontohåndtering](https://atproto.com/blog/network-account-management):
  PDS-en har egne konto-/registreringsflyter.
- [Synapse: brukerautentisering](https://element-hq.github.io/synapse/latest/usage/configuration/user_authentication/index.html):
  OIDC er en støttet SSO-mulighet. Konkret oppsett må velges og prøves før vi lover
  en Matrix-leveranse.


## Oppdatering 20. september 2026: egen pakke og domenepolicy

Identitetsmappen er nå pakken `@loftet/identity`, og kalenderen bruker dens
publiserte importgrensesnitt. Vi beholder pakken i kalenderrepoet foreløpig for
å teste den sammen med en faktisk bruker av komponenten. Den kan flyttes sammen
med `@loftet/auth` til eget repo senere uten å endre importene.

Handle-policy inngår i identitetskomponenten: konfigurerte OIDC-leverandører kan
få organisasjonsdomene og/eller felles domene. Serveren foreslår navn, brukeren
bekrefter, og navnet reserveres før adapteren oppretter kontoen. Tillatte domener
avgjøres av verifisert innlogging, ikke nettleserens påstander. Feil beholder
reservasjon for manuell avklaring. Neste innlogging bruker issuer + subject og DID.

Dette er implementert og koblet inn i lokal demo. Domenekontroll/DNS og reell
PDS-registrering er fortsatt adapter-/driftsarbeid før organisasjonspilot.
Innlogging via Idrettens ID er fortsatt ikke verifisert med reell leverandør.
Se [pakkens dokumentasjon](../../identity-component/packages/identity/README.md) for API og avgrensninger.


## Flyttet til eget repo 20. september 2026

Den tidligere beslutningen om å beholde pakkene i kalenderrepoet er erstattet:
`identity-component` er nå et eget lokalt Git-repo. Begge pakkene og deres tester
er flyttet dit. Kalenderen installerer versjon 0.2.0 fra npm-arkiver i `vendor/`.
Den nye repo-README-en beskriver bruk fra flere apper og koblingspunktene for
`loftet-social`; Spaces-innloggingen der er foreløpig ikke byttet ut.
