# Trip Cost Splitter

Work out who owes what for the fuel after a shared road trip.

You lay out the route, say who was in the car for each stretch, and the app
splits the cost by how much fuel — or charge — each person was actually there
for. Then you send everyone a link showing what they owe, with a payment
button.

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
| `per-km`        | You state a price per kilometre and no fuel is counted at all — not the consumption figure, not litres, nothing.       | When you already know what the car costs to run.  |

Pricing per kilometre changes what a segment's share is measured in, not how it
is cut: a drive is worth its distance at the stated rate, an idle stop is worth
whatever you say the waiting cost, and both are still split evenly between
whoever was there. The consumption figure and price per litre stay on the trip
untouched, so switching back and forth discards nothing.

**Wear and tear is charged by the kilometre, in every mode.** A rate per km for
tyres, servicing and the car itself, sitting alongside whatever the driving
costs. It is charged on kilometres ridden rather than fuel burned, so two people
who covered the same distance owe the same upkeep even if one of them was in the
car for the thirsty half. At zero — which is what every trip starts at, and what
every trip saved before it existed carries — it changes nothing.

It deliberately stays out of the reconciliation against receipts. Upkeep is a
notional charge rather than money that left somebody's pocket at a pump, so
counting it there would make a perfectly reconciled trip look over-billed.

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

## Light and dark

The palette is one set of tokens defined twice over: once on bare `:root`, then
redefined under `prefers-color-scheme: dark` and again under
`[data-theme="dark"]`, so an explicit choice wins in both directions. The
control in the header offers Auto, Light and Dark; Auto removes the attribute
entirely rather than resolving it, which leaves the media query free to follow
the system if it changes while the page is open.

An inline script in the document head applies a stored choice before the first
paint. Without it the page renders in the system theme and then flips, which is
worse than having no toggle at all.

## Settling up

The last step turns the split into money actually moving.

Add your Revolut handle and each person gets a payment link with their amount,
currency and a note already in it:

```
https://revolut.me/mattsivak?currency=CZK&amount=12100&note=Janca%20-%20Alps
```

The amount is in **minor units** — 12100 is 121,00 CZK — which is the unit the
rest of the app counts money in, so the split's figure goes straight through.

Revolut does not document this format: their public docs cover Business payment
links, a different product behind an API, and revolut.me serves the same page
for every path so it cannot be probed. It is therefore isolated in
`src/domain/settle/revolut.ts` behind one tested function, and the interface
offers a link to open your own profile so you can check it before sending
anything to eight people.

The shared page names the account the money is going to, rather than hiding it
inside a button, so nobody has to trust a link they cannot read.

Anyone can mark themselves paid from the shared link. That is a note between
friends, taken on trust: the app cannot see a payment arrive and does not
pretend to. `paidAt` has exactly one writer — its own endpoint — so a collector
with the trip open cannot overwrite a mark made on somebody's phone the next
time autosave runs.

## Storing and sharing

Trips live on the server, one JSON file each, because a shared link has to show
the same thing to everyone and marking yourself paid has to be visible to the
person collecting. **Names, amounts and who has paid are stored server-side** —
this is no longer a browser-only app.

Each trip has two keys:

| Key  | Reaches                          | Who holds it                          |
| ---- | -------------------------------- | ------------------------------------- |
| view | Read the trip, mark someone paid | Everyone you send the payment link to |
| edit | Everything, including delete     | Your browser only                     |

There are no accounts, so the server cannot answer "list my trips" — it does
not know who is asking. The browser keeps an index of the trips it made and the
keys that open them; losing it loses your way back, exactly as losing the link
would. Trips saved by the browser-only version are moved to the server the
first time you open the list.

Keys are 128 bits from the platform CSPRNG. A wrong key and a missing trip
return the same 404, so the API cannot be used to discover which trips exist.
The view key travels in the URL fragment, which never reaches a server log or a
`Referer` header.

Stored files carry a schema `version` so a later release can recognise and
migrate them rather than guess.

Two links come out of the Collect step: the **payment link**, which is
read-only, and an **editable copy**, which carries the whole trip in the URL
fragment and gives the recipient their own separate copy.

### Where the data lives

`.data/trips/` by default; set `TRIPS_DIR` to move it. That directory is the
only thing that needs to survive a redeploy. There is no retention policy yet —
trips stay until deleted.

## Layout

```
src/domain/          Framework-free. No Vue, no Nuxt, no network.
  money/             Integer minor-unit arithmetic and exact allocation
  trip/              Types, energy, overhead, the calculator, the share message
  pricing/           Energy kinds and units, and reading the price feed
  geo/               Working out a country from a request
  settle/            Revolut payment links
  routing/           Provider interface, OSRM, Mapy, segment mapping
  storage/           TripStore interface, localStorage, URL codec
src/fixtures/        The demo trip and the golden test
e2e/                 Playwright specs for the browser-only behaviour
server/api/routing/  Nitro endpoints; where the provider keys stay
server/api/pricing/  The local price lookup, cached
server/api/trips/    Trip storage and the two-key access model
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
