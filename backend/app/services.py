"""The backing services this application is configured to reach.

Each entry maps a service to the environment variable that addresses it. The
value for the two Redis entries comes from docker-compose.yml through
.env.example, so the health check reports what the running deployment can
actually reach. S3 has no local container -- it is always the real AWS
service -- so its readiness is purely whether the product owner has set the
bucket env var yet. `gemini` reports whether the only configured model
provider has its credential set; the app refuses to start without it (see
`app.gemini_client.get_config`, called from `app.main` at import time), so in
a running deployment this is always true, but the check stays here so
`/health` names the provider explicitly.
"""

import os

from app.gemini_client import gemini_status

SERVICES = {
    "redis-queue": "REDIS_URL",
    "redis": "REDIS_URL",
    "object-storage": "S3_BUCKET",
}


def configured_services() -> dict[str, bool]:
    """Each service mapped to whether its connection variable is set."""
    services = {name: bool(os.getenv(var)) for name, var in SERVICES.items()}
    services["gemini"] = gemini_status()["configured"]
    return services
