# Trip Cost Splitter

Work out who owes what for the fuel after a shared road trip.

You lay out the route, say who was in the car for each stretch, and the app
splits the fuel by the litres each person was actually there for. Everything
stays in the browser.

Live: <https://trips.mattsivak.me/>

## How the split works

Two ideas carry the whole app.

**Litres are the fair-share basis.** A drive's fuel comes from its distance and
the car's consumption; an idle stop's fuel is measured in litres directly.
Either way a segment is just _some fuel plus the people who were there for it_,
and that fuel is split evenly between them. Ride half the trip, pay for half the
trip's fuel.

**Receipts are the ground truth for money.** They are what actually left the
driver's pocket. You can price the trip two ways:

| Mode            | What it does                                                                                                           | When to use it                                    |
| --------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `from-receipts` | Divides exactly the receipt total, in proportion to each person's litres. The price per litre is derived, not entered. | Normal case. Guarantees collected equals spent.   |
| `fixed-price`   | You state a price per litre. Receipts become a cross-check, and the app reports the gap.                               | When you want to bill mileage at a standard rate. |

Rounding lands on the driver: passengers pay whole units, and the driver pays
whatever is left of the whole-unit trip total. The amount collected always
equals the amount billed.

All money is held as integers in minor units. Nothing is ever a float, so the
per-person shares provably sum to the total — there is a test that hammers this
across hundreds of awkward splits.

## Running it

```bash
npm install
npm run dev        # http://localhost:3000
npm run verify     # lint, typecheck, unit tests
npm run test:e2e   # Playwright, against a real build
npm run build && npm run preview
```

The unit tests cover the domain. The Playwright specs cover the handful of
things that only exist in a browser — native drag-and-drop, and what a route
lookup does to the list — and stub `/api/routing/*` so they never depend on a
mapping service being up. First run needs `npx playwright install chromium`.

Verified on Node `v20.19.0`.

## Deploying

`npm run build` produces a self-contained Nitro server in `.output/`. It needs
no `node_modules` at runtime — copy the directory and run it:

```bash
node .output/server/index.mjs   # honours NITRO_HOST, NITRO_PORT and PORT
```

Set `MAPY_API_KEY` in the environment if you want the Mapy.com provider.

## The starting price

A new trip opens priced per unit, prefilled from the local pump price.

The country comes from the request, never from the browser's geolocation API —
nobody gets a permission prompt for a fuel price. A CDN header (`cf-ipcountry`
and friends) answers first. Failing that, a public client address is
geolocated; a loopback or LAN address is not, since it would never resolve, and
the server's own country is used instead. That last case is what makes the
price prefill work in local development, where the visitor and the server are
the same machine.

Prices come from [openvan.camp](https://openvan.camp/en/developers) — free, no
key, 142 countries, weekly from official sources including the EU Weekly Oil
Bulletin and the EIA. Ten of those countries publish per gallon, which is
converted. The price and the currency are applied together or not at all, and
the field says where the number came from until you type over it.

Electric trips are deliberately left blank: charging prices vary far more by
where you plug in than by which country you are in, and a national average
would be confidently wrong for most people.

None of this blocks anything. If the lookup is slow, broken or unsure of the
country, the trip opens at zero and the app simply asks for a price.

## Routing

Distances can be looked up from a list of stops. The provider lives behind an
interface, and the browser never talks to it directly — it calls
`/api/routing/geocode` and `/api/routing/route`, and Nitro talks to the
provider. That is what keeps the API key server-side.

| Provider             | Key needed     | Notes                                                                                            |
| -------------------- | -------------- | ------------------------------------------------------------------------------------------------ |
| OSRM + OpenStreetMap | No             | The default. Works with zero configuration. Public demo servers, so rate-limited and unpromised. |
| Mapy.com             | `MAPY_API_KEY` | Better for Czech and Central European addresses. Activates automatically when the key is set.    |

Every looked-up distance is editable afterwards. The map is a starting point,
not the last word.

```bash
cp .env.example .env   # MAPY_API_KEY is optional
```

## Storing and sharing

Trips are saved in `localStorage` behind a `TripStore` interface whose methods
are all async, so an HTTP-backed store can replace it without touching a single
caller. Nothing is uploaded anywhere.

A trip can be shared as a link that carries the whole trip in the URL fragment.
Whoever opens it gets their own editable copy. The fragment is chosen over a
query string deliberately: it holds people's names, and fragments do not reach
server logs.

## Layout

```
src/domain/          Framework-free. No Vue, no Nuxt, no network.
  money/             Integer minor-unit arithmetic and exact allocation
  trip/              Types, energy, overhead, the calculator, the share message
  pricing/           Energy kinds and units, and reading the price feed
  geo/               Working out a country from a request
  routing/           Provider interface, OSRM, Mapy, segment mapping
  storage/           TripStore interface, localStorage, URL codec
src/fixtures/        The demo trip and the golden test
e2e/                 Playwright specs for the browser-only behaviour
server/api/routing/  Nitro endpoints; where the provider keys stay
server/api/pricing/  The local price lookup, cached
components/          The wizard steps and shared pieces
composables/         Reactive glue between the domain and the pages
pages/               Trip list, the wizard, the share-link importer
```

The domain has no imports from Nuxt or Vue, which is why it is the part with
105 tests and no mocking.

## The example trip

`npm run dev`, then "Open the example trip". It is a real trip, and it is
deliberately shown in `fixed-price` mode so the first thing you see is the app
reporting that the receipts come to 2 793 Kč more than the mileage accounts
for. Switch to "Price from the receipts" and the whole 6 893,73 Kč gets divided
instead.

Its distances are real road distances from OSRM, so "Look up the route"
reproduces them. They replaced a hardcoded table from the app's first version
that ran about 9% high and billed the same pair of towns differently in each
direction.

## Known limits

- The keyless OSRM and Nominatim endpoints are public demo servers. Set
  `MAPY_API_KEY` for anything that needs to be reliable.
- `npm audit` reports two dev-only advisories in the esbuild dev server, pinned
  by the Vite version Nuxt depends on. Neither ships in the built output.
