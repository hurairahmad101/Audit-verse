"""Log in to the AuditVerse.AI demo tenant and screenshot every audit page.

Assumes the demo tenant has already been provisioned (via the standard
register-organization flow) and that backend/scripts/seed_demo.py has been
run to populate realistic demo records. Outputs PNGs into
assets/pitch/screenshots/. The Chromium binary may be overridden via the
PLAYWRIGHT_CHROMIUM_PATH environment variable.
"""
from __future__ import annotations

import os
import sys
import time
from pathlib import Path

import requests
from playwright.sync_api import sync_playwright

API = "http://127.0.0.1:8000/grc"
APP = os.environ.get("FRONTEND_URL", "http://127.0.0.1:5000")
ORG = "AuditVerse Demo"
EMAIL = "admin@auditverse.ai"
USERNAME = "admin"
PASSWORD = "DemoPass!2026"
SUBDOMAIN_HINT = "auditversedemo"

OUT = Path("assets/pitch/screenshots")
OUT.mkdir(parents=True, exist_ok=True)


PAGES = [
    ("audit",         "/audit"),
    ("universe",      "/audit/universe"),
    ("plans",         "/audit/plans"),
    ("engagements",   "/audit/engagements"),
    ("workpapers",    "/audit/workpapers"),
    ("findings",      "/audit/findings"),
    ("issues",        "/audit/issues"),
    ("surveys",       "/audit/surveys"),
    ("documents",     "/audit/documents"),
    ("analytics",     "/audit/analytics"),
    ("portal",        "/audit/portal"),
    ("charter",       "/audit/charter"),
    ("ccm",           "/audit/ccm"),
    ("reporting",     "/audit/reporting"),
    ("qaip",          "/audit/qaip"),
    ("test-scripts",  "/audit/test-scripts"),
    ("skill-matrix",  "/audit/skill-matrix"),
    ("capacity",      "/audit/capacity"),
]


def ensure_tenant_and_login() -> tuple[str, str]:
    """Log in via the real /grc/auth/tenant-login endpoint and return the
    (subdomain, jwt) pair from the auth cookie. Assumes the demo tenant has
    been provisioned (via the standard register-organization flow) and that
    backend/scripts/seed_demo.py has been run to populate demo records."""
    rl = requests.post(
        f"{API}/auth/tenant-login?subdomain={SUBDOMAIN_HINT}",
        json={"username": USERNAME, "password": PASSWORD},
        timeout=15,
    )
    if rl.status_code != 200:
        raise RuntimeError(
            f"tenant-login failed status={rl.status_code} body={rl.text[:300]}"
        )
    token = rl.cookies.get("grc_auth_token")
    if not token:
        raise RuntimeError("login succeeded but no auth cookie was returned")
    print(f"[auth] login ok subdomain={SUBDOMAIN_HINT} cookie-len={len(token)}")
    return SUBDOMAIN_HINT, token


def capture_all(token: str):
    with sync_playwright() as p:
        # Resolve Chromium binary: explicit env var first, then PATH lookup,
        # then a known nix-store fallback, finally let Playwright choose.
        import shutil as _sh
        chrome = (
            os.environ.get("PLAYWRIGHT_CHROMIUM_PATH")
            or _sh.which("chromium")
            or _sh.which("chromium-browser")
            or _sh.which("google-chrome")
        )
        launch_kwargs = {
            "headless": True,
            "args": ["--no-sandbox", "--disable-dev-shm-usage"],
        }
        if chrome:
            launch_kwargs["executable_path"] = chrome
            print(f"[browser] using {chrome}")
        browser = p.chromium.launch(**launch_kwargs)
        # Task spec: capture each module page at true 1920x1080 (16:9) so
        # embedded screenshots match standard client-demo geometry exactly.
        # device_scale_factor must stay at 1 — a higher DPR would emit a
        # 3840x2160 image on disk, violating the spec.
        ctx = browser.new_context(viewport={"width": 1920, "height": 1080},
                                   device_scale_factor=1)
        # Set auth cookie for both 127.0.0.1 and localhost
        for host in ["127.0.0.1", "localhost"]:
            ctx.add_cookies([{
                "name": "grc_auth_token", "value": token,
                "domain": host, "path": "/",
                "httpOnly": False, "secure": False, "sameSite": "Lax",
            }])
        page = ctx.new_page()
        for name, path in PAGES:
            url = APP + path
            print(f"[shot] {name:14s} -> {url}")
            try:
                page.goto(url, wait_until="networkidle", timeout=20000)
            except Exception as e:
                print(f"  warn: {e}")
                try:
                    page.goto(url, wait_until="domcontentloaded", timeout=15000)
                except Exception as e2:
                    print(f"  fail: {e2}")
                    continue
            page.wait_for_timeout(1500)
            out = OUT / f"{name}.png"
            try:
                page.screenshot(path=str(out), full_page=False)
                print(f"  saved {out} ({out.stat().st_size} bytes)")
            except Exception as e:
                print(f"  shot fail: {e}")
        browser.close()


if __name__ == "__main__":
    sub, token = ensure_tenant_and_login()
    capture_all(token)
    print("done")
