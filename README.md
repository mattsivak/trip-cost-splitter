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
driver's pocket. You can price the trip three ways:

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

## Getting back into your own trip

There are no accounts, so a trip is yours because your browser holds the key
that edits it. Clear your site data and it is gone from you while still sitting
on the server; make a trip on your phone and your laptop has never heard of it.

The Collect step copies **the link back to this trip** — the same shape as the
payment link, the edit key in the fragment so it stays out of server logs and
Referer headers. Open it anywhere and that browser adopts the trip: it is
listed with your others, and edits save as they always did. The key is then
dropped from the address bar, because the plain address works from that point
on.

The server decides whether a key really opens the trip, so a view key retyped
into the wizard's address adopts nothing — it reads, and the client is told it
only reads. An edit-key holder is handed the view key with the trip, which is
what lets the second device build the group's payment link.

It grants everything, deleting included. The app says so next to the button:
that link is for you, not for the group chat.

## Who actually paid

For a long time this app had a rich vocabulary for who _owes_ and none at all
for who _paid_. Every receipt and every toll was the driver's, and a passenger
who bought the second tank had to work out the difference in their head — the
one thing the app exists to abolish.

Receipts and overhead costs now carry a `paidBy`. Absent means the driver,
which is exactly what every trip written before this field existed meant by
saying nothing, so nothing needed migrating and nothing reads differently until
somebody says otherwise.

Each person then has two numbers rather than one: their **share** of the bill,
and their **net** — the share less whatever they laid out. A passenger who
fronted 900 against a 800 share is owed 100 and is never shown a button asking
them to pay. The columns only appear once somebody other than the driver has
put money down; on the ordinary trip the share and the net are the same number,
and printing it twice teaches nobody anything.

**Everything settles through the driver.** Whoever is down sends them money,
and they send money back to anyone who laid out more than their share. That is
one transfer per person and no more, it needs only the one payment handle the
app has ever asked for, and it is what the group chat message now says: a list
to collect, and a list to send back. Fewer transfers are possible by pairing
debtors against creditors directly, but that needs a payment handle for
everybody, so it waits.

The shared payment page names whose money each receipt was, and gives each
person their own paid-and-net line in the working. Somebody who bought fuel on
a trip should be able to open the link and see it counted.

## One screen, not five steps

A trip used to be a five-step wizard: Route, People, Assign, Split, Collect,
with Back and Next. That shape says the job is one pass in one direction. The
job is actually fiddling — change a distance, move somebody off a leg, add the
toll you forgot, watch the split move — and the wizard made all of that a walk.

Two of the steps were the same object drawn twice. Route listed the legs to set
their distances; Assign listed the same legs to set who was aboard. Editing one
drive meant a round trip between screens. **A leg is one card now**: from, to,
distance, consumption, and under it the bar and the pills for who was in the
car, which re-cut as you tap them.

And the pricing mode, which lived two steps _after_ the route, silently rewrote
it — choosing per-kilometre made the consumption fields disappear behind you.
That is a decision about the car, so it sits above the route, where you can
watch it change what the legs ask for.

What is left is one page in the order the questions arrive: the car, who came,
where it went and who was aboard, what was spent, where that leaves everybody,
and how to get it back. The readout at the top answers "where do I stand" the
whole way down.

## One expense, one line per person

There used to be two lists of money spent, with asymmetric powers: a receipt
took a date and a foreign currency but could not say who it was for, and a toll
said who it was for but took no date, so it could never have its own exchange
rate. Neither slot fitted a hotel. That split is real — fuel funds the pool the
legs are charged against, an extra is divided between the people it was for —
but it is the calculator's business, and filing each expense into one of two
forms was making the user do the filing.

Now there is one list. An expense is a label, an amount, a date and a currency,
and under it a sentence you tap: _Fuel for the whole trip · Matthew paid_, or
_Split evenly between Matthew and Janca · Terka paid_. Opening it gives you
three questions with three answers — what kind, who paid, and how it is split —
each a row of pills. Moving an expense between fuel and extras keeps everything
else about it.

**Fuel keeps its privilege.** It funds the pool and is split by who was in the
car for each leg, which is the thing this app does that a general expense
splitter cannot. The row says so rather than leaving fuel looking like an extra
that lost its control.

And the split itself is one line per person: a name, one figure, and a verb —
_sends_, _gets back_, _settled up_. Under it a bar showing what that figure is
made of, scaled against the largest share so the bars compare between people.
Tap the line for the arithmetic. It was an eight-column table to deliver one
number each, and on a phone every row became a card of seven labelled lines
with the only number that mattered last.

The rounding the driver absorbs is now on the driver's line, where it belongs —
_carries 0,50 Kč of rounding_. It was computed and shown nowhere.

## The words, settled once

One word per thing, and a heading that never changes its text with the state of
the data. A piece of the journey is a **leg** — it was a stretch, a part, a
drive and a segment, two of those in adjacent sentences. The per-kilometre
charge for the car is **car costs**, not upkeep in one table and wear and tear
in the next. Tolls and parking are **extras**. Money somebody put down is
**already paid**, not fronted here and laid out there.

In the tables: **their share** is what a person's use of the car came to,
**already paid** is what they put down, **to pay** is the rounded figure, and
**balance** is where that leaves them — with the verb in the cell, _sends_ or
_gets back_, rather than a legend somewhere else. Two of those headings used to
swap meaning depending on whether anyone but the driver had paid for anything.

## Costs that are not everybody's

Tolls, parking, a vignette, a ferry: the app calls these overheads, and by
default it splits them evenly between everyone on the trip. Often that is
wrong. The vignette is only for the three who crossed into Austria; the ferry
ticket somebody got at half price is not half of a quarter each.

So a cost can name who it is for — a row of the same pills the assign step uses
— or drop the even split entirely and carry the exact amount each person owes.
Switching to per-person amounts seeds them with the even split, so the change
starts from where you were rather than from zero, and a set of amounts that no
longer adds up to the cost says so in the warnings rather than quietly
disagreeing with the total.

The control stays shut until you open it. A cost that really is shared evenly
is one line of text — _split evenly between everyone_ — and nothing else, and a
trip that never touches this stores no allocation at all, exactly as before.

The shared payment page names the people a restricted cost was charged to, in
the working under the payment buttons. Someone who was not on that stretch of
the trip should be able to see that they are not being billed for it.

## Money paid in another currency

A trip that crosses a border spends more than one currency: Czech fuel on the
way out, Austrian tolls in the middle, a euro tank at the far end. Receipts and
overhead costs can each be marked as paid in another currency, and are
converted into the trip's own.

**The conversion happens once, at the boundary.** An entry's `amount` is always
the trip's currency in integer minor units — the foreign figure and its rate
live beside it in `foreign`. So every pool, allocation and total downstream is
ordinary integer arithmetic that knows nothing about exchange rates, and the
guarantee that the shares sum exactly to the total is untouched.

That also means the pair is the truth and the conversion is derived from it.
`parseTrip` recomputes `amount` from `originalAmount × rate` on load, so a
stored figure that no longer matches its rate — hand-edited, or written by a
version that rounded differently — cannot survive being read back.

**The rate is the one for the day of the receipt.** Each receipt carries a
date, and the rate fetched is the rate that applied then, not today's: you were
charged at the rate on the day you paid, and a trip settled three weeks later
should not quietly re-price itself. Type over the rate and it becomes your
number, and the attribution is dropped — the same way the pump price prefill
behaves.

Rates come from [Frankfurter](https://frankfurter.dev), which serves European
Central Bank reference rates — free, no key. The ECB publishes on working days
only, so a Saturday receipt is converted at Friday's rate; the day actually
used is stored and shown, rather than the day that was asked about.

An amount whose rate could not be found converts to nothing, which would be
real money silently leaving the reconciliation. The split warns about it by
name instead.

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

Under the buttons — deliberately under them, because the amount is the point
and the arithmetic is not — the page opens up the whole working: what the bill
was made of, the receipts behind it by name and amount, each person's share
split into fuel, upkeep and other costs, and then every stretch of the trip
with who was aboard for it. Nobody should have to take "you owe 804 Kč" on
faith from a link.

The parts that are zero are not shown. A trip with no upkeep and no tolls has
no upkeep or tolls column, and its bill is one line rather than a subtotal
that repeats the total underneath itself.

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

### Knowing it saved

Every edit is a request, and this app gets used in cars and tunnels, so the
masthead says where the last one got to. It sticks to the top of the page:

| Shows         | Means                                                                      |
| ------------- | -------------------------------------------------------------------------- |
| nothing       | Nothing here autosaves — the trip list, the payment link                   |
| `◌ Saving…`   | The edit is on its way                                                     |
| `✓ Saved`     | It landed. It stays up rather than fading, so you can check after the fact |
| `⚠ Not saved` | It did not land. **Retry** sends the trip as it stands now                 |

`Not saved` persists until a retry succeeds, including if the save that fails
is the one made on your way out of the trip. Nothing is lost by waiting: the
retry sends the current trip, not the edit that happened to fail.

### Where the data lives

`.data/trips/` by default; set `TRIPS_DIR` to move it. That directory is the
only thing that needs to survive a redeploy. There is no retention policy yet —
trips stay until deleted.

## Layout

```
src/domain/          Framework-free. No Vue, no Nuxt, no network.
  money/             Integer minor-unit arithmetic and exact allocation
  trip/              Types, energy, overhead, the calculator, the share message
  pricing/           Energy kinds and units, and reading the price and rate feeds
  geo/               Working out a country from a request
  settle/            Revolut payment links
  routing/           Provider interface, OSRM, Mapy, segment mapping
  storage/           TripStore interface, localStorage, URL codec
src/fixtures/        The demo trip and the golden test
e2e/                 Playwright specs for the browser-only behaviour
server/api/routing/  Nitro endpoints; where the provider keys stay
server/api/pricing/  The local price lookup, cached
server/api/fx/       The exchange rate lookup, cached
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
