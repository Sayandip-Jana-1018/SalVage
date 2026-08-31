# salvage-console

Next.js 15, TypeScript strict. The operator interface for Salvage.

It reads the live services through server-side route handlers under
`src/app/api`. **There is no fixture.** If a service is down, the screen says
so; it does not render zeros and it does not render an example.

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # display helpers
npm run build      # also type-checks every route and page against the wire types
```

Backends are read from `BRAIN_BASE_URL` (default `http://localhost:8000`) and
`CORE_BASE_URL` (default `http://localhost:8081`). Start them with `make up`
and `make demo` from the repository root.

## Screens

| Route | What it shows |
|---|---|
| `/war-room` | Open incidents, the 24-hour recovery pipeline, the rail sensing matrix, the ledger stream with its chain verdict |
| `/autopsy` | Recent attempts for the tenant, and one attempt reconstructed end to end |
| `/checkout` | Publishes a real `payment_failed.v1` event and follows it through the actual pipeline |
| `/sandbox` | The measured off-policy evaluation from `make eval` |
| `/language` | The language layer, and the argument for where its edges are (Phase 11) |

## Four states, kept distinct

`loading`, `ready`, `missing`, `unavailable`. Every panel renders all four
differently, because **"this does not exist" and "we cannot reach the service
that would know" are different facts**, and collapsing them is how an outage
reads as an all-clear. An empty rail matrix during a backend outage would tell
an operator every rail is fine at the precise moment the console has lost sight
of them.

The same discipline applies to the language layer's status: "switched off" is a
fact the service reported, "the console never got a status" is not the same
fact, and they render differently.

## Design

Dense, calm, dark, information-rich — Stripe's dashboard or Linear at night,
not a landing page. Three rules, all enforced in `src/app/globals.css`:

1. **Colour means state.** Emerald is healthy, amber degraded, rose down, slate
   not-observed. Nothing else uses those hues, so a green cell always means the
   same thing. The single accent is iris, a cool blue-violet deliberately
   outside the state palette, used for focus, the active nav item and links.
2. **Money is typeset.** Tabular numerals wherever a figure appears, and every
   amount rendered from **integer paise** by `src/lib/formatters.ts`. Nothing
   divides by 100 into a float: 1999 paise over 100 is not 19.99 in binary
   floating point, and formatting to two places hides that rather than removing
   it.
3. **Motion marks state change.** No decorative animation. A rail that is DOWN
   pulses because that is information; everything else is still, and all of it
   stops under `prefers-reduced-motion`.

Interface text is Inter; every identifier, hash and figure is JetBrains Mono.

This is the direction the first version of this file specified in Phase 0 and
the console was then built against — light-mode glassmorphism, a display serif,
emerald as decoration, and a 409-line scroll-linked canvas animation driving
fifty JPEG frames whose `PROVENANCE.md` recorded that nobody knew where the
images came from or under what licence. Phase 12 deleted all of it and built
what had been written down.
