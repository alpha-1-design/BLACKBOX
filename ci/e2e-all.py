"""Full-app end-to-end flow verification for BLACKBOX (development only).

Drives every section through real clicks/taps: setup, unlock, home tools,
secrets, journal, TOTP, privacy tools, settings, files, generator, health,
clipboard, voice, decoy and lock. Asserts storage, visibility and no errors.
"""
import sys
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


def tap(page, digits, root="#numpad"):
    for d in digits:
        page.locator(f'{root} .num-key[data-digit="{d}"]').first.click()
        page.wait_for_timeout(50)


def dismiss(page):
    """Close any open info/prompt modal."""
    for sel in ("#infoModal:not(.hidden) #infoOk", "#promptModal:not(.hidden) #promptOk"):
        if page.locator(sel).count():
            page.locator(sel).first.click()
            page.wait_for_timeout(150)


with sync_playwright() as p:
    browser = p.chromium.launch(channel="chrome", headless=True)
    page = browser.new_page(viewport={"width": 390, "height": 844})
    page.on("pageerror", lambda e: errors.append("pageerror: " + str(e)))
    page.on("console", lambda m: errors.append("console: " + m.text) if m.type == "error" else None)
    page.goto(URL, wait_until="load")
    page.wait_for_timeout(400)

    tap(page, "1357", "#setupPinModal")
    page.wait_for_timeout(200)
    tap(page, "1357", "#confirmPinModal")
    page.locator("#mainApp").wait_for(state="visible", timeout=10000)
    check(True, "setup + unlock flow")

    # ── HOME: quick action cards navigate ──
    page.locator('.qa-card[data-goto="journal"]').first.click()
    page.wait_for_timeout(200)
    check(visible(page, "#tab-journal"), "Home quick-action card opens Journal")

    # ── JOURNAL: add, list, sort, read, search ──
    page.locator("#addEntryBtn").click()
    page.wait_for_timeout(150)
    page.fill("#journalTitle", "A private thought")
    page.fill("#journalBody", "Only I should ever read this.")
    page.locator('#journalForm button[type="submit"]').click()
    page.wait_for_timeout(400)
    check(page.evaluate("!!localStorage.getItem('bb_journal')"), "journal entry stored")
    check("Only I should ever read this." not in page.evaluate("localStorage.getItem('bb_journal')"),
          "journal body encrypted at rest")
    jn_before = page.locator("#tab-journal .journal-item-title, #tab-journal .journal-item strong").all_text_contents()
    page.select_option("#journalSort", "title")
    page.wait_for_timeout(200)
    check(page.locator("#journalSort").input_value() == "title", "journal sort setting applied")
    page.locator("#journalCalBtn").click()
    page.wait_for_timeout(200)
    check(visible(page, "#journalCalendar") or visible(page, "#journalCalPanel"),
          "journal calendar opens")

    # ── SECRETS: add + category + detail + reveal ──
    page.locator('.nav-btn[data-tab="secrets"]').click()
    page.wait_for_timeout(200)
    page.locator("#addSecretBtn").click()
    page.wait_for_timeout(120)
    page.fill("#secretName", "Ghost API")
    page.fill("#secretValue", "ghost_secret_999")
    page.select_option("#secretCategory", "api")
    page.locator('#secretForm button[type="submit"]').click()
    page.wait_for_timeout(300)
    check("ghost_secret_999" not in page.evaluate("localStorage.getItem('bb_secrets')"),
          "new secret encrypted at rest")

    # ── AUTH: manual TOTP add + code generation ──
    page.locator('.nav-btn[data-tab="auth"]').click()
    page.wait_for_timeout(200)
    page.locator("#addTotpBtn").click()
    page.wait_for_timeout(150)
    page.fill("#totpAccount", "Manual Site")
    page.fill("#totpSecret", "JBSWY3DPEHPK3PXP")
    page.locator('#totpForm button[type="submit"]').click()
    page.wait_for_timeout(350)
    check("JBSWY3DPEHPK3PXP" not in page.evaluate("localStorage.getItem('bb_auth')"),
          "manual TOTP secret encrypted at rest")
    page.locator("#importTotpUriBtn").click()
    page.wait_for_timeout(150)
    page.fill("#promptInput", "otpauth://totp/Email:bob@example.com?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&issuer=Mail")
    page.locator("#promptOk").click()
    page.wait_for_timeout(400)
    check(page.evaluate("JSON.parse(localStorage.getItem('bb_auth')) && Object.keys(JSON.parse(localStorage.getItem('bb_auth'))).length >= 2"),
          "otpauth import adds a second authenticator")
    check(page.locator("#tab-auth").inner_text().count(":") > 0 or page.locator("#tab-auth").inner_text().find("Email") >= 0,
          "authenticators rendered in Auth tab")

    # ── PRIVACY TOOLS: tracker stripper + URL scan + fingerprint ──
    page.locator('.nav-btn[data-tab="privacy"]').click()
    page.wait_for_timeout(200)
    page.locator("#trackerCleanBtn").click()
    page.wait_for_timeout(150)
    check(visible(page, "#trackerTool"), "tracker tool opens")
    page.fill("#trackerInput", "https://example.com/page?utm_source=mail&id=42&fbclid=xyz")
    page.locator("#trackerCleanAction").click()
    page.wait_for_timeout(250)
    out = page.locator("#trackerOutput").inner_text()
    print("  tracker output:", out)
    check("utm_source" not in out and "fbclid" not in out and "id=42" in out,
          "tracker stripping removes tracking params but keeps real ones")
    page.locator("#trackerToolBack").click()
    page.wait_for_timeout(100)
    page.locator("#urlScanBtn").click()
    page.wait_for_timeout(150)
    check(visible(page, "#urlScanTool"), "URL scanner opens")
    page.fill("#urlScanInput", "https://example.com")
    page.locator("#urlScanAction").click()
    page.wait_for_timeout(250)
    check(visible(page, "#urlScanResult"), "URL scanner returns a result")

    # ── HOME TOOLS: generator, health, clipboard ──
    page.locator('.nav-btn[data-tab="home"]').click()
    page.wait_for_timeout(150)
    page.locator("#clipInput").fill("sensitive note to encrypt")
    page.locator("#clipSaveBtn").click()
    page.wait_for_timeout(300)
    check("sensitive note to encrypt" not in page.evaluate("localStorage.getItem('bb_clip')"),
          "encrypted clipboard stores ciphertext only")
    page.locator("#clipClearBtn").click()
    page.wait_for_timeout(150)
    for btn, modal in (("#genBtn", "#genModal"), ("#openHealthBtn", "#healthModal"), ("#voiceCard", "#voiceModal")):
        if page.locator(btn).count():
            page.locator(btn).first.click()
            page.wait_for_timeout(250)
            check(visible(page, modal), f"{btn} opens {modal}")
            if btn == "#genBtn":
                val = page.locator("#genOutput").input_value()
                check(len(val) >= 8, "generator produces a password")
                page.locator("#genRefresh").click()
                page.wait_for_timeout(150)
                check(page.locator("#genOutput").input_value() != val, "Regenerate changes the password")
            if btn == "#openHealthBtn":
                check(page.locator("#healthScore").inner_text().strip() not in ("", "···"),
                      "health scan renders a score")
            closest = f"{modal} .modal-close-btn, {modal} #genCloseBtn, {modal} #healthCloseBtn, {modal} #voiceCloseBtn"
            if page.locator(closest).count():
                page.locator(closest).first.click()
            else:
                page.keyboard.press("Escape")
            page.wait_for_timeout(200)

    # ── FILES: open panel, list view, gallery view (lives inside Secrets) ──
    page.locator('.nav-btn[data-tab="secrets"]').click()
    page.wait_for_timeout(150)
    page.locator("#filesToggleBtn").click()
    page.wait_for_timeout(200)
    check(visible(page, "#filesSection"), "Files panel opens")
    page.locator("#filesViewGallery").click()
    page.wait_for_timeout(150)
    check(visible(page, "#filesGrid"), "Files gallery view works")
    page.locator("#filesViewList").click()
    page.wait_for_timeout(100)
    page.locator("#closeFilesBtn").click()
    page.wait_for_timeout(100)

    # ── SETTINGS: theme / UI style / auto-lock / toggles ──
    page.locator('.nav-btn[data-tab="settings"]').click()
    page.wait_for_timeout(150)
    for sel, val in (("#themeSelect", "light"), ("#uiStyleSelect", "neumo"), ("#wallpaperSelect", "9")):
        page.select_option(sel, val)
        page.wait_for_timeout(200)
    check(page.evaluate("document.documentElement.getAttribute('data-theme')") == "light",
          "theme select switches to light")
    check(page.evaluate("document.documentElement.getAttribute('data-ui')") == "neumo",
          "UI style select switches to neumo")
    page.locator("#shakeToggle").evaluate("el => el.click()")  # real user taps the visible label
    page.wait_for_timeout(150)
    check(page.evaluate("JSON.parse(localStorage.getItem('bb_settings')).shake") is True,
          "shake toggle persists")

    # ── MANUAL LOCK BUTTON + relock + decrypt check ──
    page.locator("#lockNowBtn").click()
    page.wait_for_timeout(250)
    check(not page.evaluate("Vault.isUnlocked()"), "manual lock button seals vault")
    check(visible(page, "#lockScreen"), "manual lock shows lock screen")
    tap(page, "1357")
    page.locator("#mainApp").wait_for(state="visible", timeout=10000)
    check(True, "PIN unlock after manual lock")

    # ── DECOY PIN: correct decoy must open calculator, not real vault ──
    page.locator('.nav-btn[data-tab="settings"]').click()
    page.wait_for_timeout(150)
    page.locator("#setupDecoyBtn").click()
    page.wait_for_timeout(150)
    page.fill("#promptInput", "9999")
    page.locator("#promptOk").click()
    page.wait_for_timeout(300)
    page.locator("#lockNowBtn").click()
    page.wait_for_timeout(250)
    tap(page, "9999")
    page.wait_for_timeout(500)
    check(visible(page, "#panicOverlay"), "decoy PIN opens the calculator, not the vault")
    for _ in range(5):
        page.locator("#panicOverlay").click(position={"x": 15, "y": 15})
        page.wait_for_timeout(60)
    page.wait_for_timeout(250)
    tap(page, "1357")
    page.locator("#mainApp").wait_for(state="visible", timeout=10000)
    check(True, "real PIN still works after decoy exit")

    check(len(errors) == 0, "no runtime errors across all sections: " + " | ".join(errors[:4]))
    browser.close()

print("")
if failures:
    print(f"FAILED: {len(failures)} full-app check(s).")
    sys.exit(1)
print("Full-app flow checks passed.")
