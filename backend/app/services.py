"""The backing services this application is configured to reach.

Each entry maps a service to the environment variable that addresses it. The
value for the two Redis entries comes from docker-compose.yml through
.env.example, so the health check reports what the running deployment can
actually reach. S3 has no local container -- it is always the real AWS
service -- so its readiness is purely whether the product owner has set the
bucket env var yet. `gemini` reports whether the only configured model
provider has an API key -- saved on the Settings page or, as a fallback, set
as `GEMINI_API_KEY` (see `app.gemini_client.resolve_api_key`). It is false
on a fresh deployment until someone saves a key.
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
