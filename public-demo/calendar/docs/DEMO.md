# Prøv kalenderdemoen lokalt

Åpne http://127.0.0.1:3000 etter at sandkassen er startet (se README).

1. **Start demoen → Velg eller lag en testperson.** Skriv et fiktivt navn og velg
   **Opprett og bruk ny testperson**. Du kan også velge en tidligere testperson.
2. **Opprett demokonto for meg.** Bruk det viste demopassordet
   `local-sandbox-only` hos PDS-en, godkjenn tilgangen, og bekreft kontokoblingen.
   Har du allerede en konto, åpner du alternativet for eksisterende AT-konto.
3. Velg klubb og trykk **Simuler klubbens godkjenning**. Nå får kontoen din
   publiseringstillatelse fra demo-utstederen.
4. **Lag aktivitet → Fyll inn en eksempelaktivitet → Publiser aktivitet.**
   Aktiviteten lagres i kontoens PDS og vises i kalenderen.
5. Åpne **Test hva som skjer når tillatelsen trekkes tilbake** og trekk tilbake
   tillatelsen. Aktiviteten beholdes, merket endres, og nye publiseringer blokkeres.

For å prøve fra starten: logg ut via **Min konto**, og lag en ny testperson.
Hver opprettelse gir en ny identitet, også hvis du bruker samme navn. Personene
lagres i et lokalt Docker-volum og beholdes ved vanlig omstart. Det er maksimalt
200 egendefinerte testpersoner. Ikke slett PDS-data for å starte en ny gjennomgang.

## Hva demonstreres?

OIDC-innlogging, eksplisitt kobling til en AT-konto og publisering bruker de
lokale tjenestene. Klubbgodkjenningen er simulert. Den bruker kalenderens
allerede eksisterende demo-utsteder og tillatelseskontroll, ikke den separate
attestation-issuer-tjenesten. Ingen NIF-/Idrettens ID-verifisering eller uavhengig
signaturverifisering hevdes. En ny tillatelse gjør ikke gamle referanser gyldige igjen.

Snarveien for å gi/trekke tilbake egen tillatelse finnes bare i lokalt miljø,
krever innlogging og forespørsel fra samme origin, og kan bare endre tillatelsen
for den innloggede kontoen. Demopassordet og personvelgeren er kun for syntetiske
data i den isolerte sandkassen. Dette er ikke produksjonsinnlogging.
