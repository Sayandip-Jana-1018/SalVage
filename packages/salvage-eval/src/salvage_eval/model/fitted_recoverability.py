"""A recovery model fitted from logged outcomes.

Why this exists
---------------

``RecoverabilityModel`` in salvage-brain is a hand-written lookup table: one
probability per (cause, action) pair, chosen by a person. Once the evaluation
harness started measuring calibration properly it found two places where those
numbers are badly wrong -- a scheduled retry after a generic error code
predicted at 0.35 against an observed 0.76, and at 0.52 against an observed
0.02 for insufficient funds outside the pre-payday window.

The tempting fix is to edit those two constants. That is exactly the mistake
this repository already made once: a hand-written table tuned against a
particular dataset is fitted to it, just by hand and without a held-out set to
catch it. This class fits the same quantity from data instead, and is scored
on episodes it was not fitted on.

What it is allowed to see
-------------------------

**Only what a production system would have: the action that was taken and
whether it worked.** ``counterfactual_rewards`` and
``counterfactual_recoveries`` carry the outcome of every action *not* taken.
They are the answer key, they exist for evaluation, and a model that reads
them would score beautifully and be worthless. :meth:`fit` takes the fields a
real log would contain and nothing else, and
``tests/test_fitted_recoverability.py`` asserts it.

How it estimates
----------------

Hierarchical shrinkage over three nested cells, coarse to fine:

1. the action alone
2. the action and the observed cause
3. the action, the observed cause, and whether it is the pre-payday window

Each level is smoothed toward its parent with a pseudo-count::

    p = (successes + m * p_parent) / (n + m)

so a cell with plenty of evidence follows its own data and a sparse one falls
back to the coarser estimate rather than to a confident 0.0 or 1.0 drawn from
three observations. That is the whole trick, and it is deliberately something
a reader can check by hand.

No gradient descent, no hyperparameter search, no library. The estimate for
any cell can be recomputed from the counts this class prints, which matters
more here than squeezing out the last point of accuracy: an operator has to be
able to ask why the model believed something, and get an answer.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field
from typing import Any

from salvage_eval.baselines.observable import ObservedCause, is_permanent, observed_cause
from salvage_eval.types import EvaluatedAction, LoggedEpisode

#: Pseudo-count pulling a cell toward its parent. At 20, a cell needs roughly
#: 20 observations before it weighs as much as its parent estimate. Chosen as
#: a round number rather than tuned -- tuning it against the test set is the
#: thing this class exists to avoid.
SMOOTHING_PSEUDOCOUNT = 20.0


@dataclass(frozen=True, slots=True)
class Cell:
    """One estimated probability, with the evidence behind it."""

    probability: float
    successes: float
    trials: float
    parent_probability: float

    def explain(self) -> str:
        return (
            f"p={self.probability:.3f} from {self.successes:.0f}/{self.trials:.0f} "
            f"observed, shrunk toward {self.parent_probability:.3f}"
        )


@dataclass
class _Counts:
    successes: float = 0.0
    trials: float = 0.0


@dataclass
class FittedRecoverabilityModel:
    """P(recovery | context, action), estimated from logged outcomes."""

    smoothing: float = SMOOTHING_PSEUDOCOUNT
    _global: _Counts = field(default_factory=_Counts)
    _by_action: dict[EvaluatedAction, _Counts] = field(default_factory=lambda: defaultdict(_Counts))
    _by_action_cause: dict[tuple[EvaluatedAction, ObservedCause], _Counts] = field(
        default_factory=lambda: defaultdict(_Counts)
    )
    _by_action_cause_payday: dict[tuple[EvaluatedAction, ObservedCause, bool], _Counts] = field(
        default_factory=lambda: defaultdict(_Counts)
    )
    _fitted: bool = False

    # -- fitting -----------------------------------------------------------

    @classmethod
    def fit(
        cls, episodes: list[LoggedEpisode], smoothing: float = SMOOTHING_PSEUDOCOUNT
    ) -> FittedRecoverabilityModel:
        """Fit from logged episodes.

        Reads ``episode.context``, ``episode.action`` and
        ``episode.is_recovered`` -- the three things a production log actually
        contains. It does not touch the counterfactual fields, and a test
        pins that.
        """
        model = cls(smoothing=smoothing)
        for episode in episodes:
            model._observe(episode.context, episode.action, episode.is_recovered)
        model._fitted = True
        return model

    def _observe(
        self, context: dict[str, Any], action: EvaluatedAction, recovered: bool
    ) -> None:
        cause = observed_cause(context)
        payday = bool(context.get("is_salary_cycle_pre_payday", False))
        outcome = 1.0 if recovered else 0.0

        for counts in (
            self._global,
            self._by_action[action],
            self._by_action_cause[(action, cause)],
            self._by_action_cause_payday[(action, cause, payday)],
        ):
            counts.successes += outcome
            counts.trials += 1.0

    # -- prediction --------------------------------------------------------

    def _shrink(self, counts: _Counts, parent: float) -> float:
        return (counts.successes + self.smoothing * parent) / (counts.trials + self.smoothing)

    def cell_for(self, context: dict[str, Any], action: EvaluatedAction) -> Cell:
        """The estimate for one (context, action), and the evidence behind it."""
        if not self._fitted:
            raise RuntimeError("model has not been fitted")

        cause = observed_cause(context)
        payday = bool(context.get("is_salary_cycle_pre_payday", False))

        # Coarse to fine, each level shrunk toward the one above it.
        p_global = (
            self._global.successes / self._global.trials if self._global.trials else 0.0
        )
        p_action = self._shrink(self._by_action[action], p_global)
        p_cause = self._shrink(self._by_action_cause[(action, cause)], p_action)

        leaf = self._by_action_cause_payday[(action, cause, payday)]
        return Cell(
            probability=self._shrink(leaf, p_cause),
            successes=leaf.successes,
            trials=leaf.trials,
            parent_probability=p_cause,
        )

    def predict(self, context: dict[str, Any], action: EvaluatedAction) -> float:
        """P(recovery | context, action)."""
        if action is EvaluatedAction.NO_ACTION:
            # Doing nothing has a real, non-zero recovery rate -- orders
            # resolve on their own. The model estimates it from data like any
            # other action rather than assuming zero, because assuming zero is
            # what makes every other action look better than it is.
            return self.cell_for(context, action).probability

        if is_permanent(observed_cause(context)):
            # A dead mandate terminates the order: nothing collects on it, on
            # any rail, at any delay. Structural, not learned -- a training
            # set with few examples must not be able to talk the model into
            # retrying one.
            #
            # Note what is deliberately *not* here: an expired instrument.
            # That looks permanent and is not, and treating it as such cost
            # every policy the 72% of those failures a rail switch recovers.
            return 0.0

        return self.cell_for(context, action).probability

    # -- inspection --------------------------------------------------------

    def summary(self) -> list[dict[str, Any]]:
        """Every fitted leaf cell, for printing into a report.

        A model an operator cannot interrogate is one they cannot overrule.
        """
        def order(
            item: tuple[tuple[EvaluatedAction, ObservedCause, bool], _Counts],
        ) -> tuple[str, str, bool]:
            (action, cause, payday), _ = item
            return (action.value, cause.value, payday)

        rows: list[dict[str, Any]] = []
        for (action, cause, payday), counts in sorted(
            self._by_action_cause_payday.items(), key=order
        ):
            if counts.trials == 0:
                continue
            context = {
                "provider_error_code": _representative_code(cause),
                "is_salary_cycle_pre_payday": payday,
            }
            cell = self.cell_for(context, action)
            rows.append(
                {
                    "action": action.value,
                    "observed_cause": cause.value,
                    "pre_payday": payday,
                    "trials": int(counts.trials),
                    "observed_rate": round(counts.successes / counts.trials, 4),
                    "fitted_probability": round(cell.probability, 4),
                }
            )
        return rows


def _representative_code(cause: ObservedCause) -> str:
    """A gateway code that maps to this cause, for rebuilding a context."""
    return {
        ObservedCause.INSUFFICIENT_FUNDS: "SIM_INSUFFICIENT_FUNDS",
        ObservedCause.ISSUER_TROUBLE: "SIM_ISSUER_UNAVAILABLE",
        ObservedCause.DECLINED: "SIM_DECLINED_BY_ISSUER",
        ObservedCause.INSTRUMENT_DEAD: "SIM_INSTRUMENT_EXPIRED",
        ObservedCause.MANDATE_DEAD: "SIM_MANDATE_EXPIRED",
        ObservedCause.UNKNOWN: "SIM_PAYMENT_FAILED",
    }[cause]
