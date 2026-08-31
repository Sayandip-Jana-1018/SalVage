"""Splitting logged episodes into a training set and a held-out set.

A model fitted on the same episodes it is scored against will look calibrated
whatever it has learned, because it has already seen every answer. The split
below is what makes the calibration figure in ``EVALUATION.md`` mean
"generalises" rather than "memorised".

The split is by hash of the episode id, not by position. Position-based splits
are correlated with time here -- episodes come out of the simulator in
chronological order -- so taking the first 70% would train on the first days of
a run and test on the last, mixing generalisation error with drift. Hashing
gives an assignment that is deterministic, reproducible, and independent of
anything the model can see.
"""

from __future__ import annotations

import hashlib

from salvage_eval.types import LoggedEpisode

DEFAULT_TRAIN_FRACTION = 0.7


def _bucket(episode_id: str, salt: str) -> float:
    """A stable [0,1) value for an episode.

    Hashed rather than taken from ``random``: the assignment has to be the
    same on every machine and every run, or two people reading the same
    ``EVALUATION.md`` are looking at results from different datasets.
    """
    digest = hashlib.sha256(f"{salt}:{episode_id}".encode()).digest()
    return int.from_bytes(digest[:7], "big") / float(1 << 56)


def train_test_split(
    episodes: list[LoggedEpisode],
    train_fraction: float = DEFAULT_TRAIN_FRACTION,
    salt: str = "salvage-eval-split-v1",
) -> tuple[list[LoggedEpisode], list[LoggedEpisode]]:
    """Partition episodes deterministically into (train, test).

    Raises rather than returning an empty side: an evaluation that silently
    scored zero held-out episodes would report a calibration of nothing and
    look identical to one that worked.
    """
    if not 0.0 < train_fraction < 1.0:
        raise ValueError(f"train_fraction must be in (0,1), got {train_fraction}")

    train: list[LoggedEpisode] = []
    test: list[LoggedEpisode] = []
    for episode in episodes:
        target = train if _bucket(episode.episode_id, salt) < train_fraction else test
        target.append(episode)

    if not train or not test:
        raise ValueError(
            f"split produced {len(train)} train and {len(test)} test episodes from "
            f"{len(episodes)}; too few episodes to evaluate honestly"
        )
    return train, test
