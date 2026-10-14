from __future__ import annotations

from math import ceil
from datetime import datetime, timezone
from typing import Iterable

BASE_MINUTES = {1: 15, 2: 30, 3: 45, 4: 60}
BUFFER = 1.15


def estimate_waits(visits: Iterable[dict], on_duty_doctors: int, now: datetime | None = None) -> dict[str, int]:
    current = now or datetime.now(timezone.utc)
    staff = max(1, int(on_duty_doctors or 0))
    rows = []
    for visit in visits:
        tier = int(visit.get("priority_level") or 4)
        tier = max(1, min(4, tier))
        status = visit.get("status")
        queued_at = visit.get("queued_at")
        if isinstance(queued_at, str):
            queued_at = datetime.fromisoformat(queued_at.replace("Z", "+00:00"))
        if queued_at and queued_at.tzinfo is None:
            queued_at = queued_at.replace(tzinfo=timezone.utc)
        waited = max(0.0, (current - queued_at).total_seconds() / 60.0) if queued_at else 0.0
        if status == "Waiting":
            remaining = max(BASE_MINUTES[tier] - waited, 3.0)
        elif status == "In-Consultation":
            remaining = max(0.5 * BASE_MINUTES[tier], 3.0)
        else:
            continue
        rows.append((tier, remaining))

    estimates: dict[str, int] = {}
    for target in range(1, 5):
        minutes = sum(value for tier, value in rows if tier <= target)
        estimates[str(target)] = ceil((minutes / staff) * BUFFER)
    return estimates
