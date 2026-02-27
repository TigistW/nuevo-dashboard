from __future__ import annotations

from ..repositories import StorageRepository


def log_workflow_step(
    repo: StorageRepository,
    *,
    step: str,
    phase: str,
    message: str,
    details: str | None = None,
    level: str = "INFO",
) -> None:
    normalized_step = (step or "unknown").strip().lower()
    normalized_phase = (phase or "event").strip().lower()
    repo.add_log(
        "Workflow",
        level,
        f"[{normalized_step}:{normalized_phase}] {message}",
        details,
    )
