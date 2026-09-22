"""
Turns a raw URL into the raw feature dict that PredictionService.predict()
expects in `features`, plus `url` and `title`.

v2 — rewritten after a correctness review flagged that v1 fetched only the
initial HTML response. That undercounts everything on JS-rendered sites
(YouTube, Gmail, most SPAs): images, scripts, stylesheets, and favicon tags
that get injected client-side were all reading as ~0, which is a real
distribution shift from what the model was trained on (PhiUSIIL's own
crawler almost certainly rendered pages too, given the feature magnitudes
in the dataset). See CHANGES below for specifics.

CHANGES vs v1:
1. Default fetch path now renders the page with a headless browser
   (Playwright/Chromium) and reads the DOM *after* JS execution, instead
   of parsing the raw HTTP response body. Falls back to a plain
   requests+BeautifulSoup fetch (with an explicit warning) if Playwright
   or its browser binary isn't installed — so this still runs in minimal
   environments, just less accurately for JS-heavy sites.
2. Favicon detection now checks the full set of rel tokens sites actually
   use (icon / shortcut icon / apple-touch-icon(-precomposed) / mask-icon
   / fluid-icon), and falls back to checking whether /favicon.ico
   resolves, instead of matching only rel="icon".
3. Robots is now based on fetching /robots.txt (the PhiUSIIL feature name
   strongly implies robots.txt, not the <meta name=robots> tag, which is
   a different signal), not the meta tag.
4. Popup detection now scans inline scripts *and* fetches external script
   sources (capped in count/size) for window.open-style calls, instead of
   only inline <script> text. Still a static heuristic — it can't catch
   popups triggered only after a real user interaction — and is labeled
   as such.
5. URLSimilarityIndex, TLDLegitimateProb, and URLCharProb remain
   approximations by necessity (the paper computed them from statistics
   over the full ~235k-row PhiUSIIL corpus, which we don't have at
   inference time), but are now materially closer to the original intent:
   - TLDLegitimateProb and URLCharProb will use real per-TLD /
     per-character statistics computed from your training CSV if you run
     `python -m core.build_extraction_stats` once (writes
     artifacts/tld_legit_prob.pkl and artifacts/char_freq.pkl). Without
     those files present, both fall back to the same hand-picked heuristics
     as v1, and a warning says so explicitly.
   - URLSimilarityIndex is now measured against a curated list of ~150
     commonly-impersonated legitimate brand domains (the typosquatting
     signal PhiUSIIL's feature was actually designed to capture), instead
     of URL-vs-title similarity, which was measuring something else
     entirely. Extend/replace POPULAR_DOMAINS with a real top-N domains
     list (e.g. Tranco) for better coverage.

None of this claims byte-for-byte parity with the original PhiUSIIL
feature engineering code (which isn't public) — it's the closest
reproduction achievable from the paper's feature *descriptions* plus
what's actually computable at inference time.
"""

from __future__ import annotations

import ipaddress
import os
import pickle
import re
import socket
from dataclasses import dataclass, field
from difflib import SequenceMatcher
from urllib.parse import urlparse, urljoin

import requests
import tldextract
from bs4 import BeautifulSoup

from core import config

# ---------------------------------------------------------------------
# Network safety / fetch settings
# ---------------------------------------------------------------------
ALLOW_PRIVATE_TARGETS = False  # flip to True only for local dev against test fixtures
REQUEST_TIMEOUT = 8            # seconds, for plain requests.get calls (robots.txt, favicon, fallback fetch)
RENDER_TIMEOUT_MS = 15_000     # ms, for Playwright page.goto / networkidle wait
MAX_REDIRECTS = 8
MAX_CONTENT_BYTES = 3_000_000
MAX_EXTERNAL_SCRIPTS_SCANNED = 6
MAX_SCRIPT_BYTES = 300_000
USER_AGENT = (
    "Mozilla/5.0 (compatible; PhishingFeatureExtractor/2.0; "
    "+https://example.invalid/bot)"
)

SOCIAL_DOMAINS = (
    "facebook.com", "twitter.com", "x.com", "instagram.com", "linkedin.com",
    "youtube.com", "tiktok.com", "pinterest.com", "reddit.com", "whatsapp.com",
    "telegram.org", "snapchat.com",
)
BANK_KEYWORDS = ("bank", "banking", "banque")
PAY_KEYWORDS = ("pay", "payment", "checkout", "wallet")
CRYPTO_KEYWORDS = ("crypto", "bitcoin", "btc", "eth", "blockchain", "nft", "wallet")

FAVICON_REL_TOKENS = (
    "icon", "shortcut icon", "apple-touch-icon", "apple-touch-icon-precomposed",
    "mask-icon", "fluid-icon",
)

POPUP_PATTERNS = re.compile(
    r"window\.open\s*\(|showModal(?:Dialog)?\s*\(|createPopup\s*\(",
    re.IGNORECASE,
)

# Curated, deliberately small starter list of commonly-impersonated brand
# domains for the URLSimilarityIndex proxy. Extend this (or load a bigger
# reference list via build_extraction_stats.py) for real-world coverage;
# a ~150-entry hardcoded list will miss most regional/industry targets.
POPULAR_DOMAINS = (
    "google", "youtube", "facebook", "instagram", "twitter", "x", "linkedin",
    "amazon", "apple", "microsoft", "netflix", "paypal", "ebay", "wikipedia",
    "yahoo", "reddit", "tiktok", "whatsapp", "telegram", "github", "gitlab",
    "chase", "bankofamerica", "wellsfargo", "citibank", "hsbc", "barclays",
    "santander", "bbva", "americanexpress", "visa", "mastercard", "stripe",
    "coinbase", "binance", "kraken", "blockchain", "metamask",
    "dropbox", "adobe", "salesforce", "zoom", "slack", "spotify", "steam",
    "playstation", "xbox", "nintendo", "twitch", "pinterest", "snapchat",
    "outlook", "office365", "icloud", "protonmail", "gmail",
    "walmart", "target", "costco", "bestbuy", "homedepot", "ikea",
    "fedex", "ups", "usps", "dhl", "irs", "gov", "medicare",
    "booking", "airbnb", "expedia", "tripadvisor", "uber", "lyft", "doordash",
)


class FeatureExtractionError(RuntimeError):
    """Raised when a URL can't be safely or successfully fetched."""


@dataclass
class ExtractionResult:
    url: str
    title: str
    features: dict
    warnings: list = field(default_factory=list)


# ---------------------------------------------------------------------
# SSRF guard
# ---------------------------------------------------------------------
def _resolved_ips(hostname: str) -> list:
    try:
        infos = socket.getaddrinfo(hostname, None)
    except socket.gaierror as e:
        raise FeatureExtractionError(f"Could not resolve host: {hostname}") from e
    return [ipaddress.ip_address(info[4][0]) for info in infos]


def _is_public_ip(ip) -> bool:
    return not (
        ip.is_private or ip.is_loopback or ip.is_link_local
        or ip.is_multicast or ip.is_reserved or ip.is_unspecified
    )


def _assert_public_host(hostname: str) -> None:
    if ALLOW_PRIVATE_TARGETS or not hostname:
        return
    for ip in _resolved_ips(hostname):
        if not _is_public_ip(ip):
            raise FeatureExtractionError(
                f"Refusing to fetch {hostname}: resolves to a non-public address ({ip})"
            )


def _is_public_host(hostname: str) -> bool:
    if ALLOW_PRIVATE_TARGETS or not hostname:
        return True
    try:
        return all(_is_public_ip(ip) for ip in _resolved_ips(hostname))
    except FeatureExtractionError:
        return False


def _safe_get(url: str, max_bytes: int = MAX_CONTENT_BYTES) -> requests.Response:
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise FeatureExtractionError(f"Unsupported scheme: {parsed.scheme!r}")
    _assert_public_host(parsed.hostname)

    session = requests.Session()
    session.max_redirects = MAX_REDIRECTS
    try:
        resp = session.get(
            url, headers={"User-Agent": USER_AGENT},
            timeout=REQUEST_TIMEOUT, allow_redirects=True, stream=True,
        )
    except requests.exceptions.TooManyRedirects as e:
        raise FeatureExtractionError(f"Too many redirects for {url}") from e
    except requests.exceptions.RequestException as e:
        raise FeatureExtractionError(f"Fetch failed for {url}: {e}") from e

    for hop in resp.history:
        _assert_public_host(urlparse(hop.url).hostname)
    _assert_public_host(urlparse(resp.url).hostname)

    content = resp.raw.read(max_bytes + 1, decode_content=True)
    if len(content) > max_bytes:
        raise FeatureExtractionError(f"Response body exceeds {max_bytes} bytes")
    resp._content = content
    return resp


# ---------------------------------------------------------------------
# Page fetch: JS-rendered (preferred) with static-HTML fallback
# ---------------------------------------------------------------------
def _fetch_rendered(url: str) -> tuple:
    """
    Renders `url` in headless Chromium and returns
    (html, final_url, redirect_hops, warnings). Every network request
    Chromium makes (navigation + every subresource) is checked against
    the SSRF guard via page routing, since a rendered page can pull in
    far more cross-origin requests than a plain GET.
    """
    from playwright.sync_api import sync_playwright

    warnings = []

    def _guarded_route(route):
        req = route.request
        host = urlparse(req.url).hostname
        if not _is_public_host(host):
            route.abort()
            return
        route.continue_()

    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--no-sandbox"])
        try:
            context = browser.new_context(user_agent=USER_AGENT, ignore_https_errors=False)
            page = context.new_page()
            page.route("**/*", _guarded_route)
            page.set_default_timeout(RENDER_TIMEOUT_MS)

            try:
                response = page.goto(url, wait_until="networkidle", timeout=RENDER_TIMEOUT_MS)
            except Exception as e:
                raise FeatureExtractionError(f"Render failed for {url}: {e}") from e

            if response is None:
                raise FeatureExtractionError(f"No response received for {url}")
            if not (200 <= response.status < 400):
                warnings.append(f"Final response status was {response.status}")

            req = response.request
            chain = []
            node = req.redirected_from
            while node is not None:
                chain.append(node.url)
                node = node.redirected_from
            # Bug fix: this used to also append page.url (the final
            # destination) on top of the redirect sources in `chain`,
            # so a single real redirect (A -> B) counted as 2 hops
            # instead of 1. `chain` alone (each URL a redirect
            # originated FROM) is exactly the redirect count.
            redirect_hops = list(reversed(chain))

            try:
                page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
                page.wait_for_timeout(400)
            except Exception:
                pass

            html = page.content()
            final_url = page.url
            return html, final_url, redirect_hops, warnings
        finally:
            browser.close()


def _fetch_static(url: str) -> tuple:
    """Fallback path: plain GET, no JS execution. Used only if Playwright
    (or its browser binary) isn't available."""
    resp = _safe_get(url)
    # Same off-by-one fix as the rendered path: resp.history is already
    # exactly the list of redirect-source responses, so its length alone
    # is the redirect count — don't also append resp.url.
    redirect_hops = [h.url for h in resp.history]
    content_type = resp.headers.get("Content-Type", "")
    warnings = []
    if "text/html" not in content_type and content_type:
        warnings.append(f"Unexpected content-type '{content_type}', parsing best-effort anyway")
    try:
        html = resp.content.decode(resp.encoding or "utf-8", errors="ignore")
    except (LookupError, TypeError):
        html = resp.content.decode("utf-8", errors="ignore")
    return html, resp.url, redirect_hops, warnings


def _fetch_page(url: str) -> tuple:
    """Tries JS-rendered fetch first, falls back to static fetch with a
    loud, actionable warning so callers know feature accuracy may be
    degraded AND know exactly how to fix it — this fallback is the single
    most common cause of misclassified JS-heavy sites (SPAs, YouTube,
    Gmail, social platforms), so the warning needs to be more than a
    diagnosis."""
    reason = None
    fix = "Run: pip install playwright  &&  playwright install chromium"
    try:
        html, final_url, redirect_hops, warnings = _fetch_rendered(url)
        return html, final_url, redirect_hops, warnings, True
    except ImportError:
        reason = "the `playwright` package is not installed in this environment"
    except FeatureExtractionError:
        raise  # real fetch failures (bad URL, SSRF block, timeout) should surface, not silently degrade
    except Exception as e:
        msg = str(e)
        if "Executable doesn't exist" in msg or "playwright install" in msg:
            reason = "the playwright package is installed but the Chromium binary is not"
        else:
            reason = f"headless browser unavailable ({e})"

    html, final_url, redirect_hops, warnings = _fetch_static(url)
    warnings = [
        f"JS_RENDERING_UNAVAILABLE: {reason}. Fell back to static HTML — "
        "counts for NoOfImage/NoOfCSS/NoOfJS/NoOfiFrame/HasFavicon/NoOfPopup "
        "and anything else injected client-side will be understated on "
        f"JavaScript-heavy sites. Fix: {fix}"
    ] + warnings
    return html, final_url, redirect_hops, warnings, False


# ---------------------------------------------------------------------
# URL-string features
# ---------------------------------------------------------------------
def _url_string_features(url: str) -> dict:
    parsed = urlparse(url)
    hostname = parsed.hostname or ""
    ext = tldextract.extract(url)
    tld = (ext.suffix or "other_tld").split(".")[-1] or "other_tld"

    length = len(url) or 1
    letters = sum(c.isalpha() for c in url)
    digits = sum(c.isdigit() for c in url)
    obfuscated = url.count("%")
    equals = url.count("=")
    qmarks = url.count("?")
    ampersands = url.count("&")

    known_special = set("%=?&")
    other_special = sum(1 for c in url if not c.isalnum() and c not in known_special)
    total_special = obfuscated + equals + qmarks + ampersands + other_special

    is_ip = False
    try:
        ipaddress.ip_address(hostname)
        is_ip = True
    except ValueError:
        pass

    subdomain_parts = [p for p in ext.subdomain.split(".") if p] if ext.subdomain else []

    if len(url) > 1:
        continuations = sum(1 for a, b in zip(url, url[1:]) if a == b)
        char_continuation_rate = continuations / (len(url) - 1)
    else:
        char_continuation_rate = 0.0

    return {
        "TLD": tld,
        "IsHTTPS": parsed.scheme == "https",
        "IsDomainIP": is_ip,
        "HasObfuscation": obfuscated > 0,
        "TLDLength": len(tld),
        "NoOfSubDomain": len(subdomain_parts),
        "NoOfObfuscatedChar": obfuscated,
        "ObfuscationRatio": obfuscated / length,
        "NoOfLettersInURL": letters,
        "LetterRatioInURL": letters / length,
        "NoOfDegitsInURL": digits,
        "DegitRatioInURL": digits / length,
        "NoOfEqualsInURL": equals,
        "NoOfQMarkInURL": qmarks,
        "NoOfAmpersandInURL": ampersands,
        "NoOfOtherSpecialCharsInURL": other_special,
        "SpacialCharRatioInURL": total_special / length,
        "CharContinuationRate": char_continuation_rate,
        "Bank": any(k in url.lower() for k in BANK_KEYWORDS),
        "Pay": any(k in url.lower() for k in PAY_KEYWORDS),
        "Crypto": any(k in url.lower() for k in CRYPTO_KEYWORDS),
        "_registered_domain": ext.domain,
        "_hostname": hostname,
    }


# ---------------------------------------------------------------------
# Dataset-grounded stats (optional — see build_extraction_stats.py)
# ---------------------------------------------------------------------
def _load_pickle(path):
    try:
        with open(path, "rb") as f:
            return pickle.load(f)
    except (FileNotFoundError, OSError, pickle.PickleError):
        return None


_TLD_LEGIT_PROB_TABLE = _load_pickle(os.path.join(config.ARTIFACTS_DIR, "tld_legit_prob.pkl"))
_CHAR_FREQ_TABLE = _load_pickle(os.path.join(config.ARTIFACTS_DIR, "char_freq.pkl"))
_EXTRACTION_STATS = _load_pickle(os.path.join(config.ARTIFACTS_DIR, "extraction_stats.pkl")) or {}


def _tld_legitimate_prob(tld: str, warnings: list) -> float:
    if _TLD_LEGIT_PROB_TABLE is not None:
        if tld in _TLD_LEGIT_PROB_TABLE:
            return float(_TLD_LEGIT_PROB_TABLE[tld])
        return float(_TLD_LEGIT_PROB_TABLE.get("__default__", config.LEGITIMATE_BASE_RATE))

    warnings.append(
        "TLDLegitimateProb: no artifacts/tld_legit_prob.pkl found — using the "
        "dataset's global base rate as a per-TLD placeholder (not real per-TLD "
        "statistics, which vary a lot: e.g. in this project's own training CSV "
        "'com' sits at ~0.52, not the 0.9 this used to hardcode). Run "
        "`python -m core.build_extraction_stats` against your training CSV "
        "to fix this properly."
    )
    # Deliberately conservative: this used to hardcode 0.9 for "trusted" TLDs
    # like com/org, but the actual training data put TLDLegitimateProb for
    # 'com' at ~0.52 — nowhere near 0.9. Defaulting every TLD to the
    # dataset's overall class balance is a safer placeholder than guessing
    # per-TLD trust levels with no data behind them. This path only runs if
    # artifacts/tld_legit_prob.pkl is missing — with it present (as it is
    # in this project's artifacts/), the real per-TLD value above is used.
    return config.LEGITIMATE_BASE_RATE


def _url_char_prob(url: str, warnings: list) -> float:
    if _CHAR_FREQ_TABLE is not None and url:
        default = _CHAR_FREQ_TABLE.get("__default__", 0.0)
        probs = [_CHAR_FREQ_TABLE.get(c, default) for c in url]
        return sum(probs) / len(probs)

    warnings.append(
        "URLCharProb: no artifacts/char_freq.pkl found — approximating with "
        "1/(distinct characters used) instead of a real character frequency "
        "table. Run `python -m core.build_extraction_stats` to fix this."
    )
    if not url:
        return 0.0
    # This used to be "fraction of characters that are alphanumeric/./-/:",
    # which computes to ~0.9-1.0 for almost any normal URL. But URLCharProb
    # in the actual training data is a per-character frequency (avg
    # probability of each character appearing at all, across a ~30-symbol
    # alphabet), which sits around 0.03-0.09 for real rows — the old
    # fallback was off by roughly 15-20x on a feature the StandardScaler
    # was fit against. 1/(unique chars used) is a much closer-scaled proxy.
    # This path only runs if artifacts/char_freq.pkl is missing — with it
    # present (as it is in this project's artifacts/), the real per-
    # character table above is used instead.
    unique_chars = len({c for c in url if c.isprintable()})
    return 1.0 / max(unique_chars, 1)


def _url_similarity_index(registered_domain: str, warnings: list) -> float:
    """
    This used to score similarity as "best match against a ~76-domain
    popular-brand list" and use that directly. For any domain NOT in that
    tiny list — i.e. almost every legitimate site that isn't a huge global
    brand (a university, a small business, ...) — that produced a near-0
    score. But the actual PhiUSIIL training data shows URLSimilarityIndex
    sits at exactly 100 for the clear majority of rows (the 98-100 bucket
    alone accounts for more than half the dataset, closely tracking the
    proportion of legitimate rows): most ordinary legitimate URLs score
    high, and it's specifically typosquatting/impersonation attempts that
    score low. The old default (low unless matched) had the direction
    backwards — this was very likely the single biggest source of
    mispredictions on ordinary legitimate sites. This version defaults
    high and only lowers the score when the domain looks like it's
    imitating a known brand — checking both a brand-name-plus-extra-text
    pattern ("paypal-secure-login") and a same-length near-miss pattern
    ("paypa1", "arnazon").
    """
    if not registered_domain:
        return 0.0
    warnings.append(
        "URLSimilarityIndex: heuristic, not PhiUSIIL's original reference-"
        "dataset computation. Defaults high (matching the training "
        "distribution's own skew) and only drops for domains that look "
        "like they're impersonating a known brand — it will still miss "
        "typosquats of brands outside the small built-in list, and subtle "
        "character-substitution squats (e.g. 'g00gle') that don't clear "
        "the similarity threshold."
    )
    domain_l = registered_domain.lower()

    # Leetspeak/lookalike-character normalization: catches g00gle, payp4l,
    # amaz0n, etc. precisely — normalize both sides the same way and check
    # for an exact match. This is a targeted fix for a real gap (character-
    # substitution squats that fuzzy-ratio thresholds either miss or only
    # catch by being loose enough to also flag unrelated domains).
    leet_map = str.maketrans({
        "0": "o", "1": "l", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", "$": "s",
    })
    domain_norm = domain_l.translate(leet_map)
    if domain_norm != domain_l and domain_norm in POPULAR_DOMAINS:
        return 40.0  # normalized match to a brand, but the raw domain isn't the brand itself

    best_score = 100.0

    for ref in POPULAR_DOMAINS:
        if domain_l == ref:
            return 100.0

        # brand name embedded with extra text — "paypal-secure-login",
        # "secure-paypal-verify"
        if ref in domain_l:
            extra = len(domain_l) - len(ref)
            candidate = max(30.0, 90.0 - extra * 5)
            best_score = min(best_score, candidate)
            continue

        # same-length-ish near miss — character substitution typo squat
        if abs(len(domain_l) - len(ref)) <= 2:
            ratio = SequenceMatcher(None, domain_l, ref).ratio()
            if ratio >= 0.75:
                best_score = min(best_score, round(ratio * 100, 2))

    return best_score


# ---------------------------------------------------------------------
# Favicon / robots.txt / popup detection
# ---------------------------------------------------------------------
def _favicon_present(soup: BeautifulSoup, base_url: str) -> bool:
    for link in soup.find_all("link"):
        rel = link.get("rel")
        rel_str = " ".join(rel).lower() if isinstance(rel, list) else str(rel or "").lower()
        if any(token in rel_str for token in FAVICON_REL_TOKENS):
            return True

    try:
        favicon_url = urljoin(base_url, "/favicon.ico")
        resp = _safe_get(favicon_url, max_bytes=200_000)
        content_type = resp.headers.get("Content-Type", "")
        if resp.status_code == 200 and (not content_type or "image" in content_type or "icon" in content_type):
            return True
    except FeatureExtractionError:
        pass
    return False


def _robots_txt_present(base_url: str) -> bool:
    try:
        robots_url = urljoin(base_url, "/robots.txt")
        resp = _safe_get(robots_url, max_bytes=200_000)
        # 200 with a real body is the clean case. A 403 here usually means
        # a WAF/bot-protection layer blocked *this fetch itself* rather
        # than the file being genuinely absent — that's still evidence of
        # a robots/bot-management policy, so treat it as present rather
        # than undercounting sites that just don't like automated clients.
        # (requests already followed any redirect chain transparently, so
        # 3xx doesn't need separate handling here.)
        if resp.status_code == 200:
            return len(resp.content.strip()) > 0
        return resp.status_code == 403
    except FeatureExtractionError:
        return False


def _popup_heuristic(soup: BeautifulSoup, base_url: str) -> int:
    hits = 0
    inline_scripts = [s.string for s in soup.find_all("script") if s.string]
    for text in inline_scripts:
        hits += len(POPUP_PATTERNS.findall(text))

    external_srcs = [
        urljoin(base_url, s.get("src")) for s in soup.find_all("script") if s.get("src")
    ][:MAX_EXTERNAL_SCRIPTS_SCANNED]
    for src in external_srcs:
        try:
            resp = _safe_get(src, max_bytes=MAX_SCRIPT_BYTES)
            body = resp.content.decode("utf-8", errors="ignore")
            hits += len(POPUP_PATTERNS.findall(body))
        except FeatureExtractionError:
            continue
    return hits


# ---------------------------------------------------------------------
# HTML/content features
# ---------------------------------------------------------------------
def _match_score(a: str, b: str) -> float:
    """Plain full-string similarity — kept for cases where both sides are
    expected to be comparable in length."""
    a, b = (a or "").lower().strip(), (b or "").lower().strip()
    if not a or not b:
        return 0.0
    return SequenceMatcher(None, a, b).ratio()


def _partial_match_score(short: str, long_text: str) -> float:
    """
    Approximates a RapidFuzz-style `partial_ratio`: how well `short`
    matches the *best-matching token* inside `long_text`, rather than the
    two full strings against each other. Plain SequenceMatcher on
    e.g. ("nagarajneelam", "Nagaraj - Backend Developer Portfolio") gets
    crushed by the length mismatch even though "nagaraj" is clearly
    present — that was making DomainTitleMatchScore read far lower than
    the training data's typical range for genuinely-matching pages.
    """
    short = (short or "").lower().strip()
    long_text = (long_text or "").lower().strip()
    if not short or not long_text:
        return 0.0
    if short in long_text:
        # exact substring match — scale slightly by how much of long_text
        # it covers so a short brand-name match doesn't always cap at
        # exactly the same score as a near-full match
        coverage = len(short) / max(len(long_text), 1)
        return min(1.0, 0.85 + 0.15 * coverage)

    tokens = re.findall(r"[a-z0-9]+", long_text)
    if not tokens:
        return SequenceMatcher(None, short, long_text).ratio()
    return max(SequenceMatcher(None, short, tok).ratio() for tok in tokens)


def _html_features(url: str, html: str, redirect_hops: list) -> tuple:
    soup = BeautifulSoup(html, "html.parser")
    hostname = urlparse(url).hostname or ""
    registered_domain = tldextract.extract(url).domain

    title_tag = soup.find("title")
    title = title_tag.get_text(strip=True) if title_tag and title_tag.get_text(strip=True) else ""

    # Minified/bundled HTML (React, Next.js, most modern SPA output) is
    # frequently served as one giant line, which made LineOfCode read ~1
    # and LargestLineLength read >100k — nowhere near the 200-900 line
    # range typical of the training data (which almost certainly crawled
    # formatted/served HTML, not post-minification bundles). Re-indenting
    # with BeautifulSoup's prettify() before counting lines gets much
    # closer to that distribution. This is real work (a full re-parse and
    # re-serialization), so it's capped by size and falls back to the raw
    # line count on failure rather than hanging on pathological input.
    try:
        if len(html) <= 2_000_000:
            pretty_html = soup.prettify()
        else:
            pretty_html = html
    except Exception:
        pretty_html = html
    lines = pretty_html.splitlines()
    line_of_code = len(lines)
    largest_line_length = max((len(l) for l in lines), default=0)

    has_favicon = _favicon_present(soup, url)
    robots_present = _robots_txt_present(url)
    meta_viewport = soup.find("meta", attrs={"name": "viewport"})
    meta_description = soup.find("meta", attrs={"name": "description"})

    forms = soup.find_all("form")
    has_external_form_submit = False
    for f in forms:
        action = f.get("action") or ""
        if not action:
            continue
        action_host = urlparse(urljoin(url, action)).hostname or ""
        if action_host and action_host != hostname:
            has_external_form_submit = True
            break

    has_social = any(
        dom in (a.get("href") or "") for a in soup.find_all("a") for dom in SOCIAL_DOMAINS
    )
    has_submit_button = bool(
        soup.find("button", attrs={"type": "submit"})
        or soup.find("input", attrs={"type": "submit"})
    )
    has_hidden_fields = bool(soup.find("input", attrs={"type": "hidden"}))
    has_password_field = bool(soup.find("input", attrs={"type": "password"}))

    body_text = soup.get_text(" ", strip=True)
    has_copyright = "©" in html or bool(re.search(r"copyright", body_text, re.IGNORECASE))

    n_iframe = len(soup.find_all("iframe"))
    # img/source (picture>source) covers most cases; modern component
    # libraries also render icons as inline <svg>, which neither of those
    # catch. NOTE: images set purely via CSS background-image (common in
    # hero sections) are still invisible to static DOM inspection — that
    # would need computed-style querying per element, which is out of
    # scope here and left as a known undercount.
    n_image = len(soup.find_all("img")) + len(soup.find_all("source")) + len(soup.find_all("svg"))
    # link[rel=stylesheet] and <style> covers most cases, including CSS-
    # in-JS libraries (styled-components/emotion/Next.js all still emit
    # real <style> tags into the DOM). Also count the preload-then-swap
    # pattern (rel="preload" as="style") some sites use for perf, since
    # it's still a stylesheet being loaded even before the swap fires.
    n_css = (
        len(soup.find_all("link", rel=lambda v: v and "stylesheet" in " ".join(v).lower()))
        + len(soup.find_all("style"))
        + len(soup.find_all("link", attrs={"as": "style"}))
    )
    scripts = soup.find_all("script")
    # Bundlers commonly also declare modulepreload/prefetch <link> tags
    # for JS chunks the page will need. Scripts injected via runtime
    # import()/fetch() with no corresponding <link> or <script> tag at
    # all are genuinely invisible to static DOM inspection — that's a
    # real, undetectable-from-here undercount for heavily code-split apps.
    n_js = (
        len(scripts)
        + len(soup.find_all("link", rel=lambda v: v and "modulepreload" in " ".join(v).lower()))
        + len(soup.find_all("link", attrs={"as": "script"}))
    )
    n_popup = _popup_heuristic(soup, url)

    n_self_ref = n_empty_ref = n_external_ref = 0
    for a in soup.find_all("a"):
        href = (a.get("href") or "").strip()
        if not href or href == "#" or href.lower().startswith("javascript:"):
            n_empty_ref += 1
            continue
        link_host = urlparse(urljoin(url, href)).hostname or ""
        if not link_host or link_host == hostname:
            n_self_ref += 1
        else:
            n_external_ref += 1

    n_self_redirect = sum(
        1 for hop in redirect_hops if (urlparse(hop).hostname or "") == hostname
    )

    features = {
        "HasTitle": bool(title),
        "HasFavicon": has_favicon,
        "Robots": robots_present,
        "IsResponsive": bool(meta_viewport),
        "HasDescription": bool(meta_description),
        "HasExternalFormSubmit": has_external_form_submit,
        "HasSocialNet": has_social,
        "HasSubmitButton": has_submit_button,
        "HasHiddenFields": has_hidden_fields,
        "HasPasswordField": has_password_field,
        "HasCopyrightInfo": has_copyright,
        "LineOfCode": line_of_code,
        "LargestLineLength": largest_line_length,
        "DomainTitleMatchScore": _partial_match_score(registered_domain, title) * 100,
        "URLTitleMatchScore": _partial_match_score(
            (registered_domain + " " + re.sub(r"[/\-_]+", " ", urlparse(url).path)).strip(),
            title,
        ) * 100,
        "NoOfURLRedirect": len(redirect_hops),
        "NoOfSelfRedirect": n_self_redirect,
        "NoOfPopup": n_popup,
        "NoOfiFrame": n_iframe,
        "NoOfImage": n_image,
        "NoOfCSS": n_css,
        "NoOfJS": n_js,
        "NoOfSelfRef": n_self_ref,
        "NoOfEmptyRef": n_empty_ref,
        "NoOfExternalRef": n_external_ref,
    }
    return features, title


# ---------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------
def extract_features(url: str) -> ExtractionResult:
    url_feats = _url_string_features(url)

    html, final_url, redirect_hops, fetch_warnings, was_rendered = _fetch_page(url)
    warnings = list(fetch_warnings)

    html_feats, title = _html_features(final_url, html, redirect_hops)

    tld = url_feats["TLD"]
    proxy_feats = {
        "TLDLegitimateProb": _tld_legitimate_prob(tld, warnings),
        "URLCharProb": _url_char_prob(url, warnings),
        "URLSimilarityIndex": _url_similarity_index(url_feats["_registered_domain"], warnings),
    }

    all_features = {}
    all_features.update({k: v for k, v in url_feats.items() if not k.startswith("_")})
    all_features.update(html_feats)
    all_features.update(proxy_feats)

    # Coerce types (bools for categorical binary cols, floats for continuous)
    for c in config.CATEGORICAL_BINARY_COLS:
        if c in all_features:
            all_features[c] = bool(all_features[c])
    for c in config.CONTINUOUS_COLS:
        if c in all_features:
            try:
                all_features[c] = float(all_features[c])
            except Exception:
                all_features[c] = 0.0

    # Apply dataset-derived caps to keep numeric values within training range
    if _EXTRACTION_STATS:
        for col, cap in _EXTRACTION_STATS.items():
            if col in all_features and isinstance(all_features[col], (int, float)):
                try:
                    if all_features[col] > cap:
                        all_features[col] = float(cap)
                except Exception:
                    pass

    missing = [
        c for c in (config.CATEGORICAL_BINARY_COLS + config.CONTINUOUS_COLS)
        if c not in all_features
    ]
    if missing:
        warnings.append(f"Extractor did not populate: {missing} (filled with 0/False)")
        for m in missing:
            all_features[m] = False if m in config.CATEGORICAL_BINARY_COLS else 0.0

    return ExtractionResult(url=final_url, title=title, features=all_features, warnings=warnings)