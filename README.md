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

## A trip is a ledger

The trip is one ordered list of lines, in the order things happened, like an
invoice:

- a **drive** — from, to, kilometres;
- a **stop** — waiting somewhere, with the fuel it burned;
- a **buy** — a tank, a toll, parking, a coffee, the apartment.

A buy either **pays for the driving** — it funds the pool the drives draw
from — or is **shared between people**. That flag is the only difference
between a fuel receipt and a round of coffees, and it lives on the line.

Before this there were three lists that could not interleave: the drives in
order, then the receipts, then the tolls. A coffee bought between two drives
had nowhere to sit in the order it happened, and every expense had to be filed
into one of two forms with different fields.

**A line can price itself.** By default a drive costs whatever the trip's
pricing says — fuel at a price per litre, the litres derived from distance and
consumption, or a rate per kilometre. A single drive can override that with a
flat amount or its own rate: a taxi leg, a stretch billed differently. The
lines that price themselves stay out of the fuel pool entirely, so the same
kilometres are never charged twice.

Every trip stored in the old shape is read as a ledger on load. Nothing needs
converting on disk, and no trip loses anything.

## Four steps, and each one asks one thing

1. **People** — who came, who drove.
2. **The route** — the ledger. What happened and what it cost. No people on
   this step at all.
3. **Who pays** — the same list, asked the other question: who was in the car
   for each leg, and whose money each purchase was.
4. **Settle up** — the split, one line per person, and the links to send.

Splitting it this way is what keeps each screen short. The step that asks what
a drive cost does not also ask who was in it, so a leg is one row rather than a
card with a paragraph over it.

## The page your friends get
