"""End-to-end browser check with Playwright (run manually: python backend/tests/browser_check.py).

Visits every route on desktop and mobile, collects console errors, failed
requests, 'NaN' text, empty chart containers and takes screenshots.
"""
from __future__ import annotations

import json
import re
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8000"
OUT = Path(sys.argv[2]) if len(sys.argv) > 2 else Path("/tmp/ftm-shots")
OUT.mkdir(parents=True, exist_ok=True)

ROUTES = ["/", "/era-translator", "/dna", "/dna/5503", "/time-machine", "/era-map", "/compare", "/ml-lab", "/data", "/data/sources", "/nope"]


def check(page, name: str, errors: list, viewport: str) -> dict:
    page.wait_for_timeout(2500)
    # wait for skeletons to go away (max 8s)
    for _ in range(16):
        if page.locator(".skeleton").count() == 0:
            break
        page.wait_for_timeout(500)
    text = page.inner_text("body")
    nan = len(re.findall(r"\bNaN\b|undefined|\[object Object\]", text))
    svgs = page.locator("svg.recharts-surface").count()
    empty_charts = page.evaluate("""() => Array.from(document.querySelectorAll('.recharts-wrapper')).filter(w => w.querySelectorAll('path, rect, circle').length < 3).length""")
    page.screenshot(path=str(OUT / f"{viewport}_{name}.png"), full_page=True)
    return {"route": name, "viewport": viewport, "nan": nan, "recharts": svgs, "empty_charts": empty_charts, "skeletons_left": page.locator(".skeleton").count(), "title": page.title()}


def run():
    report = []
    with sync_playwright() as p:
        browser = p.chromium.launch()
        for viewport, size in (("desktop", {"width": 1440, "height": 900}), ("mobile", {"width": 390, "height": 844})):
            ctx = browser.new_context(viewport=size, device_scale_factor=1)
            page = ctx.new_page()
            errors: list[str] = []
            page.on("console", lambda m: errors.append(f"console.{m.type}: {m.text}") if m.type in ("error",) else None)
            page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
            page.on("requestfailed", lambda r: errors.append(f"requestfailed: {r.url} {r.failure}"))
            page.on("response", lambda r: errors.append(f"http {r.status}: {r.url}") if r.status >= 400 and "/nope" not in page.url else None)
            for route in ROUTES:
                page.goto(BASE + route, wait_until="networkidle")
                report.append(check(page, route.strip("/").replace("/", "_") or "landing", errors, viewport))
            if viewport == "desktop":
                # interactions: search, era translator season switch, DNA player switch, time machine scrub, era map click
                page.goto(BASE + "/", wait_until="networkidle")
                page.keyboard.press("Control+k")
                page.wait_for_timeout(300)
                page.keyboard.type("xavi")
                page.wait_for_timeout(900)
                page.screenshot(path=str(OUT / "desktop_search.png"))
                first = page.locator("[role=option]").first
                report.append({"interaction": "search results", "count": page.locator("[role=option]").count(), "first": first.inner_text() if first.count() else None})
                page.keyboard.press("Enter")
                page.wait_for_url("**/dna/**", timeout=8000)
                page.wait_for_timeout(2500)
                report.append({"interaction": "search->dna", "url": page.url, "h2": page.locator("h2").first.inner_text()})
                page.screenshot(path=str(OUT / "desktop_dna_xavi.png"), full_page=True)
                # era translator: change target
                page.goto(BASE + "/era-translator", wait_until="networkidle")
                page.wait_for_timeout(3000)
                page.get_by_label("Target population").click()
                page.wait_for_timeout(400)
                opts = page.locator("[role=option]")
                report.append({"interaction": "target options", "count": opts.count()})
                opts.nth(2).click()
                page.wait_for_timeout(2500)
                page.screenshot(path=str(OUT / "desktop_translator_target.png"), full_page=True)
                report.append({"interaction": "translator after target change", "banner": page.locator("[role=note]").count(), "table_rows": page.locator("table tbody tr").count()})
                # time machine scrub
                page.goto(BASE + "/time-machine", wait_until="networkidle")
                page.wait_for_timeout(2500)
                slider = page.locator("[role=slider]").first
                slider.focus()
                for _ in range(5):
                    page.keyboard.press("ArrowRight")
                    page.wait_for_timeout(150)
                page.wait_for_timeout(1200)
                report.append({"interaction": "time machine scrub", "season": page.locator(".display").nth(1).inner_text()})
                page.screenshot(path=str(OUT / "desktop_timemachine_scrub.png"), full_page=True)
                page.get_by_label("Competition").click(); page.wait_for_timeout(300)
                page.locator("[role=option]").nth(2).click(); page.wait_for_timeout(1500)
                report.append({"interaction": "time machine filter", "season": page.locator(".display").nth(1).inner_text()})
                # era map click
                page.goto(BASE + "/era-map", wait_until="networkidle")
                page.wait_for_timeout(3500)
                page.fill("[aria-label='Highlight points']", "messi")
                page.wait_for_timeout(1200)
                page.screenshot(path=str(OUT / "desktop_eramap_search.png"), full_page=True)
                circles = page.locator("svg circle")
                report.append({"interaction": "era map circles", "count": circles.count()})
                page.get_by_label("Position group").click(); page.wait_for_timeout(300)
                page.locator("[role=option]").nth(4).click(); page.wait_for_timeout(1500)
                report.append({"interaction": "era map filter FW", "count": page.locator("svg circle").count()})
                # compare preset
                page.goto(BASE + "/compare", wait_until="networkidle")
                page.wait_for_timeout(4000)
                page.get_by_role("button", name="Xavi vs Modrić").click()
                page.wait_for_timeout(4000)
                page.screenshot(path=str(OUT / "desktop_compare_xavi.png"), full_page=True)
                report.append({"interaction": "compare xavi/modric", "h2": [h.inner_text() for h in page.locator("h2.display").all()]})
            report.append({"viewport": viewport, "errors": errors})
            ctx.close()
        browser.close()
    print(json.dumps(report, indent=1))


if __name__ == "__main__":
    t = time.time()
    run()
    print(f"done in {time.time() - t:.0f}s", file=sys.stderr)
