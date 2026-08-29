#!/usr/bin/env python3
"""Interactive Razorpay Test Mode Payment Link Generator.

Uses the RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET from .env to:
1. Create a real Razorpay Test Mode Payment Link.
2. Output the direct payment URL so you can open it in your browser.
3. Test successful payments or simulated issuer failures in Razorpay Checkout.
"""

from __future__ import annotations

import base64
import json
import os
import sys
import time
import urllib.request
import urllib.error

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")


def load_env() -> dict[str, str]:
    """Parse local .env file."""
    env_path = os.path.join(os.path.dirname(__file__), "..", ".env")
    env_vars = {}
    if os.path.exists(env_path):
        with open(env_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    env_vars[k.strip()] = v.strip().strip('"').strip("'")
    return env_vars


def create_payment_link(key_id: str, key_secret: str, amount_inr: float = 1500.0, description: str = "Salvage Recovery Demo") -> dict:
    """Create a real Razorpay Standard Payment Link in Test Mode."""
    url = "https://api.razorpay.com/v1/payment_links"
    amount_paise = int(amount_inr * 100)

    payload = {
        "amount": amount_paise,
        "currency": "INR",
        "accept_partial": False,
        "description": description,
        "customer": {
            "name": "Demo Customer",
            "email": "customer@salvage.local",
            "contact": "+919876543210"
        },
        "notify": {
            "sms": False,
            "email": False
        },
        "reminder_enable": False,
        "notes": {
            "source": "Salvage Recovery Engine",
            "policy_version": "v1.4.0",
            "attempt_ref": f"att_demo_{int(time.time())}"
        }
    }

    data = json.dumps(payload).encode("utf-8")
    auth_str = f"{key_id}:{key_secret}"
    auth_b64 = base64.b64encode(auth_str.encode("utf-8")).decode("utf-8")

    req = urllib.request.Request(
        url,
        data=data,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Basic {auth_b64}"
        },
        method="POST"
    )

    try:
        with urllib.request.urlopen(req) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        error_body = e.read().decode("utf-8")
        print(f"\033[31m[Razorpay API Error {e.code}]:\033[0m {error_body}")
        sys.exit(1)


def main():
    env = load_env()
    key_id = env.get("RAZORPAY_KEY_ID")
    key_secret = env.get("RAZORPAY_KEY_SECRET")

    if not key_id or not key_secret:
        print("\033[31mError: RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET missing in .env\033[0m")
        sys.exit(1)

    print("=" * 75)
    print("RAZORPAY LIVE TEST MODE PAYMENT LINK GENERATOR")
    print("=" * 75)
    print(f"[*] Authenticating with Key ID: {key_id[:12]}...")

    amount = 1500.0
    print(f"[*] Generating Razorpay Standard Payment Link for ₹{amount:,.2f}...")
    res = create_payment_link(key_id, key_secret, amount_inr=amount)

    short_url = res.get("short_url")
    payment_link_id = res.get("id")
    status = res.get("status")

    print("\n" + "\033[32m[SUCCESS] Real Razorpay Test Mode Payment Link Created!\033[0m")
    print("-" * 75)
    print(f"  Payment Link ID : {payment_link_id}")
    print(f"  Status          : {status}")
    print(f"  Amount          : ₹{amount:,.2f} ({res.get('amount')} paise)")
    print(f"  \033[1;36mCheckout URL    : {short_url}\033[0m")
    print("-" * 75)
    print("\n👉 \033[1;33mHOW TO TEST LIVE IN YOUR BROWSER:\033[0m")
    print(f"1. Open this URL in your browser: \033[1;36m{short_url}\033[0m")
    print("2. You will see the official Razorpay Checkout page in Test Mode.")
    print("3. You can select UPI, Cards, or NetBanking to simulate test success or test declines.")
    print("4. Check your Razorpay Dashboard (Test Mode -> Payment Links) to see the transaction live!")
    print("=" * 75)


if __name__ == "__main__":
    main()
