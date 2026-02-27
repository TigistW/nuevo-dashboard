from __future__ import annotations

import hashlib
import ipaddress
import json
import os
import random
import re
import shutil
import subprocess
import time
from dataclasses import dataclass
from pathlib import Path

from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel, Field


PUBLIC_IPV4_PATTERN = re.compile(r"\b(?:\d{1,3}\.){3}\d{1,3}\b")
ROUTING_TABLE_PATTERN = re.compile(r"\btable\s+(\S+)\b")
ROUTING_DEVICE_PATTERN = re.compile(r"\bdev\s+(\S+)\b")
IFACE_NAME_MAX_LEN = 15


@dataclass(frozen=True)
class InfraApiSettings:
    microvm_home: str = os.getenv("MICROVM_HOME", "/home/aoi/microvm")
    microvm_proxy_home: str = os.getenv("MICROVM_PROXY_HOME", "/home/aoi/microvm-proxy")
    vm_launch_script: str = os.getenv("VM_LAUNCH_SCRIPT", "launch_vm.sh")
    vm_stop_script: str = os.getenv("VM_STOP_SCRIPT", "stop_vm.sh")
    vm_restart_script: str = os.getenv("VM_RESTART_SCRIPT", "restart_vm.sh")
    vm_delete_script: str = os.getenv("VM_DELETE_SCRIPT", "delete_vm.sh")
    proxy_service_name: str = os.getenv("PROXY_SERVICE_NAME", "proxy-us")
    proxy_selection_mode: str = os.getenv("PROXY_SELECTION_MODE", "auto")
    country_profile_map: str = os.getenv("COUNTRY_PROFILE_MAP", "")
    profile_service_map: str = os.getenv("PROFILE_SERVICE_MAP", "")
    command_timeout_sec: int = int(os.getenv("INFRA_API_TIMEOUT_SEC", "60"))
    vm_api_token: str = os.getenv("VM_API_TOKEN", os.getenv("INFRA_API_TOKEN", ""))
    proxy_api_token: str = os.getenv("PROXY_API_TOKEN", os.getenv("INFRA_API_TOKEN", ""))


SETTINGS = InfraApiSettings()
APP = FastAPI(title="MicroVM Infra API", version="1.0.0")


class VmCreateRequest(BaseModel):
    vm_id: str = Field(min_length=1, max_length=128)
    country: str = Field(min_length=1, max_length=128)
    ram_mb: int = Field(gt=0)
    cpu_cores: int = Field(gt=0)
    kernel_path: str = Field(min_length=1, max_length=512)
    rootfs_path: str = Field(min_length=1, max_length=512)
    tap_device: str = Field(min_length=1, max_length=128)
    namespace: str = Field(min_length=1, max_length=128)


class VmActionRequest(BaseModel):
    vm_id: str = Field(min_length=1, max_length=128)


class VmDeleteRequest(BaseModel):
    vm_id: str = Field(min_length=1, max_length=128)
    tap_device: str | None = Field(default=None, max_length=128)
    namespace: str | None = Field(default=None, max_length=128)


class ProxyRotateRequest(BaseModel):
    vm_id: str = Field(min_length=1, max_length=128)
    tunnel_id: str = Field(min_length=1, max_length=128)
    country: str = Field(min_length=1, max_length=128)


class ProxyRegisterRequest(BaseModel):
    country: str = Field(min_length=1, max_length=128)
    ip: str = Field(min_length=1, max_length=64)
    provider: str = Field(min_length=1, max_length=128)


def _require_token(authorization: str | None, expected_token: str) -> None:
    if not expected_token:
        return
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing Authorization header.")
    prefix = "Bearer "
    if not authorization.startswith(prefix):
        raise HTTPException(status_code=401, detail="Authorization must use Bearer token.")
    token = authorization[len(prefix) :].strip()
    if token != expected_token:
        raise HTTPException(status_code=401, detail="Invalid token.")


def vm_auth(authorization: str | None = Header(default=None)) -> None:
    _require_token(authorization, SETTINGS.vm_api_token)


def proxy_auth(authorization: str | None = Header(default=None)) -> None:
    _require_token(authorization, SETTINGS.proxy_api_token)


def _run_command(
    command: list[str],
    *,
    cwd: str | None = None,
    timeout: int | None = None,
    check: bool = True,
) -> subprocess.CompletedProcess[str]:
    completed = subprocess.run(
        command,
        cwd=cwd,
        timeout=timeout or SETTINGS.command_timeout_sec,
        capture_output=True,
        text=True,
        check=False,
    )
    if check and completed.returncode != 0:
        stderr = (completed.stderr or "").strip()
        stdout = (completed.stdout or "").strip()
        detail = stderr or stdout or f"command failed with rc={completed.returncode}"
        raise HTTPException(status_code=500, detail=detail[:1000])
    return completed


def _resolve_path(base_dir: str, path_like: str) -> str:
    path = Path(path_like)
    if path.is_absolute():
        return path.as_posix()
    return (Path(base_dir) / path).resolve().as_posix()


def _ensure_file_exists(path: str) -> None:
    if not Path(path).is_file():
        raise HTTPException(status_code=500, detail=f"File not found: {path}")


def _parse_map(raw: str) -> dict[str, str]:
    mapping: dict[str, str] = {}
    if not raw:
        return mapping
    for pair in raw.split(","):
        pair = pair.strip()
        if not pair or "=" not in pair:
            continue
        key, value = pair.split("=", 1)
        key = key.strip().lower()
        value = value.strip()
        if key and value:
            mapping[key] = value
    return mapping


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


def _country_to_profile(country: str) -> str:
    country_lower = country.strip().lower().replace("_", "-")
    user_map = _parse_map(SETTINGS.country_profile_map)
    if country_lower in user_map:
        return user_map[country_lower]

    defaults = {
        "us": "us",
        "usa": "us",
        "united-states": "us",
        "es": "es",
        "spain": "es",
        "de": "de",
        "germany": "de",
        "fr": "fr",
        "france": "fr",
        "uk": "uk",
        "gb": "uk",
        "united-kingdom": "uk",
        "ca": "ca",
        "canada": "ca",
        "jp": "jp",
        "japan": "jp",
        "sg": "sg",
        "singapore": "sg",
        "au": "au",
        "australia": "au",
    }
    profile = defaults.get(country_lower)
    if profile:
        return profile

    config_path = Path(SETTINGS.microvm_proxy_home) / "configs" / f"{country_lower}.ovpn"
    if config_path.exists():
        return country_lower
    return country_lower


def _proxy_compose(args: list[str], *, check: bool = True) -> subprocess.CompletedProcess[str]:
    compose_file = str(Path(SETTINGS.microvm_proxy_home) / "docker-compose.yml")
    return _run_command(
        ["docker", "compose", "-f", compose_file, *args],
        cwd=SETTINGS.microvm_proxy_home,
        check=check,
    )


def _compose_service_exists(service_name: str) -> bool:
    result = _proxy_compose(["config", "--services"], check=False)
    if result.returncode != 0:
        return False
    services = {line.strip() for line in result.stdout.splitlines() if line.strip()}
    return service_name in services


def _service_for_country(country: str) -> tuple[str, str]:
    profile = _country_to_profile(country)
    mode = SETTINGS.proxy_selection_mode.strip().lower()
    configured_service = SETTINGS.proxy_service_name
    profile_services = _parse_map(SETTINGS.profile_service_map)

    if mode == "config":
        return configured_service, profile

    mapped_service = profile_services.get(profile)
    if mapped_service and _compose_service_exists(mapped_service):
        return mapped_service, profile

    candidate = f"proxy-{profile}"
    if _compose_service_exists(candidate):
        return candidate, profile

    if mode in {"service", "auto"}:
        raise HTTPException(
            status_code=400,
            detail=(
                f"No compose service found for profile '{profile}'. "
                "Add PROFILE_SERVICE_MAP/proxy-<profile> service or use PROXY_SELECTION_MODE=config."
            ),
        )

    return configured_service, profile


def _should_prepare_proxy_config(profile: str, service_name: str) -> bool:
    mode = SETTINGS.proxy_selection_mode.strip().lower()
    if mode == "config":
        return True
    if mode == "service":
        return False
    return service_name != f"proxy-{profile}"


def _resolve_profile_config(profile: str) -> Path:
    configs_dir = Path(SETTINGS.microvm_proxy_home) / "configs"
    exact = configs_dir / f"{profile}.ovpn"
    if exact.exists():
        return exact

    candidates = sorted(configs_dir.glob(f"{profile}-*.ovpn"))
    if candidates:
        return random.choice(candidates)

    raise HTTPException(
        status_code=400,
        detail=(
            f"OpenVPN profile not found for '{profile}' in {configs_dir} "
            f"(expected {profile}.ovpn or {profile}-*.ovpn)."
        ),
    )


def _prepare_proxy_config(profile: str) -> None:
    src = _resolve_profile_config(profile)
    dst = Path(SETTINGS.microvm_proxy_home) / "config.ovpn"
    shutil.copyfile(src, dst)


def _wait_for_tun(service_name: str, timeout_seconds: int = 60) -> None:
    for _ in range(timeout_seconds):
        probe = _proxy_compose(
            ["exec", "-T", service_name, "sh", "-lc", "ip link show tun0 >/dev/null 2>&1"],
            check=False,
        )
        if probe.returncode == 0:
            return
        time.sleep(1)
    raise HTTPException(status_code=500, detail=f"OpenVPN tunnel did not come up for service {service_name}")


def _extract_first_public_ipv4(text: str) -> str | None:
    for token in PUBLIC_IPV4_PATTERN.findall(text):
        try:
            ip = ipaddress.ip_address(token)
        except ValueError:
            continue
        if isinstance(ip, ipaddress.IPv4Address) and ip.is_global:
            return ip.exploded
    return None


def _get_public_ip_for_service(service_name: str) -> str | None:
    response = _proxy_compose(
        ["exec", "-T", service_name, "sh", "-lc", "curl -4 -s https://ifconfig.me || true"],
        check=False,
    )
    return _extract_first_public_ipv4(response.stdout)


def _estimate_latency(country: str) -> int:
    country_lower = country.lower().strip()
    regional_defaults = {
        "us": 65,
        "usa": 65,
        "spain": 95,
        "es": 95,
        "germany": 82,
        "de": 82,
        "france": 86,
        "fr": 86,
        "uk": 80,
        "gb": 80,
        "canada": 72,
        "ca": 72,
        "japan": 128,
        "jp": 128,
        "singapore": 118,
        "sg": 118,
        "australia": 130,
        "au": 130,
    }
    baseline = regional_defaults.get(country_lower, 90)
    return max(20, baseline + random.randint(-12, 18))


def _short_code(country: str) -> str:
    normalized = re.sub(r"[^a-z0-9]+", "-", country.lower()).strip("-")
    if not normalized:
        return "xx"
    token = normalized.split("-", 1)[0]
    return token[:2] if len(token) >= 2 else token.ljust(2, "x")


def _rotate_for_country(country: str) -> tuple[str, str, str]:
    service_name, profile = _service_for_country(country)
    if _should_prepare_proxy_config(profile, service_name):
        _prepare_proxy_config(profile)
    _proxy_compose(["up", "-d", "--force-recreate", service_name])
    _wait_for_tun(service_name, timeout_seconds=60)
    public_ip = _get_public_ip_for_service(service_name) or ""
    return public_ip, service_name, profile


def _vm_script(name: str, fallback: str) -> str:
    script = _resolve_path(SETTINGS.microvm_home, name)
    if Path(script).exists():
        return script
    fallback_script = _resolve_path(SETTINGS.microvm_home, fallback)
    if Path(fallback_script).exists():
        return fallback_script
    raise HTTPException(status_code=500, detail=f"Missing script: {name}")


@APP.get("/healthz")
def healthz() -> dict[str, str]:
    return {"status": "ok"}


@APP.post("/v1/vms/create", dependencies=[Depends(vm_auth)])
def create_vm(payload: VmCreateRequest) -> dict[str, str | int]:
    launch_script = _vm_script(SETTINGS.vm_launch_script, "launch_vm.sh")
    kernel_path = _resolve_path(SETTINGS.microvm_home, payload.kernel_path)
    rootfs_path = _resolve_path(SETTINGS.microvm_home, payload.rootfs_path)
    _ensure_file_exists(kernel_path)
    _ensure_file_exists(rootfs_path)

    completed = _run_command(
        [
            "bash",
            launch_script,
            payload.vm_id,
            kernel_path,
            rootfs_path,
            str(payload.ram_mb),
            str(payload.cpu_cores),
            payload.tap_device,
            payload.namespace,
        ],
        cwd=SETTINGS.microvm_home,
    )
    public_ip = _extract_first_public_ipv4(completed.stdout) or _extract_first_public_ipv4(completed.stderr) or ""
    return {
        "public_ip": public_ip,
        "provider": "OpenVPN",
        "latency_ms": _estimate_latency(payload.country),
        "exit_node": f"{_short_code(payload.country)}-edge-01",
    }


@APP.post("/v1/vms/stop", dependencies=[Depends(vm_auth)])
def stop_vm(payload: VmActionRequest) -> dict[str, str]:
    script = _vm_script(SETTINGS.vm_stop_script, "stop_vm.sh")
    _run_command(["bash", script, payload.vm_id], cwd=SETTINGS.microvm_home, check=False)
    return {"status": "ok"}


@APP.post("/v1/vms/restart", dependencies=[Depends(vm_auth)])
def restart_vm(payload: VmActionRequest) -> dict[str, str]:
    script = _vm_script(SETTINGS.vm_restart_script, "restart_vm.sh")
    _run_command(["bash", script, payload.vm_id], cwd=SETTINGS.microvm_home, check=False)
    return {"status": "ok"}


@APP.post("/v1/vms/delete", dependencies=[Depends(vm_auth)])
def delete_vm(payload: VmDeleteRequest) -> dict[str, str]:
    script = _vm_script(SETTINGS.vm_delete_script, "delete_vm.sh")
    tap_device = payload.tap_device or _safe_iface_name("tap-", payload.vm_id)
    namespace = payload.namespace or f"netns-{payload.vm_id.lower()}"
    _run_command(["bash", script, payload.vm_id, tap_device, namespace], cwd=SETTINGS.microvm_home, check=False)
    return {"status": "ok"}


@APP.post("/v1/proxy/rotate", dependencies=[Depends(proxy_auth)])
def rotate_proxy(payload: ProxyRotateRequest) -> dict[str, str | int]:
    requested_country = payload.country.strip()
    public_ip, service_name, profile = _rotate_for_country(requested_country)

    return {
        "public_ip": public_ip,
        "latency_ms": _estimate_latency(requested_country),
        "asn": f"AS{random.randint(10000, 99999)}",
        "country_used": requested_country,
        "service_name": service_name,
        "profile": profile,
    }


@APP.post("/v1/proxy/register", dependencies=[Depends(proxy_auth)])
def register_proxy(payload: ProxyRegisterRequest) -> dict[str, str]:
    try:
        ipaddress.ip_address(payload.ip)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid IP: {payload.ip}") from exc

    service_name, profile = _service_for_country(payload.country)
    if _should_prepare_proxy_config(profile, service_name):
        _prepare_proxy_config(profile)
    _proxy_compose(["up", "-d", "--force-recreate", service_name])
    _wait_for_tun(service_name, timeout_seconds=60)
    return {"status": "ok"}


@APP.get("/v1/proxy/security/snapshot", dependencies=[Depends(proxy_auth)])
def security_snapshot() -> dict[str, object]:
    netns = _run_command(["ip", "netns", "list"], check=False)
    routes = _run_command(["ip", "-j", "route", "show", "table", "all"], check=False)
    nftables = _run_command(["nft", "list", "ruleset"], check=False)

    namespaces = [line.split()[0] for line in netns.stdout.splitlines() if line.strip()]

    routing_tables: list[dict[str, str]] = []
    try:
        parsed = json.loads(routes.stdout)
        if isinstance(parsed, list):
            for row in parsed:
                if not isinstance(row, dict):
                    continue
                dev = row.get("dev")
                if not dev:
                    continue
                routing_tables.append({"table": str(row.get("table", "main")), "dev": str(dev)})
    except json.JSONDecodeError:
        for line in routes.stdout.splitlines():
            table_match = ROUTING_TABLE_PATTERN.search(line)
            dev_match = ROUTING_DEVICE_PATTERN.search(line)
            if dev_match is None:
                continue
            routing_tables.append(
                {
                    "table": table_match.group(1) if table_match else "main",
                    "dev": dev_match.group(1),
                }
            )

    if nftables.returncode != 0:
        nftables_status = "Inactive/Warning"
    elif "table" in nftables.stdout.lower():
        nftables_status = "Active/Secure"
    else:
        nftables_status = "Inactive/Warning"

    return {
        "namespaces": namespaces,
        "routing_tables": routing_tables,
        "nftables_status": nftables_status,
    }
