# Linux Infra API Bridge

This service lets your backend talk to two separate Linux folders over HTTP:

- `microvm` for VM lifecycle operations.
- `microvm-proxy` for OpenVPN rotation and security snapshot operations.

It exposes the API contract expected by `backend/services/infra_adapter.py`:

- `POST /v1/vms/create`
- `POST /v1/vms/stop`
- `POST /v1/vms/restart`
- `POST /v1/vms/delete`
- `POST /v1/proxy/rotate`
- `POST /v1/proxy/register`
- `GET /v1/proxy/security/snapshot`

## 1) Keep folders separate

You do not need to merge them into one folder. Keep:

- `/home/aoi/microvm`
- `/home/aoi/microvm-proxy`

Set those paths via env vars in this API service.

## 2) Required script layout

Inside `MICROVM_HOME`, ensure these scripts exist and are executable:

- `launch_vm.sh`
- `stop_vm.sh`
- `restart_vm.sh`
- `delete_vm.sh`

If your script names differ, override them in env.

### 2.1) Apply scripts to the two Linux folders

From your repo folder on Linux:

```bash
cd ~/nuevo-dashboard
chmod +x scripts/*.sh
cp scripts/common.sh ~/microvm/common.sh
cp scripts/launch_vm.sh scripts/stop_vm.sh scripts/restart_vm.sh scripts/delete_vm.sh ~/microvm/
cp scripts/rotate_tunnel.sh scripts/register_tunnel.sh ~/microvm/
chmod +x ~/microvm/*.sh
```

`rotate_tunnel.sh` and `register_tunnel.sh` still control Docker services in `~/microvm-proxy` via `MICROVM_PROXY_HOME`, so this keeps both folders coordinated.

## 3) Run the API on Linux

```bash
cd /path/to/nuevo-dashboard-colab-main/infra_api
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
set -a; source .env; set +a
uvicorn app:APP --host 0.0.0.0 --port 8090
```

## 4) Point backend to this API

In your backend `.env`:

```env
INFRA_TRANSPORT=api
INFRA_API_FALLBACK_SHELL=true

VM_API_BASE_URL=http://<linux-host>:8090
VM_API_TOKEN=<same as VM_API_TOKEN in infra_api .env>

PROXY_API_BASE_URL=http://<linux-host>:8090
PROXY_API_TOKEN=<same as PROXY_API_TOKEN in infra_api .env>
```

If you run the backend on the same Linux host, use `http://127.0.0.1:8090`.

## 5) OpenVPN multi-country behavior

You can run this in two valid patterns.

### A) Single-service pattern (simplest)

- Keep only one compose service, for example `proxy-us`.
- Put all country configs in `microvm-proxy/configs/` (`us.ovpn`, `de.ovpn`, `ca.ovpn`, ...).
- Set:
  - `PROXY_SELECTION_MODE=config`
  - `PROXY_SERVICE_NAME=proxy-us`
- On each rotate/register call, the API copies `configs/<profile>.ovpn` into `config.ovpn` and recreates that one service.

### B) Multi-service pattern (parallel by country)

- Define dedicated compose services (`proxy-us`, `proxy-de`, `proxy-ca`, ...), each mounted to its own `configs/<profile>.ovpn`.
- Set:
  - `PROXY_SELECTION_MODE=auto` (or `service` if you want strict mode)
  - `PROFILE_SERVICE_MAP=us=proxy-us,de=proxy-de,ca=proxy-ca`
- In `auto` and `service` mode, API is strict: it must find a mapped service or `proxy-<profile>`; otherwise it returns `400`.

### Country mapping

- `COUNTRY_PROFILE_MAP` lets you map dashboard/backend country names to OVPN profile names.
- Example: `COUNTRY_PROFILE_MAP=usa=us,spain=es,germany=de,canada=ca`
- Built-in aliases include: `us`, `de`, `ca`, `es`, `fr`, `uk`, `jp`, `sg`, `au`.

## 6) Health check

```bash
curl http://127.0.0.1:8090/healthz
```
