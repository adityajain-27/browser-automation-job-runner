import os
from typing import Callable, Awaitable
from playwright.async_api import async_playwright


RATING_MAP = {
    "One": "★☆☆☆☆",
    "Two": "★★☆☆☆",
    "Three": "★★★☆☆",
    "Four": "★★★★☆",
    "Five": "★★★★★",
}

SCREENSHOT_DIR = os.path.join(os.path.dirname(__file__), "screenshots")
os.makedirs(SCREENSHOT_DIR, exist_ok=True)


async def run_automation(
    url: str,
    goal: str,
    job_id: str,
    emit: Callable[[str, dict], Awaitable[None]],
) -> list[dict]:
    browser = None
    last_step = "initialization"

    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            await emit("browser.launched", {
                "browser": "chromium",
                "headless": True,
            })
            last_step = "browser.launched"

            page = await browser.new_page()

            await emit("page.navigating", {"url": url})
            last_step = "page.navigating"

            await page.goto(url, wait_until="networkidle", timeout=30000)

            page_title = await page.title()
            await emit("page.loaded", {
                "url": page.url,
                "title": page_title,
            })
            last_step = "page.loaded"

            await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
            await page.wait_for_timeout(500)
            await emit("action.taken", {
                "action": "scroll",
                "description": "Scrolling to load all content",
            })
            last_step = "action.taken"

            screenshot_filename = f"screenshot_{job_id}.png"
            screenshot_path = os.path.join(SCREENSHOT_DIR, screenshot_filename)
            await page.screenshot(path=screenshot_path, full_page=True)

            size_kb = round(os.path.getsize(screenshot_path) / 1024, 2)
            await emit("screenshot.captured", {
                "path": f"screenshots/{screenshot_filename}",
                "size_kb": size_kb,
            })
            last_step = "screenshot.captured"

            book_elements = await page.query_selector_all("article.product_pod")
            books: list[dict] = []

            for article in book_elements:
                title_el = await article.query_selector("h3 > a")
                title = await title_el.get_attribute("title") if title_el else "Unknown"

                price_el = await article.query_selector(".price_color")
                price = await price_el.inner_text() if price_el else "N/A"

                rating_el = await article.query_selector("p.star-rating")
                rating_class = await rating_el.get_attribute("class") if rating_el else ""
                rating_word = rating_class.split()[-1] if rating_class else "Zero"
                rating = RATING_MAP.get(rating_word, rating_word)

                avail_el = await article.query_selector(".availability")
                availability = (await avail_el.inner_text()).strip() if avail_el else "Unknown"

                books.append({
                    "title": title,
                    "price": price,
                    "rating": rating,
                    "availability": availability,
                })

            await emit("data.extracted", {
                "count": len(books),
                "sample": books[:3],
            })
            last_step = "data.extracted"

            return books

    except Exception as exc:
        await emit("job.failed", {
            "reason": str(exc),
            "last_step": last_step,
        })
        raise

    finally:
        if browser is not None:
            await browser.close()
