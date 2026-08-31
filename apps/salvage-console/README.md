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

Dark liquid glass: centred, layered, generous. Panels are translucent over a
fixed aurora background, with a saturated backdrop blur, an inner highlight
along the top edge and a rim that fades from bright to dim because the light in
the scene comes from above.

Three rules survive from the flat instrument-panel version that preceded this,
and they are the ones that were never about flatness:

1. **Colour means state.** Emerald healthy, amber degraded, rose down, slate
   not-observed. Nothing else uses those hues, so a green thing always means the
   same thing. The accent is iris, chosen to sit outside the state palette.
2. **Money is typeset.** Tabular numerals, rendered from **integer paise** by
   `src/lib/formatters.ts`. Nothing divides by 100 into a float. A *mean* over
   episodes is a different type and has its own formatter, because a statistic
   is not an amount.
3. **Motion has a job.** Entrance and transition are choreography and are
   allowed — panels rise in sequence, the nav marker slides between items. A
   looping animation still means something is wrong. All of it stops under
   `prefers-reduced-motion`.

Performance: `backdrop-filter` is the expensive property here, so it is applied
to a small number of large surfaces — panels, header, nav — never to chips or
table cells, and never animated. The cursor-following highlight writes two CSS
custom properties on one fixed layer, throttled to one write per animation
frame, so no element is laid out or re-rendered.

Interface text is Inter; every identifier, hash and figure is JetBrains Mono.

### History

This file originally specified the opposite — "dense, calm, dark,
information-rich... hairline borders, very restrained shadow" — and Phase 12
built exactly that, deleting a light-mode glassmorphism console along with a
409-line scroll-linked canvas driving fifty JPEGs of unrecorded provenance.
Phase 15 moved to dark glass after seeing the result. What made the *original*
glass bad was never translucency: it was light mode, emerald used as decoration
so colour meant nothing, a magazine serif on an operations screen, and the
canvas. None of that came back.
