from __future__ import annotations

import re
import threading
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any
from uuid import uuid4

from ..config import settings
from ..database import SessionLocal
from ..models import NotebookWorkerSessionStatus, NotebookWorkerStatus
from ..repositories import StorageRepository
from .utils import isoformat_or_none

try:
    from playwright.sync_api import sync_playwright

    PLAYWRIGHT_AVAILABLE = True
except Exception:  # pragma: no cover - exercised in environments without Playwright
    sync_playwright = None  # type: ignore[assignment]
    PLAYWRIGHT_AVAILABLE = False


CAPTCHA_MARKERS = (
    "captcha",
    "recaptcha",
    "i'm not a robot",
    "prove you are human",
)
DISCONNECT_MARKERS = (
    "runtime disconnected",
    "session crashed",
    "reconnect",
    "connect to a runtime",
    "disconnected",
)
WARNING_MARKERS = (
    "runtime limit",
    "usage limit",
    "too many sessions",
    "temporarily unavailable",
    "unable to connect",
)
RECONNECT_BUTTONS = ("Reconnect", "Connect", "Try again", "Continue", "Run anyway")


@dataclass
class _ManagedNotebook:
    notebook_id: str
    vm_id: str
    account_email: str | None
    notebook_url: str
    entry_url: str
    state: str = "idle"
    current_url: str | None = None
    last_probe_at: datetime | None = None
    message: str | None = None
    recovery_attempts: int = 0
    context: Any = None
    page: Any = None


class ColabPlaywrightWorker:
    def __init__(self) -> None:
        self._enabled = bool(settings.colab_worker_enabled)
        self._poll_seconds = max(2, int(settings.colab_worker_poll_seconds))
        self._headless = bool(settings.colab_worker_headless)
        self._nav_timeout_ms = max(1000, int(settings.colab_worker_nav_timeout_ms))
        self._action_timeout_ms = max(500, int(settings.colab_worker_action_timeout_ms))
        self._browser_channel = (settings.colab_worker_browser_channel or "").strip()
        self._auto_create_sessions = bool(settings.colab_worker_auto_create_sessions)
        self._entry_url = (settings.colab_worker_entry_url or "").strip()
        self._storage_state_dir = self._resolve_storage_dir(settings.colab_worker_storage_state_dir)

        self._lock = threading.Lock()
        self._probe_lock = threading.Lock()
        self._stop_event = threading.Event()
        self._thread: threading.Thread | None = None
        self._running = False
        self._last_tick_at: datetime | None = None
        self._last_error: str | None = None

        self._sessions: dict[str, _ManagedNotebook] = {}
        self._playwright: Any = None
        self._browser: Any = None

    def status(self) -> NotebookWorkerStatus:
        with self._lock:
            return self._status_locked()

    def start(self) -> NotebookWorkerStatus:
        with self._lock:
            if self._running:
                return self._status_locked()
            self._last_error = None
            if not self._enabled:
                self._last_error = "COLAB_WORKER_ENABLED=false. Worker start skipped by configuration."
                return self._status_locked()
            if not PLAYWRIGHT_AVAILABLE:
                self._last_error = (
                    "Playwright is unavailable. Install with "
                    "'pip install playwright' and run 'playwright install chromium'."
                )
                return self._status_locked()

            self._stop_event.clear()
            self._thread = threading.Thread(target=self._loop, daemon=True, name="colab-playwright-worker")
            self._running = True
            self._thread.start()
            return self._status_locked()

    def stop(self) -> NotebookWorkerStatus:
        thread: threading.Thread | None = None
        with self._lock:
            self._stop_event.set()
            thread = self._thread

        if thread is not None and thread.is_alive() and thread is not threading.current_thread():
            thread.join(timeout=5.0)

        self._teardown_browser()
        with self._lock:
            self._running = False
            self._thread = None
            return self._status_locked()

    def probe_once(self) -> NotebookWorkerStatus:
        self._run_tick()
        return self.status()

    def _loop(self) -> None:
        while not self._stop_event.is_set():
            self._run_tick()
            self._stop_event.wait(self._poll_seconds)
        self._teardown_browser()
        with self._lock:
            self._running = False
            self._thread = None

    def _run_tick(self) -> None:
        if not self._probe_lock.acquire(blocking=False):
            return
        try:
            probe_at = datetime.utcnow()
            with self._lock:
                self._last_tick_at = probe_at

            if not self._enabled:
                self._mark_probe_unavailable("Worker disabled by configuration.", probe_at)
                return
            if not PLAYWRIGHT_AVAILABLE:
                db = SessionLocal()
                repo = StorageRepository(db)
                try:
                    if self._auto_create_sessions:
                        self._auto_create_missing_sessions(repo)
                finally:
                    db.close()
                self._mark_probe_unavailable(
                    "Playwright unavailable; install dependency to enable real notebook probing.",
                    probe_at,
                )
                return

            db = SessionLocal()
            repo = StorageRepository(db)
            try:
                if self._auto_create_sessions:
                    self._auto_create_missing_sessions(repo)
                rows = repo.list_notebook_sessions()
                active_ids = {row.id for row in rows}
                self._drop_stale_sessions(active_ids)

                for row in rows:
                    managed = self._ensure_managed(row)
                    state, message = self._probe_notebook(managed)
                    self._persist_probe(repo, row, managed, state, message, probe_at)
            finally:
                db.close()

            with self._lock:
                self._last_error = None
        except Exception as exc:  # pragma: no cover - defensive guard
            with self._lock:
                self._last_error = str(exc)
        finally:
            self._probe_lock.release()

    def _persist_probe(
        self,
        repo: StorageRepository,
        row: Any,
        managed: _ManagedNotebook,
        state: str,
        message: str,
        probe_at: datetime,
    ) -> None:
        updates: dict[str, Any] = {
            "last_probe_at": probe_at,
            "last_probe_message": message,
            "notebook_url": managed.notebook_url,
        }

        risk_delta = 0
        warning_message: str | None = None
        status_value = "Active"

        if state == "active":
            status_value = "Active"
        elif state == "recovering":
            status_value = "Recovering"
            warning_message = message
            risk_delta = 1 if row.status != "Recovering" else 0
        elif state == "disconnected":
            status_value = "Disconnected"
            warning_message = message
            risk_delta = 1 if row.status != "Disconnected" else 0
        elif state == "warning":
            status_value = "Warning"
            warning_message = message
            risk_delta = 1 if row.status != "Warning" else 0
        elif state == "captcha":
            status_value = "Warning"
            warning_message = message
            risk_delta = 3 if "captcha" not in (row.last_probe_message or "").lower() else 0
            if risk_delta > 0:
                repo.create_captcha_event(
                    provider="colab-dom",
                    status="detected",
                    source=f"notebook-worker:{row.id}",
                    vm_id=row.vm_id,
                    score=None,
                    latency_ms=0,
                    details=message,
                )
        elif state == "login_required":
            status_value = "Warning"
            warning_message = message
            risk_delta = 5 if "login" not in (row.last_probe_message or "").lower() else 0
        else:
            status_value = "Warning"
            warning_message = message

        updates["status"] = status_value
        updates["warning_message"] = warning_message

        if status_value != "Active":
            reduced_load = max(30, int(row.load_percent or 0) - 15)
            updates["load_percent"] = reduced_load
            updates["gpu_usage_gb"] = round((float(row.gpu_assigned_gb) * reduced_load) / 100.0, 2)
            updates["ram_usage_gb"] = round(updates["gpu_usage_gb"] * 0.65, 2)

        repo.update_notebook_session(row, **updates)
        if risk_delta > 0:
            repo.apply_vm_risk_event(row.vm_id, risk_delta, reason=f"Notebook worker detected state '{state}'.")
        if state in {"disconnected", "warning", "captcha", "login_required"}:
            repo.add_log("Notebook", "WARNING", f"Notebook '{row.id}' state '{state}'.", message)

    def _probe_notebook(self, managed: _ManagedNotebook) -> tuple[str, str]:
        try:
            self._ensure_page(managed)
            page = managed.page
            if page is None:
                raise RuntimeError("Page handle is not initialized.")

            try:
                page.wait_for_load_state("domcontentloaded", timeout=self._action_timeout_ms)
            except Exception:
                pass

            current_url = str(page.url or managed.notebook_url or "")
            managed.current_url = current_url or None
            if current_url and self._is_colab_notebook_url(current_url):
                managed.notebook_url = current_url
            body_text = self._extract_body_text(page)
            state, message = self._evaluate_state(page=page, current_url=current_url, body_text=body_text)
            managed.state = state
            managed.message = message
            managed.last_probe_at = datetime.utcnow()

            self._persist_storage_state(managed)
            return state, message
        except Exception as exc:
            managed.state = "error"
            managed.message = f"Probe failure: {exc}"
            managed.last_probe_at = datetime.utcnow()
            self._reset_managed_runtime(managed)
            return "error", managed.message

    def _evaluate_state(self, page: Any, current_url: str, body_text: str) -> tuple[str, str]:
        url_l = current_url.lower()
        text_l = body_text.lower()

        if "accounts.google.com" in url_l:
            return "login_required", "Google login/reauthentication required for Colab session."

        if any(marker in url_l for marker in ("captcha", "recaptcha")) or any(
            marker in text_l for marker in CAPTCHA_MARKERS
        ):
            return "captcha", "CAPTCHA detected in notebook session."

        if any(marker in text_l for marker in DISCONNECT_MARKERS):
            if self._attempt_recovery(page):
                return "recovering", "Reconnect action executed after disconnect signal."
            return "disconnected", "Notebook appears disconnected and recovery action did not complete."

        if any(marker in text_l for marker in WARNING_MARKERS):
            return "warning", "Notebook warning signals detected."

        return "active", "Notebook session appears active."

    def _attempt_recovery(self, page: Any) -> bool:
        for label in RECONNECT_BUTTONS:
            try:
                locator = page.get_by_role("button", name=re.compile(label, re.IGNORECASE))
                if locator.count() > 0:
                    locator.first.click(timeout=self._action_timeout_ms)
                    page.wait_for_timeout(350)
                    return True
            except Exception:
                continue

        selectors = (
            "button:has-text('Reconnect')",
            "button:has-text('Connect')",
            "paper-button:has-text('Reconnect')",
            "paper-button:has-text('Connect')",
            "colab-connect-button button",
        )
        for selector in selectors:
            try:
                locator = page.locator(selector)
                if locator.count() > 0:
                    locator.first.click(timeout=self._action_timeout_ms)
                    page.wait_for_timeout(350)
                    return True
            except Exception:
                continue
        return False

    def _ensure_page(self, managed: _ManagedNotebook) -> None:
        self._ensure_browser()

        if managed.context is None:
            state_path = self._storage_state_path(managed.notebook_id)
            kwargs: dict[str, Any] = {}
            if state_path.exists():
                kwargs["storage_state"] = state_path.as_posix()
            managed.context = self._browser.new_context(**kwargs)

        if managed.page is None or managed.page.is_closed():
            managed.page = managed.context.new_page()

        desired_url = (managed.notebook_url or "").strip() or (managed.entry_url or "").strip()
        if not desired_url:
            raise ValueError("Missing notebook URL for managed session.")

        current_url = str(managed.page.url or "").strip()
        needs_navigation = not current_url or current_url == "about:blank"
        if needs_navigation:
            managed.page.goto(desired_url, wait_until="domcontentloaded", timeout=self._nav_timeout_ms)

    def _extract_body_text(self, page: Any) -> str:
        try:
            return str(page.locator("body").inner_text(timeout=self._action_timeout_ms))
        except Exception:
            try:
                return str(page.content())
            except Exception:
                return ""

    def _ensure_browser(self) -> None:
        if self._browser is not None:
            return
        if sync_playwright is None:
            raise RuntimeError("Playwright sync API is not available.")
        self._playwright = sync_playwright().start()
        launch_kwargs: dict[str, Any] = {"headless": self._headless}
        if self._browser_channel:
            launch_kwargs["channel"] = self._browser_channel
        self._browser = self._playwright.chromium.launch(**launch_kwargs)

    def _persist_storage_state(self, managed: _ManagedNotebook) -> None:
        if managed.context is None:
            return
        try:
            state_path = self._storage_state_path(managed.notebook_id)
            state_path.parent.mkdir(parents=True, exist_ok=True)
            managed.context.storage_state(path=state_path.as_posix())
        except Exception:
            return

    def _drop_stale_sessions(self, active_ids: set[str]) -> None:
        with self._lock:
            stale_ids = [notebook_id for notebook_id in self._sessions if notebook_id not in active_ids]
            for notebook_id in stale_ids:
                managed = self._sessions.pop(notebook_id, None)
                if managed is not None:
                    self._close_managed(managed)

    def _ensure_managed(self, row: Any) -> _ManagedNotebook:
        with self._lock:
            managed = self._sessions.get(row.id)
            if managed is None:
                managed = _ManagedNotebook(
                    notebook_id=row.id,
                    vm_id=row.vm_id,
                    account_email=row.account_email,
                    notebook_url=(row.notebook_url or "").strip(),
                    entry_url=self._entry_url,
                )
                self._sessions[row.id] = managed
                return managed
            managed.vm_id = row.vm_id
            managed.account_email = row.account_email
            notebook_url = (row.notebook_url or "").strip()
            if notebook_url and notebook_url != managed.notebook_url:
                managed.notebook_url = notebook_url
                self._reset_managed_runtime(managed)
            return managed

    def _auto_create_missing_sessions(self, repo: StorageRepository) -> None:
        if not self._entry_url:
            return
        running_vms = [vm for vm in repo.list_vms() if str(vm.status or "").lower() == "running"]
        now = datetime.utcnow()
        for vm in running_vms:
            existing = repo.list_notebook_sessions(vm_id=vm.id)
            if existing:
                continue
            account = repo.find_assigned_account_by_vm(vm.id)
            notebook_id = f"nb-auto-{vm.id}-{uuid4().hex[:8]}"
            repo.create_notebook_session(
                notebook_id=notebook_id,
                vm_id=vm.id,
                account_email=account.email if account is not None else None,
                notebook_url=None,
                status="Pending",
                gpu_assigned_gb=12.0,
                gpu_usage_gb=0.0,
                ram_usage_gb=0.0,
                load_percent=0,
                cycle_state="active",
                next_transition_at=now,
                session_expires_at=now + timedelta(hours=8),
                warning_message="Auto-created notebook session; waiting for worker open.",
                last_probe_at=None,
                last_probe_message=None,
                restart_count=0,
                risk_score=0,
            )
            repo.add_log(
                "Notebook",
                "INFO",
                f"Auto-created notebook session for VM '{vm.id}'.",
                "Worker bootstrap auto-create.",
            )

    def _mark_probe_unavailable(self, message: str, probe_at: datetime) -> None:
        db = SessionLocal()
        repo = StorageRepository(db)
        try:
            rows = repo.list_notebook_sessions()
            for row in rows:
                repo.update_notebook_session(
                    row,
                    last_probe_at=probe_at,
                    last_probe_message=message,
                    warning_message=message,
                    status="Warning",
                )
        finally:
            db.close()

        with self._lock:
            self._last_error = message

    @staticmethod
    def _is_colab_notebook_url(url: str) -> bool:
        candidate = (url or "").strip().lower()
        return "colab.research.google.com" in candidate and any(
            marker in candidate for marker in ("/drive/", "/notebook/", "/github/")
        )

    def _reset_managed_runtime(self, managed: _ManagedNotebook) -> None:
        self._close_managed(managed)
        managed.context = None
        managed.page = None

    def _close_managed(self, managed: _ManagedNotebook) -> None:
        if managed.page is not None:
            try:
                managed.page.close()
            except Exception:
                pass
        if managed.context is not None:
            try:
                managed.context.close()
            except Exception:
                pass
        managed.page = None
        managed.context = None

    def _teardown_browser(self) -> None:
        with self._lock:
            sessions = list(self._sessions.values())
            self._sessions.clear()
        for managed in sessions:
            self._close_managed(managed)

        browser = self._browser
        playwright_instance = self._playwright
        self._browser = None
        self._playwright = None

        if browser is not None:
            try:
                browser.close()
            except Exception:
                pass
        if playwright_instance is not None:
            try:
                playwright_instance.stop()
            except Exception:
                pass

    def _status_locked(self) -> NotebookWorkerStatus:
        sessions = [
            NotebookWorkerSessionStatus(
                notebook_id=managed.notebook_id,
                vm_id=managed.vm_id,
                account_email=managed.account_email,
                notebook_url=managed.notebook_url,
                current_url=managed.current_url,
                state=managed.state,
                last_probe_at=isoformat_or_none(managed.last_probe_at),
                message=managed.message,
                recovery_attempts=int(managed.recovery_attempts),
            )
            for managed in sorted(self._sessions.values(), key=lambda item: item.notebook_id)
        ]
        return NotebookWorkerStatus(
            enabled=self._enabled,
            running=self._running,
            playwright_available=PLAYWRIGHT_AVAILABLE,
            poll_seconds=self._poll_seconds,
            managed_sessions=len(sessions),
            last_tick_at=isoformat_or_none(self._last_tick_at),
            last_error=self._last_error,
            sessions=sessions,
        )

    def _storage_state_path(self, notebook_id: str) -> Path:
        safe_id = re.sub(r"[^a-zA-Z0-9_.-]", "_", notebook_id)
        return self._storage_state_dir / f"{safe_id}.json"

    @staticmethod
    def _resolve_storage_dir(value: str) -> Path:
        raw = (value or "./backend/.state/colab").strip()
        path = Path(raw).expanduser()
        if path.is_absolute():
            return path
        repo_root = Path(__file__).resolve().parents[2]
        return (repo_root / path).resolve()


_WORKER_LOCK = threading.Lock()
_WORKER_INSTANCE: ColabPlaywrightWorker | None = None


def get_colab_worker() -> ColabPlaywrightWorker:
    global _WORKER_INSTANCE
    with _WORKER_LOCK:
        if _WORKER_INSTANCE is None:
            _WORKER_INSTANCE = ColabPlaywrightWorker()
        return _WORKER_INSTANCE


def start_colab_worker_daemon() -> None:
    if not settings.colab_worker_auto_start:
        return
    get_colab_worker().start()


def stop_colab_worker_daemon() -> None:
    get_colab_worker().stop()
