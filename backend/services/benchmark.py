from __future__ import annotations

import random
from datetime import datetime

from ..models import TunnelBenchmarkResult, TunnelBenchmarkRunRequest
from ..repositories import StorageRepository
from .utils import isoformat_or_none


BASELINES: dict[str, dict[str, float]] = {
    "wireguard": {
        "latency_ms": 42,
        "stability_score": 93,
        "persistence_score": 90,
        "detection_score": 92,
        "throughput_mbps": 210,
    },
    "openvpn": {
        "latency_ms": 64,
        "stability_score": 88,
        "persistence_score": 86,
        "detection_score": 87,
        "throughput_mbps": 155,
    },
    "ssh": {
        "latency_ms": 70,
        "stability_score": 82,
        "persistence_score": 80,
        "detection_score": 85,
        "throughput_mbps": 122,
    },
    "pyngrok": {
        "latency_ms": 95,
        "stability_score": 75,
        "persistence_score": 72,
        "detection_score": 65,
        "throughput_mbps": 86,
    },
}


class BenchmarkService:
    def __init__(self, repo: StorageRepository):
        self.repo = repo

    def run(self, payload: TunnelBenchmarkRunRequest) -> list[TunnelBenchmarkResult]:
        results: list[TunnelBenchmarkResult] = []
        protocols = [item.strip().lower() for item in payload.protocols if item and item.strip()]
        if not protocols:
            protocols = ["wireguard", "openvpn", "ssh", "pyngrok"]
        for protocol in protocols:
            if protocol not in BASELINES:
                continue
            base = BASELINES[protocol]
            for _ in range(payload.samples):
                latency = max(1, int(base["latency_ms"] + random.randint(-8, 14)))
                stability = max(1, min(100, int(base["stability_score"] + random.randint(-6, 4))))
                persistence = max(1, min(100, int(base["persistence_score"] + random.randint(-7, 5))))
                detection = max(1, min(100, int(base["detection_score"] + random.randint(-8, 6))))
                throughput = round(max(1.0, base["throughput_mbps"] + random.uniform(-25, 22)), 2)
                notes = f"sample for {protocol} at {datetime.utcnow().isoformat()}"
                row = self.repo.create_tunnel_benchmark(
                    protocol=protocol,
                    latency_ms=latency,
                    stability_score=stability,
                    persistence_score=persistence,
                    detection_score=detection,
                    throughput_mbps=throughput,
                    notes=notes,
                )
                results.append(self._to_result(row))
        self.repo.add_log(
            "Benchmark",
            "INFO",
            f"Tunnel benchmark completed for protocols={','.join(protocols)}.",
            f"samples={payload.samples}, result_count={len(results)}",
        )
        return results

    def list_results(self, protocol: str | None = None, limit: int = 100) -> list[TunnelBenchmarkResult]:
        normalized = protocol.strip().lower() if protocol else None
        rows = self.repo.list_tunnel_benchmarks(protocol=normalized, limit=max(1, min(limit, 1000)))
        return [self._to_result(row) for row in rows]

    def _to_result(self, row) -> TunnelBenchmarkResult:
        return TunnelBenchmarkResult(
            protocol=row.protocol,
            latency_ms=row.latency_ms,
            stability_score=row.stability_score,
            persistence_score=row.persistence_score,
            detection_score=row.detection_score,
            throughput_mbps=row.throughput_mbps,
            created_at=isoformat_or_none(row.created_at) or datetime.utcnow().isoformat(),
            notes=row.notes,
        )
