# Checks reference

zero-audit runs 29 checks on every audit. Each check has a numeric id, a severity, a theme and a scope:

- **Severity**: `error`, `warning` or `notice`. Severity weighs on the health score (see [User guide → Scores](user-guide.md#scores)).
- **Theme**: `crawlability`, `https`, `linking`, `on-page` or `other`. Each theme gets its own score.
- **Scope**: a *page* check examines each page it applies to, and its `examined` count is the number of those pages. A *site* check examines the site as a whole, so its `examined` is 1.

The ids follow the numbering used by Semrush's Site Audit, so that results can be compared. zero-audit is an independent project, not affiliated with or endorsed by Semrush, and the check wording is original. Ids **1000–1999** are reserved for our own checks. The CLI and the dashboard show the labels in French.

Thresholds live in `src/domain/thresholds.ts`, and the checks themselves in `src/domain/checks/`.

| Id | Severity | Theme | Scope | What it flags | How to fix |
|---:|---|---|---|---|---|
| 1 | error | crawlability | page | A page answers with a 5xx status. | Fix the server error, and check the logs and upstreams. |
| 2 | error | crawlability | page | A page answers with a 4xx status. | Restore the page, redirect it (301), or remove the links to it. |
| 3 | error | on-page | page | An HTML page has no `<title>`. | Add a unique, descriptive title. |
| 4 | notice | crawlability | page | An internal page is blocked from crawling by `robots.txt`. There is one occurrence per blocked URL. | Check that the block is intended; otherwise relax the matching `Disallow` rule. |
| 6 | error | on-page | page | Several pages share the same title. There is one occurrence per page involved. | Give each page its own title. |
| 7 | error | crawlability | page | Several pages have exactly the same HTML (same SHA-256 content hash) and do not all declare the same canonical. `info.duplicates` lists the other pages of the group. | Merge the pages, redirect them, or declare one canonical page. |
| 8 | error | linking | page | An internal link points to a page that failed (4xx, 5xx or network error). The occurrence is on the linking page. | Update or remove the link. |
| 9 | error | crawlability | page | A page did not answer within the crawler's time limit (`timeout`). | Look at the server's performance and load. |
| 11 | error | crawlability | page | A page could not be reached: connection, DNS, blocked or other network failure. `info.kind` gives the failure. | Check the host, DNS and firewall, then the URL itself. |
| 15 | error | on-page | page | Several pages share the same meta description. | Write a specific description for each page. |
| 33 | error | crawlability | page | A redirecting URL goes through at least 2 redirects before reaching its destination, or leads into a loop. `info` gives the `chain` (the URLs followed in order, without the starting URL) and `loop`, plus `truncated` when the 10-hop cap was reached. | Redirect straight to the final destination and update the links. |
| 101 | warning | on-page | page | The title is shorter than 30 characters. | Make the title more descriptive. |
| 102 | warning | on-page | page | The title is longer than 60 characters. | Shorten it so it is not truncated in search results. |
| 103 | warning | on-page | page | An HTML page has no `<h1>`. | Add one main heading. |
| 104 | notice | on-page | page | An HTML page has several `<h1>`. | Keep a single main heading. |
| 105 | warning | on-page | page | The `<h1>` is identical to the `<title>`, compared after normalising case and whitespace. | Make the heading complement the title instead of repeating it. |
| 106 | warning | on-page | page | An HTML page has no meta description. | Add a meta description. |
| 109 | warning | crawlability | page | A page answers with a temporary redirect (302, 303 or 307). `info` gives the `status` and the `target`. | Replace it with a permanent redirect (301 or 308) if the move is final, and update the links. |
| 112 | warning | on-page | page | The text-to-HTML ratio is below 10 %. The ratio is the UTF-8 byte size of the visible body text divided by the byte size of the HTML. | Reduce markup bloat or add real content. |
| 117 | warning | on-page | page | The page has fewer than 200 words of visible text. | Expand thin content, or merge or noindex the page. |
| 125 | warning | crawlability | site | No sitemap was found. | Publish a sitemap and declare it in robots.txt. |
| 137 | notice | other | site | There is no `llms.txt`: the file does not answer with a 2xx. | Publish an `llms.txt` that describes the site for AI agents. |
| 203 | notice | crawlability | site | There is no `robots.txt`. | Publish a robots.txt, even a permissive one. |
| 205 | notice | https | site | The home page is served over HTTPS without a `Strict-Transport-Security` header. | Enable HSTS on the web server. |
| 209 | notice | crawlability | page | A page is excluded from the index by an `X-Robots-Tag` HTTP header (`noindex` or `none`). `info.value` gives the header value. | Check that the exclusion is intended; otherwise remove the directive from the server configuration. |
| 212 | notice | crawlability | page | A page is more than 3 clicks away from the home page. `info.clicks` gives the number of clicks. | Link to it from pages closer to the home page. |
| 213 | notice | linking | page | A page receives internal links from exactly one other page. | Link to it from more pages (navigation, related content). |
| 214 | notice | crawlability | page | A page answers with a permanent redirect (301 or 308). `info` gives the `status` and the `target`. | Update internal links to point directly to the target. |
| 1000 | warning | crawlability | page | The same page is reachable at two URLs, with and without a trailing slash, or on `www.` and the apex domain. Both answer HTML 2xx and do not share a canonical URL. | Redirect one form to the other, or declare a common `<link rel="canonical">`. |

## Notes on some definitions

- **Pages examined.**
  - Most page checks apply to HTML pages answering 2xx.
  - Checks 1 and 2 apply to every page that got an HTTP response.
  - Check 4 always applies: its `examined` is the number of pages explored, and the occurrences come from the URLs the crawler skipped because of `robots.txt`.
  - Check 7 applies to HTML 2xx pages; error pages are never counted in a group. It detects exact duplicates only (identical raw HTML): near-duplicates are not found. A group whose pages all declare the same canonical (after removing the `#fragment`) is not reported. It can overlap with check 1000 (the same page under two URL forms), check 6 (same title) and check 15 (same meta description), which report the same pages from another angle.
  - Check 8 applies to every page that has internal links.
  - Checks 109 and 214 apply to every page that got an HTTP response. A page redirects when its status is 302, 303 or 307 (109) or 301 or 308 (214); a 304 is not a redirect. The page is reported where it redirects, not where it is linked.
  - Check 33 applies to every page that answers with a redirect. Each crawled URL whose own chain has at least 2 hops, or ends in a loop (including a page redirecting to itself), is reported: in X→A→B→C, X and A are reported and B is not. A chain is cut at 10 hops and marked `truncated`.
  - Check 209 applies to every page that got an HTTP response. The header value is split on commas; an agent prefix (`googlebot: noindex`) is dropped and case is ignored. `noindex` and `none` are reported; `nofollow` alone is not.
  - Check 212 applies to HTML 2xx pages. Depth is counted in clicks, by a breadth-first walk over the internal `<a>` links from the final root (the start URL after its redirects, which are not clicks); a redirecting link lands on its destination at the cost of one click. The crawl's own `depth` is not used. Pages that only the sitemap reveals, with no link leading to them, are not reported: their click depth is unknown.
  - Checks 9 and 11 always apply: their `examined` is the number of pages explored. A timeout goes to 9, every other network failure to 11. Check 8 also reports internal links to these pages, so the same failure can appear in both (on the linking page for 8, on the failed page for 9 and 11).
  - Only pages reached within the `--limit` are examined.
- **URL variants (1000).**
  - URLs are never merged: `/about` and `/about/` are distinct pages when both are linked.
  - After the crawl, zero-audit requests the other form (with or without the slash) of each HTML page, at most once per page. These requests honour robots.txt and the politeness delay.
  - It also requests the home page once on the alternate host (`www.` or apex).
  - These probes are stored with the audit but are not counted as crawled pages.
  - A shared canonical means search engines already treat both forms as one page, so nothing is reported.
- **Site files.** `robots.txt`, the sitemaps and `llms.txt` are requested and their HTTP status is stored with the audit. They are not counted as crawled pages.
- **Single incoming link (213).** Links from a page to itself are ignored.
- **HSTS (205).** Only the home page is examined.
