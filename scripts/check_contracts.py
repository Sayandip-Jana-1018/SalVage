"""Contract drift gate for ADR-0002.

ADR-0002 makes `contracts/` the single source of truth. That is only true if
something mechanical enforces it. Three checks run here; a fourth lives in the
Java test suite.

1. Every event schema is a structurally valid JSON Schema 2020-12 document.
2. Every OpenAPI document is a structurally valid OpenAPI 3.1 document.
3. The OpenAPI that salvage-brain actually serves covers every path,
   operation, and response status the committed contract promises. A route
   renamed in code without updating the contract fails here.

4. (in salvage-core) `PaymentFailedEventContractTest` asserts the Java record's
   fields are exactly the schema's properties, and `EventContractValidator`
   validates every inbound payload against the schema at runtime.

Exit code is non-zero on any mismatch.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

import yaml
from jsonschema.validators import validator_for
from openapi_spec_validator import validate as validate_openapi

REPO_ROOT = Path(__file__).resolve().parents[1]
EVENTS_DIR = REPO_ROOT / "contracts" / "events"
OPENAPI_DIR = REPO_ROOT / "contracts" / "openapi"

failures: list[str] = []


def ok(message: str) -> None:
    print(f"  \033[32mok\033[0m   {message}")


def bad(message: str) -> None:
    print(f"  \033[31mFAIL\033[0m {message}")
    failures.append(message)


def check_event_schemas() -> None:
    print("\nEvent schemas")
    schemas = sorted(EVENTS_DIR.glob("*.schema.json"))
    if not schemas:
        bad(f"no event schemas found in {EVENTS_DIR}")
        return
    for path in schemas:
        rel = path.relative_to(REPO_ROOT)
        try:
            document = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            bad(f"{rel} is not valid JSON: {exc}")
            continue

        validator_cls = validator_for(document)
        try:
            validator_cls.check_schema(document)
        except Exception as exc:
            bad(f"{rel} is not a valid schema: {exc}")
            continue

        # additionalProperties:false is what makes an unknown field a contract
        # violation rather than something silently dropped on the floor.
        if document.get("additionalProperties") is not False:
            bad(f"{rel} does not set additionalProperties:false")
            continue
        ok(f"{rel} ({len(document.get('properties', {}))} properties)")


def check_openapi_documents() -> dict[Path, dict[str, Any]]:
    print("\nOpenAPI documents")
    loaded: dict[Path, dict[str, Any]] = {}
    for path in sorted(OPENAPI_DIR.glob("*.yaml")):
        rel = path.relative_to(REPO_ROOT)
        document = yaml.safe_load(path.read_text(encoding="utf-8"))
        try:
            validate_openapi(document)
        except Exception as exc:
            bad(f"{rel} is not a valid OpenAPI document: {exc}")
            continue
        loaded[path] = document
        ok(f"{rel} ({len(document.get('paths', {}))} paths)")
    return loaded


def check_brain_matches_its_contract(document: dict[str, Any]) -> None:
    print("\nsalvage-brain implementation vs contract")
    try:
        sys.path.insert(0, str(REPO_ROOT / "services" / "salvage-brain" / "src"))
        from salvage_brain.main import create_app
    except ImportError as exc:
        bad(f"cannot import salvage-brain to compare its OpenAPI: {exc}")
        return

    served = create_app().openapi()

    for path, operations in document.get("paths", {}).items():
        served_path = served.get("paths", {}).get(path)
        if served_path is None:
            bad(f"contract declares {path} but the service does not serve it")
            continue
        for method, spec in operations.items():
            served_op = served_path.get(method)
            if served_op is None:
                bad(f"contract declares {method.upper()} {path}, not served")
                continue
            promised = set(spec.get("responses", {}))
            actual = set(served_op.get("responses", {}))
            missing = promised - actual
            if missing:
                bad(
                    f"{method.upper()} {path} promises status "
                    f"{sorted(missing)} which the service does not declare"
                )
                continue
            ok(f"{method.upper()} {path} -> {sorted(promised)}")


def main() -> int:
    check_event_schemas()
    documents = check_openapi_documents()

    brain_contract = OPENAPI_DIR / "brain.v1.yaml"
    if brain_contract in documents:
        check_brain_matches_its_contract(documents[brain_contract])

    print()
    if failures:
        print(f"\033[31m{len(failures)} contract check(s) failed.\033[0m")
        return 1
    print("\033[32mAll contract checks passed.\033[0m")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
