"""End-to-end tap-flow verification for BLACKBOX (development only).

Drives the REAL user journeys in a headless browser: first-run PIN setup,
unlock, tab navigation, add secret, reveal, sort, TOTP import, change PIN,
re-lock, and unlock with the new PIN. Asserts state at each step.
"""
import sys
import time
from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:8765/index.html"
failures = []
errors = []


def check(cond, msg):
    print(("  OK  " if cond else "  FAIL ") + msg, flush=True)
    if not cond:
        failures.append(msg)


def visible(page, sel):
    try:
        return page.locator(sel).first.is_visible()
    except Exception:
        return False


def tap_digits(page, digits, selector="#numpad .num-key[data-digit]"):
    for d in digits:
        page.locator(f'{selector}[data-digit="{d}"]').first.click()
        page.wait_for_timeout(60)


def dialog_text(page):
    return page.locator("#promptModal .modal-title, #infoModal .modal-title").all_text_contents()


def wait_until(page, predicate, timeout_ms=30000, interval_ms=200):
    """Poll real state instead of guessing how long PBKDF2 takes on this host."""
    deadline = time.monotonic() + timeout_ms / 1000
    while time.monotonic() < deadline:
        try:
            if predicate():
                return True
        except Exception:
            pass
        page.wait_for_timeout(interval_ms)
    return False


with sync_playwright() as p:
    browser = p.chromium.launch(channel="chrome", headless=True)
    page = browser.new_page(viewport={"width": 390, "height": 844})
    page.on("pageerror", lambda e: errors.append("pageerror: " + str(e)))
    page.on("console", lambda m: errors.append("console: " + m.text) if m.type == "error" else None)

    page.goto(URL, wait_until="load")
    page.wait_for_timeout(500)

    # ── 1. First run: setup modal appears ──
    check(visible(page, "#setupPinModal"), "first run shows PIN setup modal")
    check(page.evaluate("localStorage.getItem('bb_pin') === null"), "no PIN stored before setup")

    # ── 2. Enter PIN + confirm ──
    tap_digits(page, "1357", "#setupPinModal .num-key[data-digit]")
    page.wait_for_timeout(250)
    check(visible(page, "#confirmPinModal"), "4th digit opens confirm step")
    tap_digits(page, "1357", "#confirmPinModal .num-key[data-digit]")
    # PBKDF2 verifier (~150k) + the 380ms unlock fade. Wait on state, not a guess.
    # Use a locator wait: CSP deliberately forbids eval()-style JS strings.
    page.locator("#mainApp").wait_for(state="visible", timeout=10000)
    pin = page.evaluate("localStorage.getItem('bb_pin')")
    check(bool(pin) and pin.startswith("pbkdf2$"), "setup stores a PBKDF2 verifier")

    # ── 3. App opens ──
    check(visible(page, "#mainApp"), "after setup, main app is visible")
    check(not visible(page, "#lockScreen"), "lock screen hidden after setup")

    # ── 4. Navigate to Secrets via bottom nav ──
    page.locator('.nav-btn[data-tab="secrets"]').click()
    page.wait_for_timeout(250)
    check(visible(page, "#tab-secrets"), "Secrets tab opens on nav tap")
    check(page.evaluate("document.querySelector('.nav-btn[data-tab=secrets]').getAttribute('aria-current')") == "page",
          "active nav carries aria-current")

    # ── 5. Add a secret through the real form ──
    page.locator("#addSecretBtn").click()
    page.wait_for_timeout(200)
    check(visible(page, "#secretForm"), "Add opens the secret form")
    page.fill("#secretName", "Zebra API")
    page.fill("#secretValue", "zk_live_abcdef")
    page.select_option("#secretCategory", "api")
    page.locator('#secretForm button[type="submit"]').click()
    page.wait_for_timeout(400)
    check(page.evaluate("!!localStorage.getItem('bb_secrets')"), "saving writes encrypted secrets store")
    check("zk_live_abcdef" not in page.evaluate("localStorage.getItem('bb_secrets')"),
          "secret value is not plaintext at rest")

    # second secret to test sorting
    page.locator("#addSecretBtn").click()
    page.wait_for_timeout(150)
    page.fill("#secretName", "Alpha DB")
    page.fill("#secretValue", "db_secret_123")
    page.select_option("#secretCategory", "password")
    page.locator('#secretForm button[type="submit"]').click()
    page.wait_for_timeout(350)

    # ── 6. Sorting actually changes visible order ──
    def card_names():
        return page.locator("#tab-secrets .secret-item-name").all_text_contents()
    names_before = card_names()
    page.select_option("#secretSort", "category")
    page.wait_for_timeout(250)
    names_sorted = card_names()
    print("  names default:", names_before, "category-sorted:", names_sorted)
    check(names_sorted != names_before, "sort control changes visible order")
    page.select_option("#secretSort", "recent")
    page.wait_for_timeout(150)

    # ── 7. Reveal a secret (read-first detail) ──
    first = page.locator("#tab-secrets .secret-item, #tab-secrets .secret-card").first
    if first.count():
        first.click()
        page.wait_for_timeout(200)
        check(visible(page, "#secretDetailView"), "tapping a secret opens detail view")
        page.locator("#secretDetailClose").click()
        page.wait_for_timeout(200)
        check(not visible(page, "#secretDetailView"), "detail Close returns to the list")

    # ── 8. TOTP import by real button ──
    page.locator('.nav-btn[data-tab="auth"]').click()
    page.wait_for_timeout(200)
    check(visible(page, "#importTotpUriBtn"), "Import otpauth button is visible")
    page.locator("#importTotpUriBtn").click()
    page.wait_for_timeout(200)
    check(visible(page, "#promptModal"), "Import opens the prompt dialog")
    page.fill("#promptInput", "otpauth://totp/GitHub:alice@example.com?secret=JBSWY3DPEHPK3PXP&issuer=GitHub&digits=6")
    page.locator("#promptOk").click()
    page.wait_for_timeout(500)
    check(page.evaluate("!!localStorage.getItem('bb_auth')"), "imported TOTP is stored encrypted")
    check("JBSWY3DPEHPK3PXP" not in page.evaluate("localStorage.getItem('bb_auth')"),
          "TOTP secret is not plaintext at rest")

    # ── 9. Change PIN through settings prompts ──
    page.locator('.nav-btn[data-tab="settings"]').click()
    page.wait_for_timeout(200)
    page.locator("#changePinBtn").click()
    for value in ["1357", "2468", "2468"]:
        page.locator("#promptModal").wait_for(state="visible", timeout=15000)
        page.fill("#promptInput", value)
        page.locator("#promptOk").click()
        page.wait_for_timeout(150)
    # PIN change derives two KDF keys, reseals every store and hashes the new
    # verifier. That is several PBKDF2 runs; wait for the verifier itself.
    changed = wait_until(
        page,
        lambda: page.evaluate("p => localStorage.getItem('bb_pin') !== p", pin),
        timeout_ms=45000,
    )
    newpin = page.evaluate("localStorage.getItem('bb_pin')")
    check(changed and newpin.startswith("pbkdf2$"), "change PIN writes a new PBKDF2 verifier")
    check(page.evaluate("Vault.isUnlocked()"), "vault stays usable after PIN change")

    # ── 10. Lock via panic mode -> 5 taps (real UI path) ──
    page.locator("#panicBtn").click()
    page.wait_for_timeout(250)
    check(visible(page, "#panicOverlay"), "panic button shows the decoy calculator")
    for i in range(5):
        page.locator("#panicOverlay").click(position={"x": 20, "y": 20})
        page.wait_for_timeout(80)
    page.wait_for_timeout(300)
    check(not page.evaluate("Vault.isUnlocked()"), "panic exit sequence locks the vault")
    check(visible(page, "#lockScreen"), "lock screen returns after panic exit")

    # ── 11. Old PIN rejected, new PIN unlocks, data intact ──
    tap_digits(page, "1357")
    rejected = wait_until(
        page,
        lambda: "Attempt" in page.locator("#lockAttemptInfo").inner_text(),
        timeout_ms=20000,
    )
    check(rejected and not page.evaluate("Vault.isUnlocked()"), "old PIN no longer unlocks")
    page.wait_for_timeout(200)

    tap_digits(page, "2468")
    page.locator("#mainApp").wait_for(state="visible", timeout=45000)
    check(page.evaluate("Vault.isUnlocked()"), "new PIN unlocks the vault")
    check(visible(page, "#mainApp"), "main app returns after re-unlock")
    page.locator('.nav-btn[data-tab="secrets"]').click()
    page.wait_for_timeout(300)
    check(page.locator("#tab-secrets").inner_text().find("Alpha DB") >= 0 or
          page.locator("#tab-secrets").inner_text().find("Zebra") >= 0,
          "secrets survive PIN change + lock/unlock")

    # ── 12. Auto-lock timeout setting is respected ──
    page.locator('.nav-btn[data-tab="settings"]').click()
    page.wait_for_timeout(150)
    check(page.locator("#autoLockTimeout").count() == 1, "auto-lock timeout selector exists")
    page.select_option("#autoLockTimeout", "0")
    page.wait_for_timeout(150)
    check(page.evaluate("JSON.parse(localStorage.getItem('bb_settings')).autoLockMs") == 0,
          "Never setting persists")

    check(len(errors) == 0, "no runtime errors during full journey: " + " | ".join(errors[:3]))
    browser.close()

print("")
if failures:
    print(f"FAILED: {len(failures)} end-to-end check(s).")
    sys.exit(1)
print("End-to-end flow checks passed.")
