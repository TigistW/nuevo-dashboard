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

`PROXY_SELECTION_MODE` options:

- `auto`: tries `proxy-<profile>`, falls back to `PROXY_SERVICE_NAME`.
- `service`: requires a per-profile compose service.
- `config`: single service mode, copies `configs/<profile>.ovpn` to `config.ovpn`.

Optional maps:

- `COUNTRY_PROFILE_MAP` like `spain=es,germany=de`
- `PROFILE_SERVICE_MAP` like `us=proxy-us,de=proxy-de`

## 6) Health check

```bash
curl http://127.0.0.1:8090/healthz
```

