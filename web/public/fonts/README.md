# Fonts

Self-hosted, subset to Latin and French characters. Both are under the SIL Open Font License 1.1
(see the `OFL-*.txt` files next to them), which allows redistribution with this AGPL-3.0 project.

| File | Source | Instance |
|---|---|---|
| `bricolage-grotesque.woff2` | Bricolage Grotesque, google/fonts `ofl/bricolagegrotesque` | weight 400–800 variable; width 86 and optical size 24 pinned |
| `martian-mono.woff2` | Martian Mono, google/fonts `ofl/martianmono` | weight 400–700 variable; width 100 pinned |

Rebuilt with fonttools: `varLib.instancer` for the axes, then `pyftsubset --flavor=woff2` on
U+0020-007E, U+00A0-00FF, U+0152-0153, U+0178, U+2013-2014, U+2018-201A, U+201C-201E, U+2022,
U+2026, U+202F, U+2039-203A, U+20AC, U+2190-2193, U+2212, U+00D7.
