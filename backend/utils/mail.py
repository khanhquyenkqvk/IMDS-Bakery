"""Thin wrapper around Flask-Mail."""
from flask_mail import Mail, Message
import logging

mail = Mail()


def init_mail(app):
    """Bind Flask-Mail to the app."""
    mail.init_app(app)


def send_email(subject: str, recipients, body: str, html: str = None):
    """Send an email if recipients provided."""
    if not recipients:
        return
    msg = Message(subject=subject, recipients=recipients, body=body, html=html)
    logging.info("Sending email to %s with subject '%s'", recipients, subject)
    mail.send(msg)
