import os
from dataclasses import dataclass


def _env_bool(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _env_str(name: str, default: str, *aliases: str) -> str:
    for candidate in (name, *aliases):
        value = os.getenv(candidate)
        if value is not None:
            return value
    return default


@dataclass(frozen=True)
class Settings:
    database_url: str = os.getenv("DATABASE_URL", "sqlite:///./backend/colab_farm.db")
    host_total_ram_mb: int = int(os.getenv("HOST_TOTAL_RAM_MB", "32768"))
    host_cpu_protect_threshold_percent: int = int(os.getenv("HOST_CPU_PROTECT_THRESHOLD_PERCENT", "85"))
    host_ram_protect_threshold_percent: int = int(os.getenv("HOST_RAM_PROTECT_THRESHOLD_PERCENT", "85"))
    host_disk_protect_threshold_percent: int = int(os.getenv("HOST_DISK_PROTECT_THRESHOLD_PERCENT", "90"))
    failsafe_cooldown_minutes: int = int(os.getenv("FAILSAFE_COOLDOWN_MINUTES", "15"))
    scheduler_concurrency_limit: int = int(os.getenv("SCHEDULER_CONCURRENCY_LIMIT", "3"))
    scheduler_backoff_base_seconds: float = float(os.getenv("SCHEDULER_BACKOFF_BASE_SECONDS", "1.5"))
    scheduler_default_max_retries: int = int(os.getenv("SCHEDULER_DEFAULT_MAX_RETRIES", "3"))
    scheduler_tick_seconds: int = int(os.getenv("SCHEDULER_TICK_SECONDS", "5"))
    scheduler_warmup_enabled: bool = _env_bool("SCHEDULER_WARMUP_ENABLED", True)
    scheduler_warmup_interval_minutes: int = int(os.getenv("SCHEDULER_WARMUP_INTERVAL_MINUTES", "60"))
    scheduler_warmup_jitter_seconds: int = int(os.getenv("SCHEDULER_WARMUP_JITTER_SECONDS", "180"))
    scheduler_default_window_start_hour: int = int(os.getenv("SCHEDULER_DEFAULT_WINDOW_START_HOUR", "6"))
    scheduler_default_window_end_hour: int = int(os.getenv("SCHEDULER_DEFAULT_WINDOW_END_HOUR", "23"))
    scheduler_timezone_offsets: str = os.getenv("SCHEDULER_TIMEZONE_OFFSETS", "-300,0,60,330")
    # Keep backward compatibility with the legacy typo used in existing deployments.
    infra_execution_mode: str = _env_str("INFRA_EXECUTION_MODE", "mock", "INFRA_EXECUTION_MO8DE")
    infra_transport: str = os.getenv("INFRA_TRANSPORT", "shell")
    infra_command_timeout_sec: int = int(os.getenv("INFRA_COMMAND_TIMEOUT_SEC", "20"))
    infra_api_timeout_sec: int = int(os.getenv("INFRA_API_TIMEOUT_SEC", "20"))
    infra_api_fallback_shell: bool = _env_bool("INFRA_API_FALLBACK_SHELL", True)
    infra_workdir: str = os.getenv("INFRA_WORKDIR", ".")
    vm_api_base_url: str = os.getenv("VM_API_BASE_URL", "")
    vm_api_token: str = os.getenv("VM_API_TOKEN", "")
    vm_api_create_endpoint: str = os.getenv("VM_API_CREATE_ENDPOINT", "/v1/vms/create")
    vm_api_stop_endpoint: str = os.getenv("VM_API_STOP_ENDPOINT", "/v1/vms/stop")
    vm_api_restart_endpoint: str = os.getenv("VM_API_RESTART_ENDPOINT", "/v1/vms/restart")
    vm_api_delete_endpoint: str = os.getenv("VM_API_DELETE_ENDPOINT", "/v1/vms/delete")
    proxy_api_base_url: str = os.getenv("PROXY_API_BASE_URL", "")
    proxy_api_token: str = os.getenv("PROXY_API_TOKEN", "")
    proxy_country_fallback_enabled: bool = _env_bool("PROXY_COUNTRY_FALLBACK_ENABLED", False)
    proxy_api_rotate_endpoint: str = os.getenv("PROXY_API_ROTATE_ENDPOINT", "/v1/proxy/rotate")
    proxy_api_register_endpoint: str = os.getenv("PROXY_API_REGISTER_ENDPOINT", "/v1/proxy/register")
    proxy_api_security_endpoint: str = os.getenv("PROXY_API_SECURITY_ENDPOINT", "/v1/proxy/security/snapshot")
    ansible_setup_vm_playbook: str = os.getenv("ANSIBLE_SETUP_VM_PLAYBOOK", "ansible/setup_vm.yml")
    ansible_setup_wg_playbook: str = os.getenv("ANSIBLE_SETUP_WG_PLAYBOOK", "ansible/setup_wg.yml")
    firecracker_kernel_path: str = os.getenv("FIRECRACKER_KERNEL_PATH", "./vmlinux")
    firecracker_rootfs_dir: str = os.getenv("FIRECRACKER_ROOTFS_DIR", ".")
    vm_tap_prefix: str = os.getenv("VM_TAP_PREFIX", "tap-")
    vm_namespace_prefix: str = os.getenv("VM_NAMESPACE_PREFIX", "netns-")
    vm_launch_script: str = os.getenv("VM_LAUNCH_SCRIPT", "scripts/launch_vm.sh")
    vm_stop_script: str = os.getenv("VM_STOP_SCRIPT", "scripts/stop_vm.sh")
    vm_restart_script: str = os.getenv("VM_RESTART_SCRIPT", "scripts/restart_vm.sh")
    vm_delete_script: str = os.getenv("VM_DELETE_SCRIPT", "scripts/delete_vm.sh")
    tunnel_rotate_script: str = os.getenv("TUNNEL_ROTATE_SCRIPT", "scripts/rotate_tunnel.sh")
    tunnel_register_script: str = os.getenv("TUNNEL_REGISTER_SCRIPT", "scripts/register_tunnel.sh")
    colab_worker_enabled: bool = _env_bool("COLAB_WORKER_ENABLED", True)
    colab_worker_auto_start: bool = _env_bool("COLAB_WORKER_AUTO_START", False)
    colab_worker_headless: bool = _env_bool("COLAB_WORKER_HEADLESS", True)
    colab_worker_poll_seconds: int = int(os.getenv("COLAB_WORKER_POLL_SECONDS", "30"))
    colab_worker_nav_timeout_ms: int = int(os.getenv("COLAB_WORKER_NAV_TIMEOUT_MS", "45000"))
    colab_worker_action_timeout_ms: int = int(os.getenv("COLAB_WORKER_ACTION_TIMEOUT_MS", "4000"))
    colab_worker_storage_state_dir: str = os.getenv("COLAB_WORKER_STORAGE_STATE_DIR", "./backend/.state/colab")
    colab_worker_browser_channel: str = os.getenv("COLAB_WORKER_BROWSER_CHANNEL", "")
    colab_worker_auto_create_sessions: bool = _env_bool("COLAB_WORKER_AUTO_CREATE_SESSIONS", True)
    colab_worker_entry_url: str = os.getenv("COLAB_WORKER_ENTRY_URL", "https://colab.new")


settings = Settings()
