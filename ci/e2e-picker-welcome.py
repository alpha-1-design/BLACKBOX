"""Focused browser verification for two recent UX fixes.

1. Welcome-back only appears for a returning vault (never on first run) and
   fades on its own.
2. Opening the journal photo picker does not lock the vault when Android
   fires visibilitychange, and the imported photo is encrypted + attached.
"""
import os
import sys
from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:8765/index.html"
PHOTO = os.path.abspath(os.path.join(
    os.path.dirname(__file__), "..", "fastlane", "metadata", "android", "en-US", "images", "icon.png"
))
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


def tap(page, digits, root="#numpad"):
    for d in digits:
        page.locator(f'{root} .num-key[data-digit="{d}"]').first.click()
        page.wait_for_timeout(60)


def set_hidden(page, hidden):
    """Simulate the WebView being backgrounded without changing tab focus."""
    page.evaluate(
        """h => {
          Object.defineProperty(document, 'hidden', {configurable: true, get: () => h});
          document.dispatchEvent(new Event('visibilitychange'));
        }""",
        hidden,
    )


with sync_playwright() as p:
    browser = p.chromium.launch(channel="chrome", headless=True)
    context = browser.new_context(viewport={"width": 390, "height": 844})
    page = context.new_page()
    page.on("pageerror", lambda e: errors.append("pageerror: " + str(e)))
    page.on("console", lambda m: errors.append("console: " + m.text) if m.type == "error" else None)

    page.goto(URL, wait_until="load")
    page.wait_for_timeout(500)

    # ── Welcome-back: first run must not greet a user who has no vault yet ──
    check(visible(page, "#setupPinModal"), "first run shows setup")
    check(not visible(page, "#lockWelcome"), "first run does not show welcome-back")

    tap(page, "1357", "#setupPinModal")
    page.wait_for_timeout(200)
    tap(page, "1357", "#confirmPinModal")
    page.locator("#mainApp").wait_for(state="visible", timeout=10000)
    check(not visible(page, "#lockWelcome"), "welcome-back hidden after first setup")

    # Reload = returning launch. PIN exists, so the lock screen greets the user.
    page.reload(wait_until="load")
    page.wait_for_timeout(700)
    check(visible(page, "#lockWelcome"), "returning launch shows welcome-back")
    text = page.locator("#lockWelcome").inner_text().strip()
    print("  welcome text:", text)
    check("welcome back" in text.lower(), "welcome text says welcome back")
    page.wait_for_timeout(5200)
    check(not visible(page, "#lockWelcome"), "welcome-back fades after 5 seconds")

    tap(page, "1357")
    page.locator("#mainApp").wait_for(state="visible", timeout=10000)
    check(True, "returning user unlocks after welcome")

    # ── Journal photo picker: backgrounding must not wipe the draft ──
    page.locator('.nav-btn[data-tab="journal"]').click()
    page.wait_for_timeout(200)
    page.locator("#addEntryBtn").click()
    page.wait_for_timeout(150)
    page.fill("#journalTitle", "Photo note")
    page.fill("#journalBody", "Attached from the Photos action.")

    with page.expect_file_chooser() as chooser_info:
        page.locator("#journalPhotosBtn").click()
    chooser = chooser_info.value
    set_hidden(page, True)
    page.wait_for_timeout(250)
    check(page.evaluate("Vault.isUnlocked()"), "photo picker backgrounding does not lock vault")
    check(visible(page, "#journalModal"), "journal form stays open while picker is active")
    check(page.input_value("#journalTitle") == "Photo note", "draft title survives picker backgrounding")

    chooser.set_files(PHOTO)
    page.wait_for_timeout(700)
    check(page.locator("#journalThumbs .jthumb").count() == 1, "picked photo appears as a thumbnail")
    check(page.evaluate("Vault.isUnlocked()"), "photo import does not lock vault")
    check(page.input_value("#journalBody") == "Attached from the Photos action.", "draft body survives import")

    page.locator('#journalForm button[type="submit"]').click()
    page.wait_for_timeout(500)
    stored = page.evaluate("JSON.parse(localStorage.getItem('bb_journal') || '{}')")
    has_photo = any(isinstance(e.get("images"), list) and len(e["images"]) == 1 for e in stored.values())
    check(has_photo, "saved journal entry keeps the encrypted photo attachment")

    # Once the picker closes, normal backgrounding locks again.
    set_hidden(page, True)
    page.wait_for_timeout(300)
    check(not page.evaluate("Vault.isUnlocked()"), "background lock resumes after picker closes")

    check(len(errors) == 0, "no runtime errors: " + " | ".join(errors[:4]))
    browser.close()

print("")
if failures:
    print(f"FAILED: {len(failures)} picker/welcome check(s).")
    sys.exit(1)
print("Picker + welcome-back checks passed.")
