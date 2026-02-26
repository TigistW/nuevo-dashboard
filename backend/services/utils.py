from __future__ import annotations

import random
import re
from datetime import datetime


RAM_PATTERN = re.compile(r"^\s*(\d+)\s*(mb|m|gb|g)?\s*$", re.IGNORECASE)
CPU_PATTERN = re.compile(r"^\s*(\d+)\s*$")


def parse_ram_to_mb(value: str) -> int:
    match = RAM_PATTERN.match(value)
    if not match:
        raise ValueError(f"Invalid RAM value '{value}'. Use formats like '512', '512MB', or '2GB'.")

    amount = int(match.group(1))
    unit = (match.group(2) or "mb").lower()
    if unit in {"gb", "g"}:
        amount *= 1024
    return amount


def parse_cpu_cores(value: str) -> int:
    match = CPU_PATTERN.match(value)
    if not match:
        raise ValueError(f"Invalid CPU value '{value}'. Use integer core values like '1' or '4'.")
    cores = int(match.group(1))
    if cores <= 0:
        raise ValueError("CPU cores must be greater than zero.")
    return cores


def ram_mb_to_text(ram_mb: int) -> str:
    if ram_mb % 1024 == 0:
        return f"{ram_mb // 1024}GB"
    return f"{ram_mb}MB"


def cpu_to_text(cpu_cores: int) -> str:
    return str(cpu_cores)


def seconds_to_uptime(seconds: int) -> str:
    if seconds <= 0:
        return "0m"

    hours = seconds // 3600
    minutes = (seconds % 3600) // 60
    if hours <= 0:
        return f"{minutes}m"
    return f"{hours}h {minutes}m"


def isoformat_or_none(value: datetime | None) -> str | None:
    if value is None:
        return None
    return value.isoformat()


def generate_public_ip(seed: str | None = None) -> str:
    rng = random.Random(seed or datetime.utcnow().isoformat())
    return f"{rng.randint(23, 223)}.{rng.randint(0, 255)}.{rng.randint(0, 255)}.{rng.randint(1, 254)}"


def estimate_latency_ms(country: str) -> int:
    table = {
        "spain": 45,
        "usa": 120,
        "japan": 280,
        "germany": 75,
        "france": 65,
        "uk": 70,
    }
    return table.get(country.lower(), 110)


def normalize_country(country: str) -> str:
    return country.strip().title()


def short_code(country: str) -> str:
    cleaned = "".join(ch for ch in country.lower() if ch.isalpha())
    if len(cleaned) < 2:
        return "xx"
    return cleaned[:2]
