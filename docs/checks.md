# Checks reference

zero-audit runs 20 checks on every audit. Each check has a numeric id, a severity, a theme and a scope:

- **Severity**: `error`, `warning` or `notice`. Severity weighs on the health score (see [User guide → Scores](user-guide.md#scores)).
- **Theme**: `crawlability`, `https`, `linking`, `on-page` or `other`. Each theme gets its own score.
- **Scope**: a *page* check examines each page it applies to, and its `examined` count is the number of those pages. A *site* check examines the site as a whole, so its `examined` is 1.

The ids follow the numbering commonly used by commercial site-audit tools, so results stay easy to compare with them. Ids **1000–1999** are reserved for our own checks. The CLI and the dashboard show the labels in French.

Thresholds live in `src/domain/thresholds.ts`, and the checks themselves in `src/domain/checks/`.

| Id | Severity | Theme | Scope | What it flags | How to fix |
|---:|---|---|---|---|---|
| 1 | error | crawlability | page | A page answers with a 5xx status. | Fix the server error, and check the logs and upstreams. |
| 2 | error | crawlability | page | A page answers with a 4xx status. | Restore the page, redirect it (301), or remove the links to it. |
| 3 | error | on-page | page | An HTML page has no `<title>`. | Add a unique, descriptive title. |
| 6 | error | on-page | page | Several pages share the same title. There is one occurrence per page involved. | Give each page its own title. |
| 8 | error | linking | page | An internal link points to a page that failed (4xx, 5xx or network error). The occurrence is on the linking page. | Update or remove the link. |
| 15 | error | on-page | page | Several pages share the same meta description. | Write a specific description for each page. |
| 101 | warning | on-page | page | The title is shorter than 30 characters. | Make the title more descriptive. |
| 102 | warning | on-page | page | The title is longer than 60 characters. | Shorten it so it is not truncated in search results. |
| 103 | warning | on-page | page | An HTML page has no `<h1>`. | Add one main heading. |
| 104 | notice | on-page | page | An HTML page has several `<h1>`. | Keep a single main heading. |
| 105 | warning | on-page | page | The `<h1>` is identical to the `<title>`, compared after normalising case and whitespace. | Make the heading complement the title instead of repeating it. |
| 106 | warning | on-page | page | An HTML page has no meta description. | Add a meta description. |
| 112 | warning | on-page | page | The text-to-HTML ratio is below 10 %. The ratio is the UTF-8 byte size of the visible body text divided by the byte size of the HTML. | Reduce markup bloat or add real content. |
| 117 | warning | on-page | page | The page has fewer than 200 words of visible text. | Expand thin content, or merge or noindex the page. |
| 125 | warning | crawlability | site | No sitemap was found. | Publish a sitemap and declare it in robots.txt. |
| 137 | notice | other | site | There is no `llms.txt`: the file does not answer with a 2xx. | Publish an `llms.txt` that describes the site for AI agents. |
| 203 | notice | crawlability | site | There is no `robots.txt`. | Publish a robots.txt, even a permissive one. |
| 205 | notice | https | site | The home page is served over HTTPS without a `Strict-Transport-Security` header. | Enable HSTS on the web server. |
| 213 | notice | linking | page | A page receives internal links from exactly one other page. | Link to it from more pages (navigation, related content). |
| 1000 | warning | crawlability | page | The same page is reachable at two URLs, with and without a trailing slash, or on `www.` and the apex domain. Both answer HTML 2xx and do not share a canonical URL. | Redirect one form to the other, or declare a common `<link rel="canonical">`. |

## Notes on some definitions

- **Pages examined.**
  - Most page checks apply to HTML pages answering 2xx.
  - Checks 1 and 2 apply to every page that got an HTTP response.
  - Check 8 applies to every page that has internal links.
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
