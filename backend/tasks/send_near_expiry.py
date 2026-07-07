"""
Trigger near-expiry email via the running API.
Can be scheduled by Task Scheduler (Windows) or cron.
"""
import os
import sys
import requests

API_URL = os.getenv("ALERT_URL", "https://imdsbakery.id.vn/api/alerts/email/near-expiry")
ALERT_DAYS = int(os.getenv("ALERT_DAYS", 7))
TIMEOUT = int(os.getenv("ALERT_TIMEOUT", 30))


def main():
    try:
        resp = requests.post(
            API_URL,
            json={"days": ALERT_DAYS},
            timeout=TIMEOUT,
        )
        print("Status:", resp.status_code)
        print("Response:", resp.text)
        resp.raise_for_status()
    except Exception as exc:
        print("Error sending near-expiry email:", exc, file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
