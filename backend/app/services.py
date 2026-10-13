"""The backing services this application is configured to reach.

Each entry maps a service to the environment variable that addresses it. The
value for the two Redis entries comes from docker-compose.yml through
.env.example, so the health check reports what the running deployment can
actually reach. S3 has no local container -- it is always the real AWS
service -- so its readiness is purely whether the product owner has set the
bucket env var yet.
"""

import os

SERVICES = {
    "redis-queue": "REDIS_URL",
    "redis": "REDIS_URL",
    "object-storage": "S3_BUCKET",
}


def configured_services() -> dict[str, bool]:
    """Each service mapped to whether its connection variable is set."""
    return {name: bool(os.getenv(var)) for name, var in SERVICES.items()}
