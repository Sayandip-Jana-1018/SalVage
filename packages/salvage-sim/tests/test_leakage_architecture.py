"""The label generator must have no import path to the feature generator.

This is the structural half of the no-leakage guarantee. It reads the import
graph rather than the behaviour, so it catches the mistake before it has any
consequence: somebody adds ``from salvage_sim.generate.events import
EventEmitter`` to a label module to "just read the error code", and the test
fails on the import, not three phases later when a model scores suspiciously
well and nobody can say why.

It is a **whitelist**, not a blacklist. Asserting that ``labels`` does not
import ``generate`` would pass happily the day someone adds a
``salvage_sim.features`` package and imports that instead. Asserting that
``labels`` imports nothing outside a named set fails on anything new, which is
the correct default for a property this load-bearing.

The transitive closure matters as much as the direct imports. A direct import
of ``generate`` is obvious in review; a direct import of a helper module that
itself imports ``generate`` is not, and has exactly the same effect.
"""

from __future__ import annotations

import ast
import pathlib

import pytest

import salvage_sim

PACKAGE = "salvage_sim"

# What the labels package is permitted to reach, transitively. Every entry is
# either latent ground truth or infrastructure that carries no observation.
LABEL_IMPORT_WHITELIST = frozenset(
    {
        "salvage_sim",
        "salvage_sim.calibration",
        "salvage_sim.clock",
        "salvage_sim.rng",
    }
)
LABEL_WHITELIST_PREFIXES = ("salvage_sim.latent", "salvage_sim.labels")


def package_root() -> pathlib.Path:
    root = pathlib.Path(salvage_sim.__file__).parent
    assert root.is_dir(), root
    return root


def module_name_for(path: pathlib.Path, root: pathlib.Path) -> str:
    relative = path.relative_to(root).with_suffix("")
    parts = list(relative.parts)
    if parts[-1] == "__init__":
        parts.pop()
    return ".".join([PACKAGE, *parts])


def imports_of(path: pathlib.Path, module_name: str) -> set[str]:
    """First-party modules imported by one file.

    Relative imports are resolved against the importing module, so a future
    ``from ..latent import world`` is followed rather than silently ignored --
    an unresolved relative import would be a hole straight through this test.
    """
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
                # level 1 is the containing package, level 2 its parent, and
                # so on. A module's own name contributes one part that is not
                # a package, hence the extra step.
                anchor = base_parts[: len(base_parts) - node.level]
                target = ".".join([*anchor, node.module] if node.module else anchor)
            else:
                target = node.module or ""
            if target.startswith(PACKAGE):
                found.add(target)
                # `from salvage_sim.latent import world` imports a submodule
                # whose name never appears as the ImportFrom module. Recording
                # both keeps the closure complete.
                found.update(f"{target}.{alias.name}" for alias in node.names)

    return found


def build_graph() -> dict[str, set[str]]:
    root = package_root()
    graph: dict[str, set[str]] = {}
    for path in sorted(root.rglob("*.py")):
        name = module_name_for(path, root)
        graph[name] = imports_of(path, name)
    return graph


def closure(graph: dict[str, set[str]], start: set[str]) -> set[str]:
    """Every first-party module reachable from ``start``.

    Names that are not modules -- a class or function imported with
    ``from x import Y`` -- simply have no entry in the graph and contribute
    nothing further, which is correct: the module they came from is already in
    the closure.
    """
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


def test_graph_is_not_empty(graph: dict[str, set[str]]) -> None:
    """Guard against the whole test passing because it found no files.

    Every assertion below is over a set. If the walk silently produced
    nothing, all of them would pass and the guarantee would be unenforced.
    """
    assert len(graph) >= 10, f"expected the package to have modules, found {sorted(graph)}"
    assert "salvage_sim.labels.counterfactual" in graph
    assert "salvage_sim.generate.events" in graph


def test_labels_import_only_latent_and_infrastructure(graph: dict[str, set[str]]) -> None:
    label_modules = {name for name in graph if name.startswith("salvage_sim.labels")}
    assert label_modules, "no label modules found; the whitelist below would be vacuous"

    reachable = closure(graph, label_modules)
    violations = sorted(
        name
        for name in reachable
        # Only actual modules. `from salvage_sim.calibration import Calibration`
        # records `salvage_sim.calibration.Calibration` so that the closure
        # follows submodule imports written the same way, but a class is not a
        # module and cannot be a dependency in its own right -- the module it
        # came from is already in the closure and is what gets judged.
        if name in graph
        and name not in LABEL_IMPORT_WHITELIST
        and not name.startswith(LABEL_WHITELIST_PREFIXES)
    )
    assert not violations, (
        "salvage_sim.labels can reach modules outside its whitelist: "
        f"{violations}. Labels must be a function of latent state alone; anything "
        "reachable from the observation layer can contaminate them. If a new module "
        "genuinely belongs on the label side, add it to LABEL_IMPORT_WHITELIST here "
        "and say why in the commit."
    )


def test_labels_cannot_reach_the_observation_layer(graph: dict[str, set[str]]) -> None:
    """The specific violation, asserted directly as well.

    Redundant with the whitelist by construction, and worth having anyway: it
    is the assertion whose failure message says what actually went wrong,
    where the whitelist's says only that something new appeared.
    """
    label_modules = {name for name in graph if name.startswith("salvage_sim.labels")}
    reachable = closure(graph, label_modules)
    leaked = sorted(name for name in reachable if name.startswith("salvage_sim.generate"))
    assert not leaked, (
        f"salvage_sim.labels reaches the observation layer through {leaked}. "
        "Labels would then be a function of the features, and any model trained "
        "on this data would be evaluated against its own inputs."
    )


def test_latent_does_not_depend_on_anything_above_it(graph: dict[str, set[str]]) -> None:
    """Ground truth must not know about observation or labelling.

    The direction of the dependency is the whole design. If ``latent`` reached
    up into ``generate``, then the world would depend on how it is reported,
    and the counterfactuals -- which re-run the world -- would inherit that.
    """
    latent_modules = {name for name in graph if name.startswith("salvage_sim.latent")}
    assert latent_modules
    reachable = closure(graph, latent_modules)
    leaked = sorted(
        name
        for name in reachable
        if name.startswith(("salvage_sim.generate", "salvage_sim.labels"))
    )
    assert not leaked, f"salvage_sim.latent depends upward on {leaked}"


def test_the_whitelist_is_not_vacuous(graph: dict[str, set[str]]) -> None:
    """The labels really do read latent state.

    Without this, a typo in the package name would make every test above pass
    over an empty closure. A whitelist that permits everything and a whitelist
    that is never exercised fail in the same silent way.
    """
    reachable = closure(graph, {"salvage_sim.labels.counterfactual"})
    latent = {name for name in reachable if name.startswith("salvage_sim.latent")}
    assert len(latent) >= 3, (
        f"labels reach only {sorted(latent)} of the latent package; either the "
        "import walk is broken or the labels are no longer reading ground truth"
    )


def test_the_observation_layer_does_read_latent(graph: dict[str, set[str]]) -> None:
    """Sanity check in the permitted direction.

    ``generate`` is supposed to depend on ``latent``. If that edge vanished,
    the graph walk would be finding nothing and the tests above would be
    passing for the wrong reason.
    """
    reachable = closure(graph, {"salvage_sim.generate.events"})
    assert any(name.startswith("salvage_sim.latent") for name in reachable)
