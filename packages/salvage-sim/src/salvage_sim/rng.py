"""Deterministic randomness, addressed by name rather than by sequence.

Most simulators thread one PRNG through the code and draw from it in order.
That is fine until the day you add a draw, at which point every subsequent
draw shifts and the whole output changes. It is worse than inconvenient here,
for two reasons specific to this package.

**Reproducibility.** Principle 2 of the project is that every decision is
replayable bit-identically. A dataset whose contents depend on the order in
which the generator happened to visit its work is not replayable in any useful
sense; it is replayable only by the exact same build of the exact same code.

**The no-leakage property.** ``calibration.yaml`` has a block of feature-only
nuisance parameters -- observation delay, error-code corruption, missing
fields. Perturbing them must leave the counterfactual labels untouched. With a
sequential PRNG that is essentially impossible to guarantee: drawing one extra
uniform to decide whether to corrupt an error code shifts every later draw,
including the label draws, and the labels change for a reason that has nothing
to do with the world. The invariance test would fail, correctly, and the only
fix would be careful manual stream separation maintained by hand forever.

So randomness here is a **pure function of a key**, not a stream position:

    rng.uniform("outcome.rail", attempt_id)

The same key yields the same value regardless of what else has been drawn,
in what order, in what process, or on how many threads. Adding a new draw
somewhere cannot disturb an existing one. This is the counter-based RNG idea
(Random123, and what JAX does with split keys), implemented with BLAKE2b
because the standard library already has it and the throughput is ample: the
whole cost is a few seconds per hundred thousand events.

Where genuinely sequential draws are needed -- simulating a Markov chain
forward requires them -- :meth:`generator` hands out a numpy ``Generator``
seeded from the same keyed hash. Sequential within one chain, independent
across chains, and still reproducible.

Stream names are dotted strings by convention (``"latent.health.issuer"``).
They are part of the key, so renaming one changes the numbers it produces.
That is deliberate: a stream name is a commitment, not a comment.
"""

from __future__ import annotations

import hashlib
import math
import struct
from typing import Final

import numpy as np

# BLAKE2b's key, not its message. Domain-separating on the seed this way means
# two runs with different seeds share no draws at all, rather than sharing a
# prefix as they would if the seed were merely another key component.
_DIGEST_BYTES: Final = 8
_UINT64_SCALE: Final = 1.0 / (1 << 64)
_SEPARATOR: Final = b"\x1f"  # ASCII unit separator; see _encode below.


def _encode(stream: str, key: tuple[object, ...]) -> bytes:
    """Serialise a key unambiguously.

    The separator matters. Joining with nothing would make ``("ab", "c")`` and
    ``("a", "bc")`` the same key, which is a collision between two different
    attempts and would silently correlate their outcomes. 0x1f cannot appear
    in the identifiers this simulator generates.
    """
    parts = [stream.encode("utf-8")]
    parts.extend(str(component).encode("utf-8") for component in key)
    return _SEPARATOR.join(parts)


class KeyedRandom:
    """Reproducible draws addressed by ``(stream, *key)``.

    Instances are immutable and hold no draw state, so they are safe to share
    freely, including across threads.
    """

    __slots__ = ("_seed", "_seed_bytes")

    def __init__(self, seed: int) -> None:
        if not 0 <= seed < 1 << 63:
            raise ValueError(f"seed must fit in an unsigned 63-bit integer, got {seed}")
        self._seed = seed
        self._seed_bytes = struct.pack(">Q", seed)

    @property
    def seed(self) -> int:
        return self._seed

    def _digest(self, stream: str, key: tuple[object, ...]) -> int:
        hasher = hashlib.blake2b(
            _encode(stream, key),
            digest_size=_DIGEST_BYTES,
            key=self._seed_bytes,
        )
        return int.from_bytes(hasher.digest(), "big")

    def uniform(self, stream: str, *key: object) -> float:
        """A draw from ``[0, 1)``.

        Resolution is 2**-64, which is finer than any probability in
        ``calibration.yaml`` by many orders of magnitude.
        """
        return self._digest(stream, key) * _UINT64_SCALE

    def bernoulli(self, probability: float, stream: str, *key: object) -> bool:
        """``True`` with the given probability.

        Strict ``<`` so that ``probability = 0.0`` is never true. The mirror
        case is safe already: ``uniform`` cannot return 1.0, so
        ``probability = 1.0`` is always true.
        """
        return self.uniform(stream, *key) < probability

    def exponential(self, mean: float, stream: str, *key: object) -> float:
        """An exponential draw with the given mean.

        Uses ``1 - u`` rather than ``u`` so the argument to ``log`` cannot be
        zero: ``uniform`` can return exactly 0.0, and ``log(0)`` is a domain
        error, not a large number.
        """
        if mean <= 0.0:
            raise ValueError(f"exponential mean must be positive, got {mean}")
        return -mean * math.log(1.0 - self.uniform(stream, *key))

    def lognormal(self, median: float, gsd: float, stream: str, *key: object) -> float:
        """A lognormal draw parameterised by median and geometric SD.

        The usual ``(mu, sigma)`` parameterisation is unhelpful in a
        calibration file that a non-statistician has to edit. Median and
        geometric standard deviation are both directly interpretable: the
        median is the typical value, and roughly two thirds of draws fall
        within one multiplicative factor of ``gsd`` either side of it.
        """
        if median <= 0.0:
            raise ValueError(f"lognormal median must be positive, got {median}")
        if gsd <= 1.0:
            raise ValueError(f"lognormal gsd must exceed 1.0, got {gsd}")
        return median * math.exp(math.log(gsd) * self.standard_normal(stream, *key))

    def standard_normal(self, stream: str, *key: object) -> float:
        """A standard normal draw.

        Box-Muller on two independent keyed uniforms. Taking two draws from
        the same key with different suffixes keeps the whole thing pure; the
        second Box-Muller output is discarded rather than cached, because
        caching it would reintroduce exactly the sequential state this module
        exists to avoid.
        """
        u1 = self.uniform(stream, *key, "bm0")
        u2 = self.uniform(stream, *key, "bm1")
        return math.sqrt(-2.0 * math.log(1.0 - u1)) * math.cos(2.0 * math.pi * u2)

    def choice_index(self, weights: tuple[float, ...], stream: str, *key: object) -> int:
        """Index into ``weights``, chosen proportionally.

        Weights need not sum to one. The final index is returned if floating
        point rounding leaves the target just past the end of the cumulative
        sum, which is a real possibility with normalised weights and is not a
        reason to raise.
        """
        total = math.fsum(weights)
        if total <= 0.0:
            raise ValueError("choice_index needs at least one positive weight")
        target = self.uniform(stream, *key) * total
        cumulative = 0.0
        for index, weight in enumerate(weights):
            cumulative += weight
            if target < cumulative:
                return index
        return len(weights) - 1

    def generator(self, stream: str, *key: object) -> np.random.Generator:
        """A numpy ``Generator`` for genuinely sequential work.

        Simulating a Markov chain forward is inherently sequential: the next
        transition depends on the current state. What matters is that each
        chain gets its own generator seeded from its own key, so chains stay
        independent of each other and of the order in which they are built.
        """
        return np.random.default_rng(self._digest(stream, key))

    def derive(self, stream: str, *key: object) -> KeyedRandom:
        """A child ``KeyedRandom`` with an independent key space.

        Useful for handing a subsystem randomness that cannot collide with
        anyone else's even if it reuses the same stream names internally.
        """
        return KeyedRandom(self._digest(stream, key) >> 1)
