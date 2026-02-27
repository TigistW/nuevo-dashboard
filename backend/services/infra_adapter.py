from __future__ import annotations

import hashlib
import ipaddress
import json
import random
import re
import shutil
import subprocess
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Sequence
from urllib import error as urlerror
from urllib import parse as urlparse
from urllib import request as urlrequest

from ..config import settings
from .utils import estimate_latency_ms, generate_public_ip, short_code


SAFE_TOKEN_PATTERN = re.compile(r"^[A-Za-z0-9_.:-]+$")
ROUTING_TABLE_PATTERN = re.compile(r"\btable\s+(\S+)\b")
ROUTING_DEVICE_PATTERN = re.compile(r"\bdev\s+(\S+)\b")
PUBLIC_IPV4_PATTERN = re.compile(r"\b(?:\d{1,3}\.){3}\d{1,3}\b")
REPO_ROOT = Path(__file__).resolve().parents[2]
IFACE_NAME_MAX_LEN = 15

ALLOWED_COMMANDS = {
    "ansible-playbook",
    "bash",
    "firectl",
    "ip",
    "nft",
    "wg",
    "wg-quick",
}
VALID_MODES = {"mock", "best_effort", "strict"}
VALID_TRANSPORTS = {"shell", "api", "auto"}


@dataclass(frozen=True)
class CommandRun:
    command: list[str]
    simulated: bool
    returncode: int
    stdout: str = ""
    stderr: str = ""
    note: str | None = None

    def summary(self) -> str:
        command_text = " ".join(self.command)
        status_text = "simulated" if self.simulated else f"rc={self.returncode}"
        if self.note:
            return f"{command_text} [{status_text}] {self.note}"
        return f"{command_text} [{status_text}]"


@dataclass(frozen=True)
class VmProvisionResult:
    public_ip: str
    provider: str
    latency_ms: int
    exit_node: str
    command_runs: list[CommandRun] = field(default_factory=list)


@dataclass(frozen=True)
class TunnelRotationResult:
    public_ip: str
    latency_ms: int
    asn: str
    command_runs: list[CommandRun] = field(default_factory=list)


@dataclass(frozen=True)
class SecuritySnapshot:
    namespaces: list[str]
    routing_tables: list[dict[str, str]]
    nftables_status: str
    command_runs: list[CommandRun] = field(default_factory=list)


def summarize_command_runs(command_runs: Sequence[CommandRun]) -> str:
    if not command_runs:
        return ""
    return " | ".join(run.summary() for run in command_runs)


class SafeCommandRunner:
    def __init__(self, mode: str | None = None, timeout_seconds: int | None = None):
        normalized_mode = (mode or settings.infra_execution_mode or "mock").strip().lower()
        self.mode = normalized_mode if normalized_mode in VALID_MODES else "mock"
        self.timeout_seconds = timeout_seconds or settings.infra_command_timeout_sec
        self.workdir = self._resolve_workdir(settings.infra_workdir)

    def run(self, command: Sequence[str], timeout_seconds: int | None = None) -> CommandRun:
        argv = [str(part) for part in command if part is not None]
        if not argv:
            raise ValueError("Command cannot be empty.")

        binary_name = Path(argv[0]).name
        if binary_name not in ALLOWED_COMMANDS:
            raise RuntimeError(f"Command '{binary_name}' is not allowlisted.")

        if self.mode == "mock":
            return CommandRun(command=argv, simulated=True, returncode=0, note="mode=mock")

        if shutil.which(argv[0]) is None and shutil.which(binary_name) is None:
            return self._handle_issue(argv, f"binary '{argv[0]}' not found in PATH")

        try:
            completed = subprocess.run(
                argv,
                capture_output=True,
                text=True,
                cwd=str(self.workdir),
                timeout=timeout_seconds or self.timeout_seconds,
                check=False,
            )
        except Exception as exc:  # noqa: BLE001
            return self._handle_issue(argv, str(exc))

        if completed.returncode != 0:
            reason = completed.stderr.strip() or completed.stdout.strip() or "non-zero exit status"
            return self._handle_issue(argv, reason, returncode=completed.returncode)

        return CommandRun(
            command=argv,
            simulated=False,
            returncode=completed.returncode,
            stdout=completed.stdout.strip(),
            stderr=completed.stderr.strip(),
        )

    def _handle_issue(self, argv: list[str], reason: str, returncode: int = 1) -> CommandRun:
        if self.mode == "strict":
            raise RuntimeError(f"Command failed: {' '.join(argv)} ({reason})")
        return CommandRun(
            command=argv,
            simulated=True,
            returncode=returncode,
            note=f"fallback: {reason}",
        )

    @staticmethod
    def _resolve_workdir(raw_workdir: str) -> Path:
        workdir = Path(raw_workdir)
        if not workdir.is_absolute():
            workdir = (REPO_ROOT / workdir).resolve()
        return workdir


class InfrastructureAdapter:
    def __init__(self, runner: SafeCommandRunner | None = None):
        self.runner = runner or SafeCommandRunner()
        normalized_transport = (settings.infra_transport or "shell").strip().lower()
        self.transport = normalized_transport if normalized_transport in VALID_TRANSPORTS else "shell"

    def provision_vm(
        self,
        vm_id: str,
        country: str,
        ram_mb: int,
        cpu_cores: int,
        template_base_image: str,
    ) -> VmProvisionResult:
        _ensure_safe_token("vm_id", vm_id)
        _ensure_safe_token("country", country.replace(" ", "-"))

        rootfs_path = self._resolve_rootfs(template_base_image)
        tap_dev = _safe_iface_name(settings.vm_tap_prefix, vm_id)
        namespace = f"{settings.vm_namespace_prefix}{_slug(vm_id)}"
        fallback_runs: list[CommandRun] = []

        if self._should_try_api("vm"):
            payload = {
                "vm_id": vm_id,
                "country": country,
                "ram_mb": ram_mb,
                "cpu_cores": cpu_cores,
                "kernel_path": settings.firecracker_kernel_path,
                "rootfs_path": rootfs_path,
                "tap_device": tap_dev,
                "namespace": namespace,
            }
            try:
                data, api_run = self._api_call("vm", settings.vm_api_create_endpoint, payload, method="POST")
                public_ip = str(data.get("public_ip") or generate_public_ip(vm_id))
                provider = str(data.get("provider") or "AutoProvisioned")
                latency_ms = self._as_int(data.get("latency_ms"), estimate_latency_ms(country))
                exit_node = str(data.get("exit_node") or f"{short_code(country)}-edge-01")
                return VmProvisionResult(
                    public_ip=public_ip,
                    provider=provider,
                    latency_ms=latency_ms,
                    exit_node=exit_node,
                    command_runs=[api_run],
                )
            except Exception as exc:
                if not self._allow_shell_fallback():
                    raise
                fallback_runs.append(self._api_failure_run("vm", settings.vm_api_create_endpoint, exc))

        command_runs = self._run_script_if_available(
            settings.vm_launch_script,
            [vm_id, settings.firecracker_kernel_path, rootfs_path, str(ram_mb), str(cpu_cores), tap_dev, namespace],
        )
        if not command_runs:
            extra_vars = json.dumps(
                {
                    "action": "provision",
                    "vm_id": vm_id,
                    "country": country,
                    "tap_device": tap_dev,
                    "namespace": namespace,
                }
            )
            command_runs = [
                self.runner.run(
                    ["ansible-playbook", settings.ansible_setup_vm_playbook, "--extra-vars", extra_vars]
                ),
                self.runner.run(["ip", "netns", "add", namespace]),
                self.runner.run(["ip", "tuntap", "add", "dev", tap_dev, "mode", "tap"]),
                self.runner.run(["ip", "link", "set", tap_dev, "up"]),
                self.runner.run(
                    [
                        "firectl",
                        "--id",
                        vm_id,
                        "--kernel",
                        settings.firecracker_kernel_path,
                        "--root-drive",
                        rootfs_path,
                        "--memory",
                        str(ram_mb),
                        "--ncpus",
                        str(cpu_cores),
                        "--tap-device",
                        tap_dev,
                    ]
                ),
            ]

        command_runs = [*fallback_runs, *command_runs]
        public_ip = self._extract_first_public_ipv4(command_runs) or generate_public_ip(vm_id)
        provider = self._detect_provider(command_runs)

        return VmProvisionResult(
            public_ip=public_ip,
            provider=provider,
            latency_ms=estimate_latency_ms(country),
            exit_node=f"{short_code(country)}-edge-01",
            command_runs=command_runs,
        )

    def stop_vm(self, vm_id: str) -> list[CommandRun]:
        _ensure_safe_token("vm_id", vm_id)
        fallback_runs: list[CommandRun] = []
        if self._should_try_api("vm"):
            try:
                _, api_run = self._api_call(
                    "vm",
                    settings.vm_api_stop_endpoint,
                    {"vm_id": vm_id},
                    method="POST",
                )
                return [api_run]
            except Exception as exc:
                if not self._allow_shell_fallback():
                    raise
                fallback_runs.append(self._api_failure_run("vm", settings.vm_api_stop_endpoint, exc))

        command_runs = self._run_script_if_available(settings.vm_stop_script, [vm_id])
        if command_runs:
            return [*fallback_runs, *command_runs]
        return [
            *fallback_runs,
            self.runner.run(
                [
                    "ansible-playbook",
                    settings.ansible_setup_vm_playbook,
                    "--extra-vars",
                    json.dumps({"action": "stop", "vm_id": vm_id}),
                ]
            ),
        ]

    def restart_vm(self, vm_id: str) -> list[CommandRun]:
        _ensure_safe_token("vm_id", vm_id)
        fallback_runs: list[CommandRun] = []
        if self._should_try_api("vm"):
            try:
                _, api_run = self._api_call(
                    "vm",
                    settings.vm_api_restart_endpoint,
                    {"vm_id": vm_id},
                    method="POST",
                )
                return [api_run]
            except Exception as exc:
                if not self._allow_shell_fallback():
                    raise
                fallback_runs.append(self._api_failure_run("vm", settings.vm_api_restart_endpoint, exc))

        command_runs = self._run_script_if_available(settings.vm_restart_script, [vm_id])
        if command_runs:
            return [*fallback_runs, *command_runs]
        return [
            *fallback_runs,
            self.runner.run(
                [
                    "ansible-playbook",
                    settings.ansible_setup_vm_playbook,
                    "--extra-vars",
                    json.dumps({"action": "restart", "vm_id": vm_id}),
                ]
            ),
        ]

    def delete_vm(self, vm_id: str) -> list[CommandRun]:
        _ensure_safe_token("vm_id", vm_id)
        namespace = f"{settings.vm_namespace_prefix}{_slug(vm_id)}"
        tap_dev = _safe_iface_name(settings.vm_tap_prefix, vm_id)
        fallback_runs: list[CommandRun] = []

        if self._should_try_api("vm"):
            try:
                _, api_run = self._api_call(
                    "vm",
                    settings.vm_api_delete_endpoint,
                    {"vm_id": vm_id, "tap_device": tap_dev, "namespace": namespace},
                    method="POST",
                )
                return [api_run]
            except Exception as exc:
                if not self._allow_shell_fallback():
                    raise
                fallback_runs.append(self._api_failure_run("vm", settings.vm_api_delete_endpoint, exc))

        command_runs = self._run_script_if_available(settings.vm_delete_script, [vm_id, tap_dev, namespace])
        if command_runs:
            return [*fallback_runs, *command_runs]
        return [
            *fallback_runs,
            self.runner.run(
                [
                    "ansible-playbook",
                    settings.ansible_setup_vm_playbook,
                    "--extra-vars",
                    json.dumps({"action": "delete", "vm_id": vm_id}),
                ]
            ),
            self.runner.run(["ip", "link", "delete", tap_dev]),
            self.runner.run(["ip", "netns", "delete", namespace]),
        ]

    def rotate_tunnel(self, vm_id: str, tunnel_id: str, country: str) -> TunnelRotationResult:
        _ensure_safe_token("vm_id", vm_id)
        _ensure_safe_token("tunnel_id", tunnel_id)
        fallback_runs: list[CommandRun] = []
        normalized_country = (country or "").strip().lower()

        if self._should_try_api("proxy"):
            payload = {"vm_id": vm_id, "tunnel_id": tunnel_id, "country": country}
            try:
                data, api_run = self._api_call(
                    "proxy",
                    settings.proxy_api_rotate_endpoint,
                    payload,
                    method="POST",
                )
                return self._rotation_from_api_payload(
                    data=data,
                    vm_id=vm_id,
                    tunnel_id=tunnel_id,
                    country=country,
                    command_runs=[api_run],
                )
            except Exception as exc:
                if normalized_country not in {"us", "usa"} and self._is_proxy_country_config_error(exc):
                    fallback_country = "us"
                    fallback_payload = {"vm_id": vm_id, "tunnel_id": tunnel_id, "country": fallback_country}
                    try:
                        data, fallback_run = self._api_call(
                            "proxy",
                            settings.proxy_api_rotate_endpoint,
                            fallback_payload,
                            method="POST",
                        )
                        return self._rotation_from_api_payload(
                            data=data,
                            vm_id=vm_id,
                            tunnel_id=tunnel_id,
                            country=fallback_country,
                            command_runs=[
                                self._api_failure_run("proxy", settings.proxy_api_rotate_endpoint, exc),
                                fallback_run,
                            ],
                        )
                    except Exception:
                        pass
                if not self._allow_shell_fallback():
                    raise
                fallback_runs.append(self._api_failure_run("proxy", settings.proxy_api_rotate_endpoint, exc))

        command_runs = self._run_script_if_available(settings.tunnel_rotate_script, [vm_id, tunnel_id, country])
        if not command_runs:
            command_runs = [
                self.runner.run(
                    [
                        "ansible-playbook",
                        settings.ansible_setup_wg_playbook,
                        "--extra-vars",
                        json.dumps({"action": "rotate", "vm_id": vm_id, "tunnel_id": tunnel_id}),
                    ]
                ),
                self.runner.run(["wg", "show"]),
            ]

        command_runs = [*fallback_runs, *command_runs]
        discovered_ip = self._extract_first_public_ipv4(command_runs)

        return TunnelRotationResult(
            public_ip=discovered_ip or generate_public_ip(f"{vm_id}:{tunnel_id}"),
            latency_ms=max(20, estimate_latency_ms(country) + random.randint(-15, 20)),
            asn=f"AS{random.randint(10000, 99999)}",
            command_runs=command_runs,
        )

    @staticmethod
    def _is_proxy_country_config_error(exc: Exception) -> bool:
        detail = str(exc).lower()
        return "http 400" in detail and (
            "openvpn profile not found" in detail or "no compose service found for profile" in detail
        )

    def _rotation_from_api_payload(
        self,
        *,
        data: dict[str, Any],
        vm_id: str,
        tunnel_id: str,
        country: str,
        command_runs: list[CommandRun],
    ) -> TunnelRotationResult:
        public_ip = str(data.get("public_ip") or generate_public_ip(f"{vm_id}:{tunnel_id}"))
        latency_ms = self._as_int(
            data.get("latency_ms"),
            max(20, estimate_latency_ms(country) + random.randint(-15, 20)),
        )
        asn = str(data.get("asn") or f"AS{random.randint(10000, 99999)}")
        return TunnelRotationResult(
            public_ip=public_ip,
            latency_ms=latency_ms,
            asn=asn,
            command_runs=command_runs,
        )

    def register_vps(self, country: str, ip: str, provider: str) -> list[CommandRun]:
        ipaddress.ip_address(ip)
        _ensure_safe_token("provider", provider.replace(" ", "-"))
        fallback_runs: list[CommandRun] = []

        if self._should_try_api("proxy"):
            payload = {"country": country, "ip": ip, "provider": provider}
            try:
                _, api_run = self._api_call(
                    "proxy",
                    settings.proxy_api_register_endpoint,
                    payload,
                    method="POST",
                )
                return [api_run]
            except Exception as exc:
                if not self._allow_shell_fallback():
                    raise
                fallback_runs.append(self._api_failure_run("proxy", settings.proxy_api_register_endpoint, exc))

        command_runs = self._run_script_if_available(settings.tunnel_register_script, [country, ip, provider])
        if command_runs:
            return [*fallback_runs, *command_runs]
        return [
            *fallback_runs,
            self.runner.run(
                [
                    "ansible-playbook",
                    settings.ansible_setup_wg_playbook,
                    "--extra-vars",
                    json.dumps(
                        {"action": "register", "country": country, "ip": ip, "provider": provider}
                    ),
                ]
            ),
            self.runner.run(["wg", "show"]),
        ]

    def collect_security_snapshot(self) -> SecuritySnapshot:
        fallback_runs: list[CommandRun] = []
        if self._should_try_api("proxy"):
            try:
                data, api_run = self._api_call(
                    "proxy",
                    settings.proxy_api_security_endpoint,
                    payload=None,
                    method="GET",
                )
                namespaces = self._to_str_list(data.get("namespaces"))
                routing_tables = self._to_route_table_list(data.get("routing_tables"))
                nftables_status = str(data.get("nftables_status") or "Unknown")
                return SecuritySnapshot(
                    namespaces=namespaces,
                    routing_tables=routing_tables,
                    nftables_status=nftables_status,
                    command_runs=[api_run],
                )
            except Exception as exc:
                if not self._allow_shell_fallback():
                    raise
                fallback_runs.append(self._api_failure_run("proxy", settings.proxy_api_security_endpoint, exc))

        ns_run = self.runner.run(["ip", "netns", "list"])
        routes_run = self.runner.run(["ip", "-j", "route", "show", "table", "all"])
        nft_run = self.runner.run(["nft", "list", "ruleset"])

        namespaces = self._parse_namespaces(ns_run.stdout) if not ns_run.simulated else []
        routing_tables = self._parse_routing_tables(routes_run.stdout) if not routes_run.simulated else []

        if nft_run.simulated:
            nftables_status = "Simulated/Secure"
        elif "table" in nft_run.stdout.lower():
            nftables_status = "Active/Secure"
        else:
            nftables_status = "Inactive/Warning"

        return SecuritySnapshot(
            namespaces=namespaces,
            routing_tables=routing_tables,
            nftables_status=nftables_status,
            command_runs=[*fallback_runs, ns_run, routes_run, nft_run],
        )

    def _should_try_api(self, service: str) -> bool:
        if self.transport == "shell":
            return False

        base_url = self._api_base_url(service)
        if base_url:
            return True

        if self.transport == "api":
            raise RuntimeError(f"{service} API base URL is not configured.")
        return False

    def _allow_shell_fallback(self) -> bool:
        if self.transport == "shell":
            return True
        if self.runner.mode == "strict":
            return False
        return settings.infra_api_fallback_shell

    @staticmethod
    def _api_failure_run(service: str, endpoint: str, exc: Exception) -> CommandRun:
        return CommandRun(
            command=[f"api:{service}", endpoint],
            simulated=True,
            returncode=1,
            note=f"fallback: {exc}",
        )

    @staticmethod
    def _as_int(value: Any, default: int) -> int:
        try:
            return int(value)
        except (TypeError, ValueError):
            return default

    @staticmethod
    def _to_str_list(value: Any) -> list[str]:
        if not isinstance(value, list):
            return []
        return [str(item) for item in value]

    @staticmethod
    def _to_route_table_list(value: Any) -> list[dict[str, str]]:
        if not isinstance(value, list):
            return []
        tables: list[dict[str, str]] = []
        for item in value:
            if not isinstance(item, dict):
                continue
            table = str(item.get("table", "main"))
            dev = item.get("dev")
            if dev is None:
                continue
            tables.append({"table": table, "dev": str(dev)})
        return tables

    @staticmethod
    def _detect_provider(command_runs: Sequence[CommandRun]) -> str:
        joined = " ".join(" ".join(run.command).lower() for run in command_runs)
        if "openvpn" in joined or "proxy" in joined or "tun0" in joined:
            return "OpenVPN"
        if "wg" in joined:
            return "WireGuard"
        return "AutoProvisioned"

    def _api_call(
        self,
        service: str,
        endpoint: str,
        payload: dict[str, Any] | None,
        method: str = "POST",
    ) -> tuple[dict[str, Any], CommandRun]:
        base_url = self._api_base_url(service)
        if not base_url:
            raise RuntimeError(f"{service} API base URL is not configured.")

        url = urlparse.urljoin(base_url.rstrip("/") + "/", endpoint.lstrip("/"))
        normalized_method = method.strip().upper() or "POST"
        raw_payload = b""
        request_data: bytes | None = None
        headers = {"Accept": "application/json"}

        if normalized_method != "GET":
            raw_payload = json.dumps(payload or {}).encode("utf-8")
            request_data = raw_payload
            headers["Content-Type"] = "application/json"

        token = self._api_token(service)
        if token:
            headers["Authorization"] = f"Bearer {token}"

        request = urlrequest.Request(url=url, data=request_data, method=normalized_method, headers=headers)
        try:
            with urlrequest.urlopen(request, timeout=settings.infra_api_timeout_sec) as response:
                body = response.read().decode("utf-8", errors="replace")
                status = int(getattr(response, "status", 200))
        except urlerror.HTTPError as exc:
            response_body = exc.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"{service} API HTTP {exc.code}: {response_body[:300]}") from exc
        except urlerror.URLError as exc:
            raise RuntimeError(f"{service} API unreachable: {exc.reason}") from exc
        except Exception as exc:  # noqa: BLE001
            raise RuntimeError(f"{service} API request failed: {exc}") from exc

        if status >= 400:
            raise RuntimeError(f"{service} API returned HTTP {status}: {body[:300]}")

        try:
            parsed: dict[str, Any] = json.loads(body) if body.strip() else {}
        except json.JSONDecodeError:
            parsed = {"raw": body}

        run = CommandRun(
            command=[f"api:{service}", f"{normalized_method} {url}"],
            simulated=False,
            returncode=0,
            stdout=body[:4000],
            stderr="",
            note=f"payload_bytes={len(raw_payload)}",
        )
        return parsed, run

    @staticmethod
    def _api_base_url(service: str) -> str:
        if service == "vm":
            return settings.vm_api_base_url.strip()
        if service == "proxy":
            return settings.proxy_api_base_url.strip()
        raise ValueError(f"Unsupported API service '{service}'.")

    @staticmethod
    def _api_token(service: str) -> str:
        if service == "vm":
            return settings.vm_api_token.strip()
        if service == "proxy":
            return settings.proxy_api_token.strip()
        raise ValueError(f"Unsupported API service '{service}'.")

    @staticmethod
    def _parse_namespaces(output: str) -> list[str]:
        names: list[str] = []
        for line in output.splitlines():
            line = line.strip()
            if not line:
                continue
            names.append(line.split()[0])
        return names

    @staticmethod
    def _parse_routing_tables(output: str) -> list[dict[str, str]]:
        try:
            data = json.loads(output)
            if isinstance(data, list):
                tables = []
                for row in data:
                    if not isinstance(row, dict):
                        continue
                    table_name = str(row.get("table", "main"))
                    dev_name = row.get("dev")
                    if not dev_name:
                        continue
                    tables.append({"table": table_name, "dev": str(dev_name)})
                if tables:
                    return tables
        except json.JSONDecodeError:
            pass

        tables: list[dict[str, str]] = []
        for line in output.splitlines():
            line = line.strip()
            if not line:
                continue
            table_match = ROUTING_TABLE_PATTERN.search(line)
            device_match = ROUTING_DEVICE_PATTERN.search(line)
            if device_match is None:
                continue
            tables.append(
                {
                    "table": table_match.group(1) if table_match else "main",
                    "dev": device_match.group(1),
                }
            )
        return tables

    @staticmethod
    def _resolve_rootfs(template_base_image: str) -> str:
        candidate = Path(template_base_image)
        if candidate.is_absolute():
            return candidate.as_posix()
        if len(candidate.parts) > 1:
            return (REPO_ROOT / candidate).resolve().as_posix()
        return (InfrastructureAdapter._resolve_path(settings.firecracker_rootfs_dir) / candidate).as_posix()

    @staticmethod
    def _resolve_path(path_like: str) -> Path:
        path = Path(path_like)
        if not path.is_absolute():
            path = (REPO_ROOT / path).resolve()
        return path

    def _run_script_if_available(self, script_path: str, args: list[str]) -> list[CommandRun]:
        script = self._resolve_path(script_path)
        if not script.exists() or not script.is_file():
            return []

        try:
            script.relative_to(REPO_ROOT)
        except ValueError as exc:
            raise ValueError(f"Script path '{script}' must stay inside repository.") from exc

        return [self.runner.run(["bash", script.as_posix(), *args])]

    @staticmethod
    def _extract_first_public_ipv4(command_runs: Sequence[CommandRun]) -> str | None:
        for run in command_runs:
            text = f"{run.stdout}\n{run.stderr}"
            for token in PUBLIC_IPV4_PATTERN.findall(text):
                try:
                    candidate = ipaddress.ip_address(token)
                except ValueError:
                    continue
                if isinstance(candidate, ipaddress.IPv4Address) and candidate.is_global:
                    return candidate.exploded
        return None


def _ensure_safe_token(field_name: str, value: str) -> None:
    if not SAFE_TOKEN_PATTERN.fullmatch(value):
        raise ValueError(f"Unsafe value for {field_name}: '{value}'")


def _slug(value: str) -> str:
    return re.sub(r"[^a-z0-9-]", "-", value.lower())


def _safe_iface_name(prefix: str, seed: str) -> str:
    candidate = f"{prefix}{_slug(seed)}"
    if len(candidate) <= IFACE_NAME_MAX_LEN:
        return candidate

    available = IFACE_NAME_MAX_LEN - len(prefix)
    digest = hashlib.sha1(seed.encode("utf-8")).hexdigest()

    if available <= 0:
        return digest[:IFACE_NAME_MAX_LEN]

    return f"{prefix}{digest[:available]}"
