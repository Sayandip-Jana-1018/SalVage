"""The human review queue: an append-only JSONL file.

Why a file and not a table
--------------------------

salvage-brain does not write to PostgreSQL. Every query in this service is a
``SELECT``, and that is a boundary worth more than the convenience of a table:
the money database is written by salvage-core, inside the transactions that
also append to the hash-chained ledger. Opening a write path from the decision
service so that an LLM's suggestion has somewhere to live would be a poor
trade, and Phase 11 is not the phase to make it.

So a proposal is appended to a file, one JSON object per line, with the model
id, the prompt digest and the timestamp on every record. A reviewer reads it,
and if they agree they edit ``taxonomy/mapper.py`` themselves in a change
someone else can see. Nothing here can edit that table, and no code path
exists that would.

The path is configuration. Unset means proposals are returned to the caller and
not persisted, and the response says ``queued_to: null`` rather than leaving
the caller to assume it was filed somewhere.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any


def append_proposal(path: Path, record: dict[str, Any]) -> None:
    """Append one record as a single JSON line.

    Opened in append mode per call rather than held open: this runs at human
    speed, a few records a day at most, and a long-lived handle in a service
    that can be killed mid-write buys nothing here but a truncated last line.
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    line = json.dumps(record, ensure_ascii=False, sort_keys=True, default=str)
    with path.open("a", encoding="utf-8", newline="\n") as handle:
        handle.write(line + "\n")
