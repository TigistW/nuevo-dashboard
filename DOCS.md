
# Diseño Técnico: Orquestador de Micro-VMs Colab Farm

## 1. Arquitectura Modular
El sistema se divide en tres capas desacopladas:
- **Frontend (React/Vite)**: Interfaz de usuario para control y monitorización.
- **Backend (FastAPI)**: API REST que actúa como puente entre el dashboard y el sistema operativo.
- **Capa de Ejecución (Firecracker + Ansible)**: El motor que realmente lanza las micro-VMs y configura la red.

## 2. Estructura de Carpetas
```text
/
├── backend/                # FastAPI Backend
│   ├── main.py             # Punto de entrada
│   ├── routers/            # Endpoints modulares
│   ├── models.py           # Modelos Pydantic
│   └── services/           # Lógica de Firecracker y Ansible
├── src/                    # React Frontend
│   ├── pages/              # Nuevas páginas (MicroVMs, Network, Security)
│   └── components/         # Componentes UI modulares
├── ansible/                # Playbooks de automatización
│   ├── setup_vm.yml        # Configuración de Alpine en micro-VM
│   └── setup_wg.yml        # Configuración de túneles WireGuard
└── scripts/                # Scripts de integración (firectl wrappers)
```

## 3. Flujo de Llamadas Backend
1. `POST /api/v1/orchestrator/create` -> Recibe parámetros.
2. `ansible-playbook setup_vm.yml` -> Prepara el rootfs de Alpine.
3. `firectl --kernel vmlinux --root-drive alpine.ext4` -> Lanza micro-VM.
4. `ip netns exec <ns> wg-quick up <conf>` -> Asocia red aislada.

## 4. Scripts Base de Integración (Ejemplo firectl)
```bash
#!/bin/bash
# scripts/launch_vm.sh
VM_ID=$1
TAP_DEV="tap-${VM_ID}"
NS_NAME="ns-${VM_ID}"

# Crear Namespace y Tap
ip netns add $NS_NAME
ip link add $TAP_DEV type veth peer name veth-eth0
ip link set veth-eth0 netns $NS_NAME
# ... configuración de ruteo nftables ...

# Lanzar con firectl
firectl --id=$VM_ID \
        --kernel=./vmlinux \
        --root-drive=./rootfs.ext4 \
        --tap-device=$TAP_DEV \
        --memory=128 \
        --ncpus=1
```

## 5. Dependencias Mínimas (Ubuntu 24.04)
- `firecracker`, `firectl`
- `ansible`
- `wireguard`, `wireguard-tools`
- `python3-fastapi`, `uvicorn`
- `nftables`, `iproute2`

## 6. Riesgos Técnicos Reales
- **Nested Virtualization**: Dependiendo del hipervisor del host físico, el rendimiento de Firecracker puede verse afectado si no hay soporte VT-x/AMD-V completo.
- **Agotamiento de IPs/Namespaces**: Escalar a cientos de micro-VMs requiere una gestión cuidadosa de los rangos de IP privadas (10.x.x.x) para evitar colisiones.
- **I/O Bottleneck**: Cientos de micro-VMs escribiendo en disco simultáneamente pueden saturar el bus de I/O si no se usan discos NVMe con IOPS altos.

## 7. Tiempo Estimado por Fase
- **Fase 1 (UI & API Skeleton)**: 2 días (Completado en este diseño).
- **Fase 2 (Integración Firecracker/firectl)**: 5 días.
- **Fase 3 (Networking & WireGuard Isolation)**: 4 días.
- **Fase 4 (Ansible Automation & Hardening)**: 3 días.
- **Total**: ~2 semanas para un MVP estable.

## 8. Aclaración Técnica: Simulación vs Realidad
Para mantener la transparencia técnica, el sistema distingue entre lo que se genera localmente y lo que es una identidad real en Internet:

| Elemento | Estado | Razón Técnica |
| :--- | :--- | :--- |
| **Hardware (CPU/RAM)** | Simulado | Firecracker emula dispositivos VirtIO sobre KVM. |
| **Kernel Linux** | Simulado | Cada micro-VM carga su propio binario vmlinux. |
| **Red Interna** | Simulado | Se usan `tap devices` y `veth pairs` en namespaces aislados. |
| **IP Pública** | **Real** | El tráfico sale a través de un túnel WireGuard hacia un VPS/Nodo externo. |
| **ISP / ASN** | **Real** | Los servicios externos ven la identidad del nodo de salida, no del host. |
| **Geolocalización** | **Real** | Basada en la ubicación física del servidor de salida (Exit Node). |

### Limitación de IPs Residenciales
Una IP residencial real **no puede generarse por software** dentro de un centro de datos. Requiere:
1. Una conexión física a un ISP residencial (DSL/Fibra).
2. El uso de un proxy residencial o un nodo de salida (Exit Node) ubicado en una vivienda real.
El dashboard permite registrar estos nodos externos para "proyectar" esa identidad hacia las micro-VMs locales.

## 9. Capas Avanzadas de Inteligencia y Estabilidad
Se han añadido las siguientes capas modulares para profesionalizar la operativa:

### 9.1. System Intelligence & Telemetry
- **Panel Global**: Monitorización en tiempo real de micro-VMs, túneles, IPs y recursos del host.
- **Telemetría Histórica**: Almacenamiento ligero de métricas de estabilidad y rendimiento por nodo.

### 9.2. Auto-Healing Engine (Watchdog)
- Servicio observador independiente que aplica reglas de recuperación:
    - Reconexión automática de túneles caídos.
    - Reinicio de VMs si el endpoint interno no responde.
    - Recreación de instancias ante cambios inesperados de IP pública.

### 9.3. Governance & Resource Guardrails
- **Template Manager**: Versionado de imágenes Alpine y snapshots para despliegues consistentes.
- **Resource Guardrails**: Límites globales para proteger la estabilidad del host (RAM mínima reservada, límite de VMs simultáneas).
- **Fingerprint Manager**: Alineación de timezone, locale y DNS con la geolocalización del nodo de salida.

### 9.4. Orchestration & Simulation
- **Distributed Task Scheduler**: Cola de trabajos con balanceo de carga entre micro-VMs disponibles.
- **Deployment Simulator**: Validación previa de recursos y conflictos antes de la ejecución real.

## 10. Flujo de Comunicación Avanzado
1. **Watchdog Service** -> Monitorea `/api/v1/intelligence/metrics`.
2. **Trigger Detectado** -> Llama a `/api/v1/automation/healing/execute`.
3. **Scheduler** -> Distribuye tareas vía `/api/v1/automation/scheduler/jobs`.
4. **Simulator** -> Valida contra `/api/v1/governance/guardrails` antes de lanzar `firectl`.

## 11. Riesgos Técnicos y Limitaciones
- **Sobrecarga de I/O**: El versionado de plantillas y snapshots puede saturar el disco si no se gestionan correctamente los deltas.
- **Latencia de Watchdog**: Un intervalo de chequeo muy corto puede generar carga innecesaria; se recomienda un enfoque basado en eventos siempre que sea posible.
- **Consistencia de Fingerprint**: Algunos servicios avanzados de detección pueden identificar discrepancias si el kernel virtualizado no oculta perfectamente ciertos parámetros de hardware (aunque se mitiga con Firecracker).


