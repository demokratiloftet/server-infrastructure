export const EVENT = 'community.lexicon.calendar.event';
export const CLAIM = 'no.demokratiloftet.demo.clubPublisher';
export const clubs = [
  { id: 'fjord', name: 'Fjord idrettslag', short: 'FI', color: 'green', area: 'Oslo' },
  { id: 'marka', name: 'Marka friluftsklubb', short: 'MF', color: 'orange', area: 'Oslo' },
];
export const categories = ['Alle aktiviteter', 'Friluftsliv', 'Løping', 'Svømming', 'Fellesskap'];
export function validateEvent(input) {
  const text = (key, max) => {
    if (typeof input[key] !== 'string' || !input[key].trim() || input[key].length > max) throw new Error(`Ugyldig ${key}`);
    return input[key].trim();
  };
  const result = { name: text('name', 120), description: text('description', 3000), location: text('location', 160), clubId: text('clubId', 40), category: text('category', 40) };
  if (!clubs.some(c => c.id === result.clubId) || !categories.slice(1).includes(result.category)) throw new Error('Ukjent klubb eller aktivitet');
  for (const key of ['startsAt', 'endsAt']) {
    if (typeof input[key] !== 'string' || !/^\d{4}-\d\d-\d\dT.*(Z|[+-]\d\d:\d\d)$/.test(input[key]) || !Number.isFinite(Date.parse(input[key]))) throw new Error('Ugyldig tidspunkt');
    result[key] = new Date(input[key]).toISOString();
  }
  if (Date.parse(result.endsAt) <= Date.parse(result.startsAt)) throw new Error('Slutt må være etter start');
  return result;
}
