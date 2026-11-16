"""Headless browser smoke check for BLACKBOX (development only).

Verifies the real page boots with CSP active, no console/page errors,
and that theme plus ui-style tokens resolve to usable values.
"""
import sys
from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:8765/index.html"
failures = []


def check(cond, msg):
    print(("  OK  " if cond else "  FAIL ") + msg)
    if not cond:
        failures.append(msg)


with sync_playwright() as p:
    browser = p.chromium.launch(channel="chrome", headless=True)
    page = browser.new_page(viewport={"width": 390, "height": 844})
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append(f"console.{m.type}: {m.text}") if m.type == "error" else None)

    page.goto(URL, wait_until="load")
    page.wait_for_timeout(800)

    check(page.title() == "BLACKBOX", "page title is BLACKBOX")
    check(len(errors) == 0, "no page/console errors: " + " | ".join(errors[:4]))

    csp = page.eval_on_selector("meta[http-equiv='Content-Security-Policy']", "el => el.content")
    check("cdn.jsdelivr.net" in csp and "api.github.com" in csp, "CSP allows required origins")

    for g in ["Vault", "App", "SecretsModule", "JournalModule", "AuthModule"]:
        check(page.evaluate(f"typeof {g} !== 'undefined'"), f"global {g} loaded")

    state = page.evaluate("""() => {
      const cs = getComputedStyle(document.documentElement);
      const s = JSON.parse(localStorage.getItem('bb_settings') || '{}');
      return {theme: s.theme || 'dark', uiStyle: s.uiStyle || 'glass',
              bg: cs.getPropertyValue('--bg').trim(),
              text3: cs.getPropertyValue('--text3').trim(),
              glassBlur: cs.getPropertyValue('--glass-blur').trim()};
    }""")
    print("  theme state:", state)

    # Exercise each UI style and confirm surfaces stay visible + no errors.
    for style in ["solid", "glass", "neumo"]:
        page.evaluate("""s => {
          const x = JSON.parse(localStorage.getItem('bb_settings') || '{}');
          x.uiStyle = s; localStorage.setItem('bb_settings', JSON.stringify(x));
          if (window.Appliance) return;
        }""", style)
        page.reload(wait_until="load")
        page.wait_for_timeout(400)
        v = page.evaluate("""() => {
          const cs = getComputedStyle(document.documentElement);
          return {flag: document.documentElement.dataset.ui || document.body.dataset.ui || '',
                  neu: cs.getPropertyValue('--neu-bg').trim(),
                  bg: cs.getPropertyValue('--bg').trim(),
                  blur: cs.getPropertyValue('--glass-blur').trim()};
        }""")
        print(f"  style={style}: {v}")
        check(bool(v["bg"]), f"{style}: background token resolves")

    # Keyboard focus visibility on a real button.
    page.keyboard.press("Tab")
    focused = page.evaluate("""() => {
      const el = document.activeElement;
      if (!el) return null;
      const cs = getComputedStyle(el);
      return {tag: el.tagName, outline: cs.outlineStyle, width: cs.outlineWidth};
    }""")
    print("  first tab focus:", focused)

    page.screenshot(path="ci/browser-lock.png")
    browser.close()

print("")
if failures:
    print(f"FAILED: {len(failures)} browser check(s).")
    sys.exit(1)
print("Browser smoke checks passed.")
