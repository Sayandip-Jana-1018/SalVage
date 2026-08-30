# Frame sequence provenance

**These files have no recorded source, and that is a problem to resolve before
this repository is published or submitted anywhere.**

`ezgif-frame-001.jpg` through `ezgif-frame-050.jpg` (1.8 MB total) drive the
scroll-linked hero animation in
[`ScrollFrameSequence.tsx`](../../src/components/ScrollFrameSequence.tsx). The
filenames indicate they were produced by splitting an animated GIF with
[ezgif.com](https://ezgif.com), a web tool. What that GIF was, who made it, and
under what licence it may be redistributed are all unknown.

## Why this matters

Shipping media of unknown origin in a repository that will be read by an
outside party is a real legal exposure, not a formality. It is also
inconsistent with how the rest of this project handles provenance: every number
in `packages/salvage-sim/calibration.yaml` carries a note naming where a real
value would come from, and
[ADR-0006](../../../../docs/adr/0006-numbers-policy.md) forbids unsourced
claims outright. Unsourced *assets* deserve the same treatment.

## Resolve it one of these ways

1. **Record the source.** If the original is known and its licence permits
   redistribution, replace this file with the source URL, the author, the
   licence, and the date obtained.
2. **Replace the frames.** Substitute footage that is owned or clearly
   licensed — a screen recording of the console itself would be more relevant
   to the product than the current animation.
3. **Remove the sequence.** `ScrollFrameSequence` is decorative. The war room
   works without it.

Until one of those is done, treat this directory as unresolved.
