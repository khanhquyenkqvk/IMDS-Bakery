"""APScheduler setup for background jobs."""
import os
from apscheduler.schedulers.background import BackgroundScheduler
from backend.services.expiry_notifications import send_near_expiry_email

_scheduler = BackgroundScheduler()
_started = False


def _wrap_with_app(app, func):
    """Ensure scheduled job runs inside Flask app context."""
    def _job():
        with app.app_context():
            func()
    return _job


def start_scheduler(app):
    """Start scheduler once; safe against double-start in debug reload."""
    global _started
    if _started:
        return _scheduler

    # Run daily at 06:00 by default (overridable via env)
    hour = int(os.getenv("ALERT_CRON_HOUR", 6))
    minute = int(os.getenv("ALERT_CRON_MINUTE", 0))

    if not _scheduler.get_job("near_expiry_email"):
        _scheduler.add_job(
            _wrap_with_app(app, send_near_expiry_email),
            "cron",
            hour=hour,
            minute=minute,
            id="near_expiry_email",
            replace_existing=True,
        )

    _scheduler.start()
    _started = True
    return _scheduler
