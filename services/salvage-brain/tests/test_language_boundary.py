"""Principle 4, enforced by the import graph rather than by a docstring.

"No LLM makes a money decision" is the kind of claim every project makes and
few can check. Here it is checkable, because the language layer is a leaf: the
decision path -- taxonomy, features, sensing, diagnosis, policy -- must have no
import path to ``salvage_brain.language``, direct or transitive.

The transitive part is what makes this worth writing. A direct
``from salvage_brain.language.triage import ...`` inside the policy engine
would be caught in review. A helper module imported by the policy engine that
itself imports the language layer would not, and has exactly the same effect:
a sampled token stream inside a decision that has to replay bit-identically.

Modelled on ``packages/salvage-sim/tests/test_leakage_architecture.py``, which
enforces the simulator's no-leakage property the same way.
"""

from __future__ import annotations

import ast
import pathlib

import pytest
from fastapi.testclient import TestClient

import salvage_brain
from salvage_brain.config import settings
from salvage_brain.main import create_app

PACKAGE = "salvage_brain"
LANGUAGE = "salvage_brain.language"

# Everything that participates in producing a recovery decision. None of it may
# reach the language layer.
DECISION_PATH_PREFIXES = (
    "salvage_brain.taxonomy",
    "salvage_brain.features",
    "salvage_brain.sensing",
    "salvage_brain.diagnosis",
    "salvage_brain.policy",
)


def package_root() -> pathlib.Path:
    root = pathlib.Path(salvage_brain.__file__).parent
    assert root.is_dir(), root
    return root


def module_name_for(path: pathlib.Path, root: pathlib.Path) -> str:
    relative = path.relative_to(root).with_suffix("")
    parts = list(relative.parts)
    if parts[-1] == "__init__":
        parts.pop()
    return ".".join([PACKAGE, *parts])


def imports_of(path: pathlib.Path, module_name: str) -> set[str]:
    """First-party modules imported by one file, relative imports resolved."""
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    found: set[str] = set()

    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                if alias.name.startswith(PACKAGE):
                    found.add(alias.name)
        elif isinstance(node, ast.ImportFrom):
            if node.level:
                base_parts = module_name.split(".")
                anchor = base_parts[: len(base_parts) - node.level]
                target = ".".join([*anchor, node.module] if node.module else anchor)
            else:
                target = node.module or ""
            if target.startswith(PACKAGE):
                found.add(target)
                # `from salvage_brain.language import triage` names a submodule
                # that never appears as the ImportFrom module on its own.
                found.update(f"{target}.{alias.name}" for alias in node.names)

    return found


def build_graph() -> dict[str, set[str]]:
    root = package_root()
    return {
        module_name_for(path, root): imports_of(path, module_name_for(path, root))
        for path in sorted(root.rglob("*.py"))
    }


def closure(graph: dict[str, set[str]], start: set[str]) -> set[str]:
    seen: set[str] = set()
    queue = list(start)
    while queue:
        current = queue.pop()
        if current in seen:
            continue
        seen.add(current)
        queue.extend(graph.get(current, set()))
    return seen


@pytest.fixture(scope="module")
def graph() -> dict[str, set[str]]:
    return build_graph()


def test_graph_is_not_vacuous(graph: dict[str, set[str]]) -> None:
    """A walk that found nothing would pass every assertion below."""
    assert len(graph) >= 15, f"expected the package to have modules, found {sorted(graph)}"
    assert "salvage_brain.policy.engine" in graph
    assert "salvage_brain.language.triage" in graph


def test_the_decision_path_cannot_reach_the_language_layer(graph: dict[str, set[str]]) -> None:
    decision_modules = {name for name in graph if name.startswith(DECISION_PATH_PREFIXES)}
    assert decision_modules, "no decision-path modules found; this test would be vacuous"

    reachable = closure(graph, decision_modules)
    leaked = sorted(name for name in reachable if name.startswith(LANGUAGE))
    assert not leaked, (
        f"the decision path reaches the language layer through {leaked}. "
        "A recovery decision must replay bit-identically from the same inputs, and a "
        "hosted model cannot promise that. If language output is genuinely needed here, "
        "it belongs behind a value the deterministic path computed, not inside it."
    )


def test_the_language_layer_is_a_leaf_of_the_decision_path(graph: dict[str, set[str]]) -> None:
    """The dependency runs one way: language reads the decision path, never the reverse.

    Redundant with the test above by construction, and kept because its failure
    message names the direction that broke.
    """
    importers = sorted(
        name
        for name, imports in graph.items()
        if not name.startswith(LANGUAGE)
        and not name.startswith("salvage_brain.main")
        and any(target.startswith(LANGUAGE) for target in imports)
    )
    assert not importers, (
        f"{importers} import the language layer. Only the application factory should, "
        "and only to mount its routes."
    )


def test_language_routes_refuse_when_the_flag_is_off() -> None:
    """Off by default means off: the routes answer 503, having called nothing.

    The flag defaults to false and the suite never sets it, so this is the
    behaviour a fresh clone gets. A key sitting in `.env` does not switch it on.
    """
    assert settings.language_enabled is False
    client = TestClient(create_app())

    for path, body in (
        ("/v1/language/triage", {"provider_error_code": "XX99"}),
        (
            "/v1/language/nudge-copy",
            {
                "merchant_display_name": "Demo Merchant",
                "amount_paise": 185000,
                "language": "hi",
                "channel": "SMS",
                "taxonomy_code": "INSUFFICIENT_FUNDS",
            },
        ),
        ("/v1/language/narrate", {"merchant_id": "merch_demo", "payment_attempt_id": "pay_1"}),
    ):
        response = client.post(path, json=body)
        assert response.status_code == 503, (path, response.text)
        assert "disabled" in response.json()["detail"]


def test_status_reports_disabled_rather_than_failing() -> None:
    """"Switched off" and "broken" are different facts and must look different.

    Also checks that the status carries no key material. It is the one route
    here that answers without a model, so it is the one most likely to be
    scraped by a dashboard, and a configuration endpoint that leaks a
    credential is a familiar way to lose one.
    """
    client = TestClient(create_app())
    response = client.get("/v1/language/status")
    assert response.status_code == 200

    body = response.json()
    assert body["enabled"] is False
    assert body["model"], "an operator should be able to see which model is configured"
    assert "money_path" in body

    serialized = response.text.lower()
    for forbidden in ("api_key", "apikey", "secret", "aiza"):
        assert forbidden not in serialized, f"the status response leaked {forbidden!r}"
