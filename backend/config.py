import os
from dataclasses import dataclass


def _env_bool(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class Settings:
    database_url: str = os.getenv("DATABASE_URL", "sqlite:///./backend/colab_farm.db")
    host_total_ram_mb: int = int(os.getenv("HOST_TOTAL_RAM_MB", "32768"))
    infra_execution_mode: str = os.getenv("INFRA_EXECUTION_MODE", "mock")
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


settings = Settings()
