#!/usr/bin/env python3
"""Diff-only code gate. Python stdlib only.

Scans added lines for credential footprints, public network paths, and
non-local database URLs. Exit 0 when clean, 1 on findings, 2 on a
fail-closed error. Matched secret text is never stored or printed.
"""

from __future__ import annotations

import argparse
import ipaddress
import math
import os
import re
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Sequence
from urllib.parse import unquote, urlsplit

MAX_FILE_BYTES = 2 * 1024 * 1024
ENTROPY_THRESHOLD = 4.0
MIN_SECRET_LEN = 20
ZERO_SHA = "0" * 40
SHA_RE = re.compile(r"^[0-9a-fA-F]{40}$")
RANGE_RE = re.compile(r"^[0-9a-fA-F]{40}\.{2,3}[0-9a-fA-F]{40}$")

_LOCAL_V4 = "127.0.0.1"
_LOCAL_V6 = "::1"
_LOCAL_NAME = "localhost"

_CODE_EXTS = frozenset(
    {
        ".py",
        ".js",
        ".ts",
        ".tsx",
        ".jsx",
        ".mjs",
        ".cjs",
        ".go",
        ".rs",
        ".java",
        ".rb",
        ".php",
        ".sh",
        ".bash",
        ".sql",
        ".json",
        ".yml",
        ".yaml",
        ".toml",
        ".ini",
        ".env",
        ".conf",
        ".cfg",
        ".xml",
        ".properties",
        ".tf",
        ".hcl",
        ".gradle",
        ".html",
        ".htm",
        ".vue",
        ".c",
        ".h",
        ".cs",
        ".kt",
        ".kts",
        ".swift",
        ".ps1",
        ".txt",
    }
)
_CODE_NAMES = frozenset({"dockerfile", "makefile", "jenkinsfile"})

_EXACT_NAMES = frozenset(
    {
        "key",
        "secret",
        "password",
        "passwd",
        "token",
        "api_key",
        "apikey",
        "api-key",
        "access_key",
        "private_key",
        "client_secret",
    }
)
_NAME_SUFFIXES = ("_key", "_secret", "_token", "_password", "_passwd")
_PLACEHOLDER_BITS = (
    "changeme",
    "placeholder",
    "example",
    "dummy",
    "fake",
    "sample",
    "redacted",
    "your-",
    "todo",
    "fixme",
    "password",
    "secret",
    "token",
    "apikey",
    "api-key",
    "xxx",
    "test-key",
    "not-a-real",
)
_QUERY_HOST_KEYS = frozenset({"host", "hostaddr", "hostname"})
_DB_ENV_SUFFIXES = (
    "DATABASE_URL",
    "DB_URL",
    "MYSQL_URL",
    "POSTGRES_URL",
    "POSTGRESQL_URL",
    "REDIS_URL",
    "MONGODB_URL",
    "MONGO_URL",
    "AMQP_URL",
    "SQLSERVER_URL",
    "MARIADB_URL",
)


def _c(*parts: str) -> str:
    return "".join(parts)


def _db_schemes() -> tuple[str, ...]:
    names = (
        _c("mongo", "db+", "srv"),
        _c("post", "gresql"),
        _c("post", "gres"),
        _c("maria", "db"),
        _c("mongo", "db"),
        _c("my", "sql"),
        _c("re", "diss"),
        _c("re", "dis"),
        _c("sql", "server"),
        _c("am", "qp"),
    )
    return tuple(sorted(names, key=len, reverse=True))


_DB_SCHEMES = _db_schemes()
_DB_SCHEME_SET = frozenset(name.lower() for name in _DB_SCHEMES)
_SRV_SCHEME = _c("mongo", "db+", "srv")


class MissingBase(Exception):
    """The diff base commit is missing or the event cannot be resolved."""


class Unparseable(Exception):
    """A diff, file, or allowlist cannot be scanned safely."""

    def __init__(self, kind: str) -> None:
        super().__init__(kind)
        self.kind = kind


@dataclass(frozen=True)
class Finding:
    path: str
    line: int
    rule_id: str
    masked: str
    suppressed: bool = False
    note: str = ""

    def __repr__(self) -> str:
        return (
            f"Finding({self.path}:{self.line} {self.rule_id} "
            f"suppressed={self.suppressed} masked={self.masked})"
        )


@dataclass
class _Hit:
    rule_id: str
    start: int
    end: int
    masked: str


@dataclass
class _FileDiff:
    path: str
    added: list[tuple[int, str]] = field(default_factory=list)
    binary: bool = False


def mask_value(value: str, keep: int = 4) -> str:
    """Show at most `keep` leading characters, then `***`."""
    printable = "".join(ch for ch in value if ch.isprintable())
    if len(printable) < max(keep, 4):
        return "***"
    return printable[:keep] + "***"


# Generic, AWS-secret, bearer, and DB-env values carry no fixed prefix, so
# their masks show at most two real characters.
SHORT_MASK = 2


def _shannon(value: str) -> float:
    if not value:
        return 0.0
    counts: dict[str, int] = {}
    for ch in value:
        counts[ch] = counts.get(ch, 0) + 1
    length = len(value)
    entropy = 0.0
    for count in counts.values():
        prob = count / length
        entropy -= prob * math.log2(prob)
    return entropy


def _rule_class(rule_id: str) -> str:
    if rule_id.startswith("cred-"):
        return "a"
    if rule_id.startswith("net-"):
        return "b"
    if rule_id.startswith("db-"):
        return "c"
    return "other"


def _is_code_config(path: str) -> bool:
    name = Path(path).name.lower()
    if name in _CODE_NAMES or name.startswith(".env"):
        return True
    return Path(path).suffix.lower() in _CODE_EXTS


def _size_exempt(path: str) -> bool:
    return path.replace("\\", "/").startswith("archive/")


_CAMEL_TAILS = frozenset({"key", "secret", "token", "password", "passwd"})


def _camel_tail(name: str) -> str:
    """Last word of a camelCase, snake_case, or hyphenated name."""
    parts = re.findall(r"[A-Z]+(?![a-z])|[A-Za-z][a-z0-9]*|[0-9]+", name)
    if not parts:
        return ""
    return parts[-1].lower()


def _sensitive_name(name: str) -> bool:
    lowered = name.lower()
    if lowered in _EXACT_NAMES or lowered.endswith(_NAME_SUFFIXES):
        return True
    # accessToken / apiKey: the last camelCase word is the secret kind.
    # tokenizer stays one word and does not match.
    return _camel_tail(name) in _CAMEL_TAILS


def _placeholder(value: str) -> bool:
    lowered = value.lower()
    return any(bit in lowered for bit in _PLACEHOLDER_BITS)


def _is_public_ip(ip: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    mapped = getattr(ip, "ipv4_mapped", None)
    if mapped is not None:
        ip = mapped
    if (
        ip.is_multicast
        or ip.is_unspecified
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_reserved
        or ip.is_private
    ):
        return False
    return bool(ip.is_global)


def _compile() -> dict[str, re.Pattern[str]]:
    aws_access = "(?:" + "AK" + "IA|" + "AS" + "IA" + ")"
    github = (
        "(?:"
        + "gh"
        + "p_|"
        + "gh"
        + "o_|"
        + "gh"
        + "s_|"
        + "gh"
        + "u_"
        + ")[A-Za-z0-9]{36}"
    )
    github_pat = "(?:" + "github" + "_pat_" + ")[A-Za-z0-9_]{22,}"
    openai_proj = "(?:" + "sk-" + "proj-" + ")[A-Za-z0-9]{20,}"
    openai = "(?:" + "sk-" + "(?!" + "ant-" + "|" + "proj-" + ")" + ")[A-Za-z0-9]{20,}"
    anthropic = "(?:" + "sk-" + "ant-" + ")[A-Za-z0-9_-]{16,}"
    google = "(?:" + "AI" + "za" + ")[A-Za-z0-9_-]{35}"
    stripe = "(?:" + "sk_" + "live_|" + "rk_" + "live_" + ")[A-Za-z0-9]{16,}"
    slack = "(?:" + "xox" + "[abprs]-" + ")[0-9A-Za-z-]{10,}"
    pem = (
        "-----"
        + "BE"
        + "GIN "
        + "(?:RSA |DSA |EC |OPENSSH |ENCRYPTED |PGP )?"
        + "PRIVATE "
        + "KEY"
        + "-----"
    )
    openai_svc = "(?:" + "sk-" + "(?:svc" + "acct|ad" + "min)-" + ")[A-Za-z0-9_-]{20,}"
    npm = "(?:" + "np" + "m_" + ")[A-Za-z0-9]{36}"
    gitlab = "(?:" + "gl" + "pat-" + ")[A-Za-z0-9_-]{20,}"
    hf = "(?:" + "h" + "f_" + ")[A-Za-z]{30,}"
    slack_hook = (
        r"(?i)\b" + "hooks" + r"\." + "slack" + r"\.com/" + "services"
        + r"/T[A-Z0-9]{6,}/B[A-Z0-9]{6,}/[A-Za-z0-9]{16,}"
    )
    bearer = (
        r"(?i)\b" + "author" + "ization" + r"['\"]?\s*[:=]\s*['\"]?\s*"
        + "bea" + "rer" + r"\s+([A-Za-z0-9._~+/=-]{16,})"
    )
    jwt = r"eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}"
    # Names are split so the source file does not hold one long token name
    # next to a sample value. The alternation is still the canonical spelling.
    aws_names = "|".join(
        (
            _c("aws_", "secret_", "access_", "key"),
            _c("aws_", "secret_", "key"),
            _c("secret_", "access_", "key"),
        )
    )
    aws_secret = (
        r"(?i)\b(?:"
        + aws_names
        + r")\b\s*[:=]\s*['\"]?([A-Za-z0-9/+=]{40})(?![A-Za-z0-9/+=])"
    )
    # `$` and `{` are in the character class, so a later template alternative
    # never runs. These forms come first so the host after `@` stays in the
    # match. The password check, not this pattern, decides which of them are
    # placeholders. `}` outside those forms still ends the URL.
    url = (
        r"(?i)\b(?:"
        + "ht"
        + "tps?|"
        + "ws"
        + "s?"
        + r")://(?:"
        + r"\$\{\{[^}]*\}\}"
        + r"|\$\{[^}]*\}"
        + r"|\{[^}]*\}"
        + r"|<[^>\s]*>"
        + r"|[^\s<>'\"`)}]"
        + r")+"
    )
    scheme_alt = "|".join(re.escape(name) for name in _DB_SCHEMES)
    db_pattern = r"(?i)(?:jdbc:)?" + "(?:" + scheme_alt + ")" + r"://[^\s<>'\"`]*"
    return {
        "cred-aws-access-key": re.compile(aws_access + r"[A-Z0-9]{16}(?![A-Z0-9])"),
        "cred-github-token": re.compile(github + r"(?![A-Za-z0-9])"),
        "cred-github-pat": re.compile(github_pat + r"(?![A-Za-z0-9_])"),
        "cred-openai-proj": re.compile(openai_proj + r"(?![A-Za-z0-9])"),
        "cred-openai": re.compile(openai + r"(?![A-Za-z0-9])"),
        "cred-openai-svc": re.compile(openai_svc + r"(?![A-Za-z0-9_-])"),
        "cred-npm": re.compile(npm + r"(?![A-Za-z0-9])"),
        "cred-gitlab": re.compile(gitlab + r"(?![A-Za-z0-9_-])"),
        "cred-huggingface": re.compile(hf + r"(?![A-Za-z0-9])"),
        "cred-slack-webhook": re.compile(slack_hook),
        "cred-bearer-token": re.compile(bearer),
        "cred-anthropic": re.compile(anthropic + r"(?![A-Za-z0-9_-])"),
        "cred-google-api": re.compile(google + r"(?![A-Za-z0-9_-])"),
        "cred-stripe": re.compile(stripe + r"(?![A-Za-z0-9])"),
        "cred-slack": re.compile(slack),
        "cred-private-key": re.compile(pem),
        "cred-jwt": re.compile(jwt),
        "cred-aws-secret": re.compile(aws_secret),
        "net-url": re.compile(url),
        "db-url": re.compile(db_pattern),
    }


_PATS = _compile()
# Wrapped in a lookahead so matches may overlap: `x = "api_token=..."`
# must still see the inner `api_token` assignment.
_ASSIGN_RE = re.compile(
    r"(?i)(?=(?:^|(?<=[^A-Za-z0-9_]))"
    r"(?P<nq>['\"]?)(?P<name>[A-Za-z_][A-Za-z0-9_\-]{0,64})(?P=nq)"
    r"(?:\s*:\s*[A-Za-z_][A-Za-z0-9_\[\]., |]{0,40}?(?=\s*=))?"
    r"\s*(?::=|=>|[:=])\s*"
    r"(?:(?P<quote>['\"])(?P<qvalue>[^'\"\s]{20,200})(?P=quote)"
    r"|(?P<value>[A-Za-z0-9+/=_.\-!@#$%^&*~]{20,200})))"
)
_ENV_RE = re.compile(
    r"(?i)(?:^|[^A-Za-z0-9_])(?:export\s+)?"
    r"(?P<q>['\"]?)(?P<name>[A-Za-z_][A-Za-z0-9_]*)(?P=q)"
    r"\s*[:=]\s*"
    r"(?P<value>\"[^\"\n]*\"|'[^'\n]*'|\S+)"
)
_SUPPRESS_RE = re.compile(
    r"#\s*code-gate:\s*allow\s+([a-z0-9-]+)\s+(\S(?:.*\S)?)\s*$"
)
_HUNK_RE = re.compile(r"^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@")
# Exactly four parts: no part may touch another dotted part, so OIDs such
# as 1.3.6.1.4.1 and version strings with five parts never match.
# A preceding v or V is allowed so a version prefix can be told from a letter glued on.
_DOTTED_RE = re.compile(
    r"(?<![0-9A-UW-Za-uw-z.])"
    r"(?:0[xX][0-9a-fA-F]{1,2}|\d{1,3})(?:\.(?:0[xX][0-9a-fA-F]{1,2}|\d{1,3})){3}"
    r"(?![0-9A-Za-z]|\.[0-9A-Za-z])"
)
# Bare 8-10 digit decimals and 0x hex count as IPv4 only right after an IP
# keyword (ip=, --ip, addr, host=, url=, nc, socket.connect((N, ...)) or as
# a URL host. Longer names stay first so `server` does not eat `server_ip`.
# Longer names stay first so `server` does not eat `server_ip` and `host`
# does not eat `host_ip` or `upstream_host`.
_IP_KEYWORDS = (
    r"upstream_host|host_ip|server_?ip|dst_ip|"
    r"ipv4|ip_?addr(?:ess)?|remote_?addr|bind_?addr(?:ess)?|"
    r"hostname|host|remote|peer|addr(?:ess)?|"
    r"url|endpoint|target|server|ip"
)
# Any socket variable: `s.connect((N` as well as `socket.connect((N`.
_SOCKET_CALL = r"[A-Za-z_][A-Za-z0-9_]*\.connect\(\s*\(\s*"
_IP_NUM = r"0[xX][0-9a-fA-F]{1,8}|[1-9]\d{7,9}"
_IPKW_NUM_RE = re.compile(
    r"(?i)(?:"
    r"(?<![A-Za-z0-9_])(?:--?)?(?:" + _IP_KEYWORDS + r")"
    r"['\"]?(?:\s*[:=]\s*|\s+)"
    r"|(?<![A-Za-z0-9_])" + _SOCKET_CALL +
    r"|(?<![A-Za-z0-9_])nc\s+"
    r")['\"]?(?P<num>" + _IP_NUM + r")(?![A-Za-z0-9])"
)
# Dotted quads in these spots are versions, not addresses. A network keyword
# immediately before the quad wins over the version context.
_VERSION_CTX = re.compile(
    r"(?i)(?:__version__\s*=|(?<![A-Za-z0-9_])version\s*=|==|(?<![A-Za-z0-9])v)\s*['\"]?\s*$"
)
_KW_CTX = re.compile(
    r"(?i)(?:"
    r"(?<![A-Za-z0-9_])(?:--?)?(?:" + _IP_KEYWORDS + r")"
    r"['\"]?(?:\s*[:=]\s*|\s+)"
    r"|(?<![A-Za-z0-9_])" + _SOCKET_CALL +
    r"|(?<![A-Za-z0-9_])nc\s+"
    r")['\"]?\s*$"
)
# RFC 2606 reserved names. Exact label only: `example.com` is not reserved,
# and neither are `testing`, `examplex`, or `xn--example`.
_RESERVED_NAMES = frozenset({"example", "test", "invalid", "localhost"})
# A hostname the resolver could look up. A single label matches. Callers
# still treat a dotless name as unknown unless it is a reserved name.
_DNS_NAME = re.compile(
    r"^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?))*$"
)
_IPV6_RE = re.compile(
    r"(?i)(?<![0-9A-Za-z:])"
    r"(?:[0-9a-f]{0,4}:){2,7}"
    r"(?:(?:\d{1,3}\.){3}\d{1,3}|[0-9a-f]{0,4})"
    r"(?![0-9A-Za-z:])"
)
_HOST_RE = re.compile(r"[a-z0-9.-]+\.[a-z]{2,}")
# `$NAME`, `${VAR}`, and `${{ ... }}`. `{name}` is separate: a prefix match
# on `{` would hide a real secret that merely starts with one. This pattern
# is only a prefix skip for generic assignments. URL passwords use the
# tighter checks below, so a default or a quoted literal is not skipped.
_REF_RE = re.compile(
    r"\$(?:[A-Za-z_][A-Za-z0-9_]*|\{\{[^}]*\}\}|\{[^}]+\})"
)
_SHELL_IDENT_RE = re.compile(r"\$(?:[A-Za-z_][A-Za-z0-9_]*|\{[A-Za-z_][A-Za-z0-9_]*\})")
_SHELL_EMPTY_DEFAULT_RE = re.compile(
    r"\$\{[A-Za-z_][A-Za-z0-9_]*(?::?-|=)\}"
)
_FSTRING_REF_RE = re.compile(r"\{[A-Za-z_][A-Za-z0-9_-]*\}")
_ANGLE_PLACEHOLDER_RE = re.compile(r"<[A-Za-z_][A-Za-z0-9_-]*>")
_PLACEHOLDER_WORD_RE = re.compile(r"[A-Za-z_][A-Za-z0-9_-]*")
_GH_EXPR_RE = re.compile(r"\$\{\{(.*)\}\}", re.DOTALL)
# Quotes, numbers, and JSON literals are secrets when they sit in a password.
# A digit run inside an identifier (`TOKEN_2026`) is not a numeric literal.
_GH_LITERAL_RE = re.compile(
    r"""['"`]|(?<![A-Za-z0-9_])(?:\d+(?:\.\d+)?|true|false|null)\b"""
)
# `secrets.X`, `env.X`, `vars.X`, `github.X`, and `inputs.X` are references.
_GH_DOTTED_REF_RE = re.compile(
    r"\b(?:secrets|env|vars|github|inputs)(?:\.[A-Za-z_][A-Za-z0-9_]*)+"
)
# Plain snake_case or kebab-case: one letter case, digits inside a word.
_PLAIN_SNAKE_RE = re.compile(
    r"(?:[a-z0-9]+(?:[_-][a-z0-9]+)*|[A-Z0-9]+(?:[_-][A-Z0-9]+)*)"
)
_URL_PASSWORD_EXACT = frozenset({"changeme", "pass", "password", "xxx"})


def _safe_rel(path: str) -> str:
    cleaned = path.strip().strip('"')
    if not cleaned or cleaned.startswith("/") or cleaned.startswith("\\"):
        raise Unparseable("file")
    parts = cleaned.replace("\\", "/").split("/")
    if any(part == ".." for part in parts):
        raise Unparseable("file")
    return "/".join(part for part in parts if part not in ("", "."))


def _strip_diff_path(path: str) -> str:
    text = path.strip()
    if text.startswith('"') and text.endswith('"') and len(text) >= 2:
        text = text[1:-1]
    if text == "/dev/null":
        return ""
    if text.startswith("b/") or text.startswith("a/"):
        text = text[2:]
    return _safe_rel(text) if text else ""


def load_allowlist(path: Path) -> set[str]:
    try:
        text = path.read_text(encoding="utf-8")
    except UnicodeDecodeError as exc:
        raise Unparseable("allowlist") from exc
    except OSError as exc:
        raise Unparseable("allowlist") from exc
    hosts: set[str] = set()
    for raw in text.splitlines():
        line = raw.split("#", 1)[0].strip().lower().rstrip(".")
        if not line:
            continue
        if "://" in line or "/" in line or "\\" in line or any(ch.isspace() for ch in line):
            raise Unparseable("allowlist")
        if ".." in line or line.startswith(".") or line.endswith("."):
            raise Unparseable("allowlist")
        if not _HOST_RE.fullmatch(line):
            raise Unparseable("allowlist")
        hosts.add(line)
    return hosts


def _host_allowed(host: str, allow: set[str]) -> bool:
    host = host.lower().rstrip(".")
    if host in allow:
        return True
    return any(host.endswith("." + item) for item in allow)


def _parse_dotted(token: str) -> ipaddress.IPv4Address | str | None:
    parts = token.split(".")
    if len(parts) != 4:
        return None
    ambiguous = False
    values: list[int] = []
    for part in parts:
        if re.fullmatch(r"0[xX][0-9a-fA-F]{1,2}", part):
            values.append(int(part, 16))
        elif re.fullmatch(r"\d{1,3}", part):
            if len(part) > 1 and part.startswith("0"):
                ambiguous = True
            values.append(int(part, 10))
        else:
            return None
        if values[-1] > 255:
            return None
    if ambiguous:
        return "ambiguous"
    try:
        return ipaddress.IPv4Address(".".join(str(value) for value in values))
    except ipaddress.AddressValueError:
        return None


def _numeric_host(host: str) -> ipaddress.IPv4Address | str | None:
    if re.fullmatch(r"0[xX][0-9a-fA-F]{1,8}", host):
        value = int(host, 16)
        if value > 0xFFFFFFFF:
            return "ambiguous"
        return ipaddress.IPv4Address(value)
    if re.fullmatch(r"[1-9]\d{7,9}", host):
        value = int(host)
        if value > 0xFFFFFFFF:
            return None
        return ipaddress.IPv4Address(value)
    return _parse_dotted(host)


def _ip_from_token(token: str) -> ipaddress.IPv4Address | ipaddress.IPv6Address | str | None:
    dotted = _parse_dotted(token)
    if dotted is not None:
        return dotted
    numeric = _numeric_host(token)
    if numeric is not None:
        return numeric
    candidate = token.strip("[]")
    if candidate.count(":") >= 2:
        try:
            return ipaddress.ip_address(candidate)
        except ValueError:
            return None
    return None


def _credential_hits(line: str) -> list[_Hit]:
    hits: list[_Hit] = []
    spans: list[tuple[int, int]] = []
    specific = (
        ("cred-private-key", "cred-private-key"),
        ("cred-aws-access-key", "cred-aws-access-key"),
        ("cred-aws-secret", "cred-aws-secret"),
        ("cred-github-token", "cred-github-token"),
        ("cred-github-pat", "cred-github-token"),
        ("cred-slack-webhook", "cred-slack-webhook"),
        ("cred-bearer-token", "cred-bearer-token"),
        ("cred-openai-svc", "cred-openai"),
        ("cred-openai-proj", "cred-openai"),
        ("cred-anthropic", "cred-anthropic"),
        ("cred-openai", "cred-openai"),
        ("cred-google-api", "cred-google-api"),
        ("cred-stripe", "cred-stripe"),
        ("cred-slack", "cred-slack"),
        ("cred-npm", "cred-npm"),
        ("cred-gitlab", "cred-gitlab"),
        ("cred-huggingface", "cred-huggingface"),
        ("cred-jwt", "cred-jwt"),
    )
    for key, rule_id in specific:
        for match in _PATS[key].finditer(line):
            if any(not (match.end() <= start or match.start() >= end) for start, end in spans):
                continue
            if key == "cred-bearer-token":
                value = match.group(1)
                if _placeholder(value) or not any(ch.isdigit() for ch in value):
                    continue
            if key in ("cred-aws-secret", "cred-bearer-token"):
                raw = match.group(1)
                masked = mask_value(raw, SHORT_MASK)
            else:
                raw = match.group(0)
                masked = mask_value(raw)
            hits.append(_Hit(rule_id, match.start(), match.end(), masked))
            spans.append((match.start(), match.end()))
    for match in _ASSIGN_RE.finditer(line):
        name = match.group("name")
        quoted = match.group("qvalue") is not None
        group = "qvalue" if quoted else "value"
        value = match.group(group)
        if not _sensitive_name(name):
            continue
        if _looks_like_url(value) or _REF_RE.match(value):
            continue
        if not quoted and value.startswith("$"):
            continue
        if _placeholder(value) or any(ch.isspace() for ch in value):
            continue
        if not any(ch.isalpha() for ch in value) or not any(ch.isdigit() for ch in value):
            continue
        if _shannon(value) < ENTROPY_THRESHOLD or len(value) < MIN_SECRET_LEN:
            continue
        value_start = match.start(group)
        value_end = match.end(group)
        if any(not (value_end <= start or value_start >= end) for start, end in spans):
            continue
        hits.append(
            _Hit("cred-generic-secret", value_start, value_end, mask_value(value, SHORT_MASK))
        )
        spans.append((value_start, value_end))
    return hits


def _looks_like_url(value: str) -> bool:
    lowered = value.lower()
    prefixes = (
        _c("ht", "tp://"),
        _c("ht", "tps://"),
        _c("ws://"),
        _c("ws", "s://"),
    )
    return any(lowered.startswith(prefix) for prefix in prefixes)


def _trim_url(url: str) -> str:
    cleaned = url
    while cleaned and cleaned[-1] in ".,;)]}'\"":
        if cleaned[-1] == "]" and cleaned.count("[") == cleaned.count("]"):
            break
        cleaned = cleaned[:-1]
    return cleaned


def _url_host(url: str) -> str | None:
    """Host after curl/WHATWG-style normalization.

    A regex-escaped dot (`\\.`) is read as a dot. Userinfo is stripped at
    `@` before leftover backslashes become slashes, so `github.com\\@evil.com`
    is host `evil.com` (the same host urlsplit reports). The host is then
    percent-decoded. It is not cut at `$`, `{`, or `\\`.
    """
    cleaned = _trim_url(url).replace("\\.", ".")
    scheme, sep, rest = cleaned.partition("://")
    if not sep:
        return None
    # `/`, `?`, and `#` end the authority. A backslash does not: it is
    # normalized below, after userinfo is removed.
    cut = len(rest)
    for mark in "/?#":
        index = rest.find(mark)
        if index >= 0:
            cut = min(cut, index)
    authority = rest[:cut]
    if not authority:
        return None
    if "@" in authority:
        authority = authority.rsplit("@", 1)[1]
    authority = authority.replace("\\", "/")
    if "/" in authority:
        authority = authority.split("/", 1)[0]
    if not authority:
        return None
    try:
        host = urlsplit(scheme + "://" + authority).hostname
    except ValueError:
        return None
    if not host:
        return None
    host = unquote(host).lower().rstrip(".")
    if not host or any(mark in host for mark in "/\\?#@"):
        return None
    return host


def _reserved_host(host: str) -> bool:
    """True for an RFC 2606 name or a subdomain of one.

    The host is already cleaned: lowercased, trailing dot removed. The
    right-most label must be exactly `example`, `test`, `invalid`, or
    `localhost`. `example.com` does not match.
    """
    return host.rsplit(".", 1)[-1] in _RESERVED_NAMES


def _classify_url(url: str, allow: set[str]) -> str | None:
    try:
        host = _url_host(url)
    except ValueError:
        return "net-public-url"
    if not host:
        return "net-public-url"
    if any(ord(ch) > 127 for ch in host):
        return "net-public-url"
    parsed = _ip_from_token(host)
    if parsed == "ambiguous":
        return "net-public-ip"
    if isinstance(parsed, (ipaddress.IPv4Address, ipaddress.IPv6Address)):
        # Link-local addresses, including the metadata address, are not public.
        return "net-public-ip" if _is_public_ip(parsed) else None
    # Reserved names and loopback names run only after the host is a real
    # DNS name. `${host}.localhost` and `evil.com{x}.localhost` are unknown.
    # They are flagged. They are not treated as private.
    if not _DNS_NAME.fullmatch(host):
        return "net-public-url"
    if _reserved_host(host):
        return None
    if "." not in host:
        return "net-public-url"
    if _host_allowed(host, allow):
        return None
    return "net-public-url"


def _plain_snake_or_kebab(word: str) -> bool:
    """True for lowercase or uppercase words joined by ``_`` or ``-``.

    Digits may sit inside a word (`api_key_v2`, `password2`, `base64-token`).
    Mixed case is not plain.
    """
    return _PLAIN_SNAKE_RE.fullmatch(word) is not None


def _placeholder_word_is_secret(word: str) -> bool:
    """True when a `{...}` or `<...>` word looks like a secret.

    Plain snake_case and kebab-case names are not secrets. A mixed-case
    word that contains a digit is. A token-like word that is not plain
    snake_case or kebab-case is. Shell names and dotted GitHub paths are
    not passed here.
    """
    if _plain_snake_or_kebab(word):
        return False
    has_digit = any(ch.isdigit() for ch in word)
    has_lower = any(ch.islower() for ch in word)
    has_upper = any(ch.isupper() for ch in word)
    if has_digit and has_lower and has_upper:
        return True
    return _tokenish(word)


def _has_secret_placeholder_word(text: str) -> bool:
    return any(
        _placeholder_word_is_secret(word) for word in _PLACEHOLDER_WORD_RE.findall(text)
    )


def _github_expression_reference(value: str) -> bool:
    """True for `${{ secrets.X }}` style references with no quoted or numeric literal.

    Dotted paths under `secrets`, `env`, `vars`, `github`, and `inputs`
    are references even when the last segment contains a digit. Any other
    word is checked with the brace/angle rule.
    """
    match = _GH_EXPR_RE.fullmatch(value)
    if match is None:
        return False
    body = match.group(1)
    if not re.search(r"[A-Za-z_]", body):
        return False
    if _GH_LITERAL_RE.search(body) is not None:
        return False
    stripped = _GH_DOTTED_REF_RE.sub(" ", body)
    return not _has_secret_placeholder_word(stripped)


def _template_password(value: str) -> bool:
    """True when the whole password is a reference, not a literal secret.

    `$IDENT`, `${IDENT}`, and an empty `${VAR:-}` are references. The
    placeholder-word check is not applied to those names, or to a name in
    any `${IDENT:-...}` default form. `${VAR:-literal}` is not a reference.
    `${{ ... }}` is a reference when the expression has no quotes and no
    literals. `{name}` is a reference only for an identifier-like name that
    is not a mixed-case digit token or a non-snake token.
    """
    if _SHELL_IDENT_RE.fullmatch(value) is not None:
        return True
    if _SHELL_EMPTY_DEFAULT_RE.fullmatch(value) is not None:
        return True
    if _github_expression_reference(value):
        return True
    if _FSTRING_REF_RE.fullmatch(value) is None:
        return False
    return not _placeholder_word_is_secret(value[1:-1])


def _url_password_placeholder(value: str) -> bool:
    """True for a stand-in password, not a real-looking one.

    Exact words only: changeme, pass, password, xxx. A string of only
    asterisks. An angle-bracket word whose inside is an identifier
    (`<password>`, `<my-token>`, `<base64-token>`). `<...>` and any other
    inside are not. A mixed-case word with a digit, or a token-like word
    that is not snake_case or kebab-case, is not a stand-in.
    """
    if value.lower() in _URL_PASSWORD_EXACT:
        return True
    if value and all(ch == "*" for ch in value):
        return True
    if _ANGLE_PLACEHOLDER_RE.fullmatch(value) is None:
        return False
    return not _placeholder_word_is_secret(value[1:-1])


def _url_password_span(url: str) -> tuple[int, int] | None:
    """Offsets of a URL password inside `url`.

    None means do not flag: no password, an empty password, a plain
    reference (`$VAR`, `${IDENT}`, an empty `${VAR:-}`, a quote-free
    `${{ secrets.X }}` / `${{ env.X }}` / `${{ github.token }}`, or
    `{identifier}`), or an exact placeholder (`changeme`, `pass`,
    `password`, `xxx`, asterisks, `<identifier>`). A `${VAR:-literal}`
    default, a quoted or numeric GitHub expression, and any other
    `{...}` or `<...>` are flagged. Inside `{...}` and `<...>`, plain
    snake_case and kebab-case names are not flagged. A mixed-case word
    with a digit, or a token-like word that is not snake_case or
    kebab-case, is flagged. `$IDENT`, `${IDENT}`, and `${IDENT:-...}`
    are not checked that way. Dotted `secrets.`, `env.`, `vars.`,
    `github.`, and `inputs.` paths are not checked that way. Any other
    password is flagged, including when the host is allowlisted.
    The secret itself is not returned.
    """
    cleaned = _trim_url(url)
    scheme, sep, rest = cleaned.partition("://")
    if not sep:
        return None
    cut = len(rest)
    for mark in "/?#":
        index = rest.find(mark)
        if index >= 0:
            cut = min(cut, index)
    authority = rest[:cut]
    if "@" not in authority:
        return None
    userinfo = authority.rsplit("@", 1)[0]
    colon = userinfo.find(":")
    if colon < 0:
        return None
    password = userinfo[colon + 1 :]
    if password == "":
        return None
    decoded = unquote(password)
    if _template_password(password) or _template_password(decoded):
        return None
    if _url_password_placeholder(password) or _url_password_placeholder(decoded):
        return None
    start = len(scheme) + len(sep) + colon + 1
    end = start + len(password)
    if start < 0 or end > len(url):
        return (0, len(url))
    return (start, end)


def _url_password_hits(line: str) -> list[_Hit]:
    hits: list[_Hit] = []
    for match in _PATS["net-url"].finditer(line):
        span = _url_password_span(match.group(0))
        if span is None:
            continue
        hits.append(
            _Hit("cred-url-password", match.start() + span[0], match.start() + span[1], "***")
        )
    return hits


def _network_hits(line: str, allow: set[str]) -> list[_Hit]:
    hits: list[_Hit] = []
    covered: list[tuple[int, int]] = []
    for match in _PATS["net-url"].finditer(line):
        covered.append(match.span())
        rule_id = _classify_url(match.group(0), allow)
        if rule_id:
            hits.append(_Hit(rule_id, match.start(), match.end(), mask_value(match.group(0))))
    blanked = list(line)
    for start, end in covered:
        for index in range(start, end):
            blanked[index] = " "
    scrubbed = "".join(blanked)

    def consider(token: str, start: int, end: int) -> None:
        parsed = _ip_from_token(token)
        if parsed == "ambiguous" or (
            isinstance(parsed, (ipaddress.IPv4Address, ipaddress.IPv6Address))
            and _is_public_ip(parsed)
        ):
            hits.append(_Hit("net-public-ip", start, end, mask_value(token)))

    ipv6_spans: list[tuple[int, int]] = []
    for match in _IPV6_RE.finditer(scrubbed):
        ipv6_spans.append(match.span())
        consider(match.group(0), match.start(), match.end())
    if ipv6_spans:
        chars = list(scrubbed)
        for start, end in ipv6_spans:
            for index in range(start, end):
                chars[index] = " "
        scrubbed = "".join(chars)
    # Digit guard: bare 8-10 digit decimals and 0x hex forms are IPv4 only
    # as a URL host (handled by _classify_url above). In free text only
    # dotted quads and IPv6 literals count, so dates and unix timestamps
    # do not match.
    for match in _DOTTED_RE.finditer(scrubbed):
        if _version_quad(scrubbed, match.start()):
            continue
        consider(match.group(0), match.start(), match.end())
    for match in _IPKW_NUM_RE.finditer(scrubbed):
        consider(match.group("num"), match.start("num"), match.end("num"))
    return hits


def _version_quad(text: str, start: int) -> bool:
    """True when a dotted quad sits in a version context and not a network keyword."""
    prefix = text[max(0, start - 80) : start]
    if _KW_CTX.search(prefix):
        return False
    return _VERSION_CTX.search(prefix) is not None


def _valid_port(port: str) -> bool:
    if not port.isdigit():
        return False
    if len(port) > 1 and port.startswith("0"):
        return False
    number = int(port)
    return 1 <= number <= 65535


def _split_host_port(authority: str) -> tuple[str | None, str | None]:
    if authority.startswith("["):
        end = authority.find("]")
        if end < 0:
            return None, None
        host = authority[1:end]
        tail = authority[end + 1 :]
        if tail == "":
            return host, None
        if tail.startswith(":") and tail.count(":") == 1:
            return host, tail[1:]
        return None, None
    if authority.count(":") > 1:
        return None, None
    if ":" in authority:
        host, port = authority.split(":", 1)
        return host, port
    return authority, None


def _host_exact_local(host: str) -> bool:
    if host == _LOCAL_V4 or host == _LOCAL_V6:
        return True
    return host.lower() == _LOCAL_NAME


def _trim_db_text(text: str) -> str:
    """Drop sentence punctuation without turning `localhost.` into `localhost`.

    A trailing dot is removed only when the URL already has a path or query,
    so a dotted host cannot become an exact local host by trimming.
    """
    trimmed = text.strip()
    while trimmed and trimmed[-1] in ",;)]}'\"":
        trimmed = trimmed[:-1]
    body = trimmed.split("://", 1)[-1]
    if trimmed.endswith(".") and any(mark in body for mark in "/?"):
        while trimmed and trimmed[-1] in ".,;)]}'\"":
            trimmed = trimmed[:-1]
    return trimmed


def inspect_db_url(value: str) -> str | None:
    """Return a db rule id, None when the URL is a local database, or NOT_DB."""
    text = _trim_db_text(value)
    if text.lower().startswith("jdbc:"):
        text = text[5:]
    scheme, sep, rest = text.partition("://")
    if sep != "://":
        return "NOT_DB"
    scheme_l = scheme.lower()
    if scheme_l not in _DB_SCHEME_SET:
        return "NOT_DB"
    if scheme_l == _SRV_SCHEME:
        return "db-mongodb-srv"
    if rest == "" or any(ord(ch) > 127 or ch.isspace() or ch in "%\\" for ch in rest):
        return "db-unparseable"
    before_query, question, query = rest.partition("?")
    if question:
        for part in query.split("&"):
            key = part.split("=", 1)[0].lower()
            if key in _QUERY_HOST_KEYS:
                return "db-unparseable"
    authority = before_query.split("/", 1)[0]
    if authority == "" or authority.count("@") > 1:
        return "db-unparseable"
    if "@" in authority:
        authority = authority.rsplit("@", 1)[1]
    if authority == "":
        return "db-unparseable"
    host, port = _split_host_port(authority)
    if host is None or host == "":
        return "db-unparseable"
    if port is not None and not _valid_port(port):
        return "db-unparseable"
    if _host_exact_local(host):
        return None
    return "db-nonlocal-host"


def _db_env_name(name: str) -> bool:
    upper = name.upper()
    return any(upper.endswith(suffix) for suffix in _DB_ENV_SUFFIXES)


def _strip_quotes(value: str) -> str:
    if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
        return value[1:-1]
    return value


def _db_hits(line: str) -> list[_Hit]:
    hits: list[_Hit] = []
    seen: set[tuple[int, str]] = set()

    def add(rule_id: str | None, start: int, raw: str, keep: int = 4) -> None:
        if rule_id is None or rule_id == "NOT_DB":
            return
        key = (start, rule_id)
        if key in seen:
            return
        seen.add(key)
        hits.append(_Hit(rule_id, start, start + len(raw), mask_value(raw, keep)))

    for match in _ENV_RE.finditer(line):
        if not _db_env_name(match.group("name")):
            continue
        raw_value = match.group("value")
        value = _strip_quotes(raw_value)
        if any(ch.isspace() for ch in value):
            add("db-unparseable", match.start("value"), raw_value, SHORT_MASK)
            continue
        if _REF_RE.fullmatch(value):
            continue
        if value == "":
            add("db-unparseable", match.start("value"), raw_value, SHORT_MASK)
            continue
        verdict = inspect_db_url(value)
        if verdict == "NOT_DB":
            verdict = "db-unparseable"
        add(verdict, match.start("value"), value, SHORT_MASK)
    for match in _PATS["db-url"].finditer(line):
        raw = match.group(0)
        add(inspect_db_url(raw), match.start(), raw)
    return hits


def _suppression(line: str, previous: str | None) -> tuple[str, str] | None:
    for text in (line, previous or ""):
        if not text:
            continue
        match = _SUPPRESS_RE.search(text)
        if match:
            return match.group(1), match.group(2).strip()
    return None


_TOKENISH_PREFIXES = (
    "gh", "github", "sk-", "sk_", "rk_", "xox", "ak" + "ia", "as" + "ia", "ai" + "za",
    "ey" + "j", "np" + "m_", "gl" + "pat", "h" + "f_", "bearer",
)


def _tokenish(fragment: str) -> bool:
    """True when a reason word looks like a long credential."""
    core = fragment.strip("'\"`()[]{}<>,;:.")
    if len(core) < 12:
        return False
    lowered = core.lower()
    if lowered.startswith(_TOKENISH_PREFIXES) and any(ch.isdigit() for ch in core):
        return True
    has_alpha = any(ch.isalpha() for ch in core)
    has_digit = any(ch.isdigit() for ch in core)
    return has_alpha and has_digit and _shannon(core) >= 3.0


# Short version words and well-known names mix a letter and a digit.
# Each version part is at most three digits, and an RFC number is at most
# five, so v2026.1021 and v20261021 are masked like any other matched token.
_BENIGN_MIXED_RE = re.compile(
    r"(?i)^(?:v\d{1,3}(?:\.\d{1,3})*|ipv[46]|rfc\d{1,5})$"
)


def _looks_secret(fragment: str) -> bool:
    """True when a reason word must not be printed.

    Long token-like words are included. A shorter word that mixes a letter
    and a digit is included even when it is not the matched value.
    Short version words (`v1.2`, each part at most three digits) and
    well-known words (`ipv4`, `rfc2606`, an RFC number of at most five
    digits) are not. `v2026.1021` and `v20261021` are.
    """
    if _tokenish(fragment):
        return True
    core = fragment.strip("'\"`()[]{}<>,;:.")
    if len(core) < 4:
        return False
    if _BENIGN_MIXED_RE.fullmatch(core):
        return False
    return any(ch.isalpha() for ch in core) and any(ch.isdigit() for ch in core)


def _echoes_match(word: str, matched: str) -> bool:
    """True when a reason word repeats the matched span, even if short."""
    core = word.strip("'\"`()[]{}<>,;:.")
    if not core or not matched:
        return False
    left = core.lower()
    right = matched.lower()
    if left == right:
        return True
    # Four characters either way. Shorter slices are not redacted, so a
    # one-character piece of a long token does not wipe the reason.
    if len(left) >= 4 and left in right:
        return True
    if len(right) >= 4 and right in left:
        return True
    return False


def _safe_reason(reason: str, matched: str = "") -> str:
    if (
        _credential_hits(reason)
        or _db_hits(reason)
        or _PATS["net-url"].search(reason)
    ):
        return "(redacted reason)"
    words = [
        "***" if _looks_secret(word) or _echoes_match(word, matched) else word
        for word in reason.split(" ")
    ]
    reason = " ".join(words)
    if len(reason) > 160:
        return reason[:160] + "..."
    return reason


def parse_diff(diff_text: str) -> list[_FileDiff]:
    if "\0" in diff_text:
        raise Unparseable("diff")
    if diff_text.strip() and "diff --git " not in diff_text:
        raise Unparseable("diff")
    files: list[_FileDiff] = []
    current: _FileDiff | None = None
    in_hunk = False
    new_line = 0
    skipping_binary = False
    for raw in diff_text.splitlines():
        if raw.startswith("diff --git "):
            current = _FileDiff(path="")
            files.append(current)
            in_hunk = False
            skipping_binary = False
            rest = raw[len("diff --git ") :]
            marker = " b/"
            if rest.startswith("a/") and marker in rest:
                b_path = rest.split(marker, 1)[1]
                try:
                    current.path = _strip_diff_path("b/" + b_path)
                except Unparseable:
                    raise
            continue
        if current is None:
            if raw.strip():
                raise Unparseable("diff")
            continue
        if raw.startswith("GIT binary patch") or raw.startswith("Binary files "):
            current.binary = True
            current.added.clear()
            in_hunk = False
            skipping_binary = True
            if raw.startswith("Binary files "):
                match = re.match(r"^Binary files (.*) and (.*) differ$", raw)
                if match and not current.path:
                    current.path = _strip_diff_path(match.group(2))
            continue
        if skipping_binary:
            continue
        if raw.startswith("rename to "):
            current.path = _safe_rel(raw[len("rename to ") :])
            continue
        if not in_hunk and (
            raw.startswith("+++ ") or raw.startswith("--- ") or raw.startswith("index ")
        ):
            if raw.startswith("+++ "):
                stripped = _strip_diff_path(raw[4:])
                if stripped:
                    current.path = stripped
            continue
        if raw.startswith("@@@"):
            raise Unparseable("diff")
        if raw.startswith("@@"):
            match = _HUNK_RE.match(raw)
            if not match:
                raise Unparseable("diff")
            new_line = int(match.group(3))
            in_hunk = True
            continue
        if not in_hunk:
            if raw.startswith(
                (
                    "new file ",
                    "deleted file ",
                    "old mode ",
                    "new mode ",
                    "similarity ",
                    "rename from ",
                    "copy from ",
                    "copy to ",
                    "dissimilarity ",
                )
            ):
                continue
            if raw.strip() == "":
                continue
            raise Unparseable("diff")
        if raw.startswith("+"):
            current.added.append((new_line, raw[1:]))
            new_line += 1
            continue
        if raw.startswith("-") or raw.startswith("\\"):
            continue
        if raw.startswith(" "):
            new_line += 1
            continue
        raise Unparseable("diff")
    for item in files:
        if item.path:
            item.path = _safe_rel(item.path)
        elif item.added or item.binary:
            raise Unparseable("diff")
    return files


def _file_has_nul(path: Path) -> bool:
    try:
        with path.open("rb") as handle:
            while True:
                chunk = handle.read(1024 * 1024)
                if not chunk:
                    return False
                if b"\x00" in chunk:
                    return True
    except OSError as exc:
        raise Unparseable("file") from exc


def _inside(root: Path, path: Path) -> None:
    try:
        root_resolved = root.resolve()
        target = path.resolve()
    except OSError as exc:
        raise Unparseable("file") from exc
    try:
        target.relative_to(root_resolved)
    except ValueError as exc:
        raise Unparseable("file") from exc


def _worktree_facts(root: Path | None, rel: str) -> tuple[int | None, str]:
    """Return (size, kind) where kind is missing, text, binary, or too-large."""
    if root is None:
        return None, "missing"
    candidate = root / rel
    if not candidate.exists():
        return None, "missing"
    _inside(root, candidate)
    try:
        size = candidate.stat().st_size
    except OSError as exc:
        raise Unparseable("file") from exc
    if size > MAX_FILE_BYTES and not _size_exempt(rel):
        return size, "too-large"
    if size > MAX_FILE_BYTES:
        if _file_has_nul(candidate):
            return size, "binary"
        return size, "text"
    try:
        data = candidate.read_bytes()
    except OSError as exc:
        raise Unparseable("file") from exc
    if b"\x00" in data:
        return size, "binary"
    try:
        data.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise Unparseable("file") from exc
    return size, "text"


def _read_line(root: Path, rel: str, lineno: int) -> str:
    if lineno < 1:
        return ""
    candidate = root / rel
    if not candidate.is_file():
        return ""
    _inside(root, candidate)
    try:
        with candidate.open("rb") as handle:
            for index, raw in enumerate(handle, start=1):
                if index != lineno:
                    continue
                if b"\x00" in raw:
                    return ""
                try:
                    return raw.decode("utf-8").rstrip("\r\n")
                except UnicodeDecodeError as exc:
                    raise Unparseable("file") from exc
    except OSError as exc:
        raise Unparseable("file") from exc
    return ""


def _apply_suppression(
    hit: _Hit,
    path: str,
    lineno: int,
    line: str,
    previous: str | None,
) -> Finding:
    found = _suppression(line, previous)
    rule_class = _rule_class(hit.rule_id)
    if found and found[0] == hit.rule_id and rule_class in {"a", "b"}:
        return Finding(
            path=path,
            line=lineno,
            rule_id=hit.rule_id,
            masked=hit.masked,
            suppressed=True,
            note=_safe_reason(found[1], line[hit.start : hit.end]),
        )
    note = ""
    if found and found[0] == hit.rule_id and rule_class not in {"a", "b"}:
        note = "suppression ignored"
    return Finding(
        path=path,
        line=lineno,
        rule_id=hit.rule_id,
        masked=hit.masked,
        suppressed=False,
        note=note,
    )


def scan_diff(
    diff_text: str,
    *,
    root: Path | None = None,
    allow: set[str] | None = None,
    max_bytes: int = MAX_FILE_BYTES,
) -> list[Finding]:
    if allow is None:
        allow = load_allowlist(Path(__file__).resolve().parent / "allowed-hosts.txt")
    findings: list[Finding] = []
    seen: set[tuple[str, int, str]] = set()
    for item in parse_diff(diff_text):
        if not item.path:
            continue
        rel = _safe_rel(item.path)
        path_hits = _credential_hits(rel) + _url_password_hits(rel) + _network_hits(rel, allow)
        shown = rel
        for hit in sorted(path_hits, key=lambda item: item.start, reverse=True):
            shown = shown[: hit.start] + hit.masked + shown[hit.end :]
        for hit in path_hits:
            key = (shown, 0, hit.rule_id)
            if key not in seen:
                seen.add(key)
                findings.append(
                    Finding(path=shown, line=0, rule_id=hit.rule_id, masked=hit.masked, note="in file path")
                )
        added_bytes = sum(len(text.encode("utf-8")) + 1 for _, text in item.added)
        try:
            size, kind = _worktree_facts(root, rel)
        except Unparseable:
            raise
        if size is None:
            size = added_bytes
            kind = "binary" if item.binary else "text"
        elif item.binary and kind == "text":
            kind = "binary"
        too_large = max(size or 0, added_bytes) > max_bytes and not _size_exempt(rel)
        if too_large or kind == "too-large":
            note = "too large to scan"
            for _lineno, text in item.added:
                found = _suppression(text, None)
                if found and found[0] == "file-too-large":
                    note = "too large to scan; suppression ignored"
                    break
            finding = Finding(
                path=shown,
                line=1,
                rule_id="file-too-large",
                masked="***",
                note=note,
            )
            findings.append(finding)
            continue
        if kind == "binary" or item.binary:
            continue
        added_map = {lineno: text for lineno, text in item.added}
        code = _is_code_config(rel)
        for lineno, text in item.added:
            previous = added_map.get(lineno - 1)
            if previous is None and root is not None and lineno > 1:
                previous = _read_line(root, rel, lineno - 1)
            hits = _credential_hits(text)
            hits.extend(_url_password_hits(text))
            db_hits = _db_hits(text)
            hits.extend(db_hits)
            if code:
                covered = [(hit.start, hit.end) for hit in db_hits]
                for hit in _network_hits(text, allow):
                    if any(hit.start < end and hit.end > start for start, end in covered):
                        continue
                    hits.append(hit)
            for hit in hits:
                key = (shown, lineno, hit.rule_id)
                if key in seen:
                    continue
                seen.add(key)
                findings.append(_apply_suppression(hit, shown, lineno, text, previous))
    return findings


def format_summary(findings: Sequence[Finding]) -> str:
    blocking = [item for item in findings if not item.suppressed]
    suppressed = [item for item in findings if item.suppressed]
    lines = ["### Code gate", ""]
    if not blocking and not suppressed:
        lines.append("No findings.")
        return "\n".join(lines) + "\n"
    lines.append(f"Blocking: {len(blocking)}")
    lines.append("")
    if blocking:
        for item in blocking:
            extra = f" {item.note}" if item.note else ""
            lines.append(
                f"- {item.path}:{item.line} {item.rule_id} {item.masked}{extra}"
            )
    else:
        lines.append("No blocking findings.")
    if suppressed:
        lines.append("")
        lines.append("Suppressed:")
        lines.append("")
        for item in suppressed:
            lines.append(
                f"- {item.path}:{item.line} {item.rule_id} {item.masked} reason: {item.note}"
            )
    return "\n".join(lines) + "\n"


def resolve_event(
    event: str,
    *,
    base: str | None,
    head: str | None,
    before: str | None,
    after: str | None,
    main_ref: str,
    rev_exists: Callable[[str], bool],
    merge_base: Callable[[str, str], str | None],
) -> str:
    def require_sha(value: str | None) -> str:
        if not value or not SHA_RE.fullmatch(value):
            raise MissingBase()
        return value

    if event == "pull_request":
        base_sha = require_sha(base)
        head_sha = require_sha(head)
        if not rev_exists(base_sha) or not rev_exists(head_sha):
            raise MissingBase()
        return f"{base_sha}...{head_sha}"
    if event == "push":
        before_sha = require_sha(before)
        after_sha = require_sha(after)
        if after_sha == ZERO_SHA:
            return "SKIP"
        if not rev_exists(after_sha):
            raise MissingBase()
        if before_sha == ZERO_SHA:
            merged = merge_base(after_sha, main_ref)
            if not merged or not SHA_RE.fullmatch(merged):
                raise MissingBase()
            return f"{merged}...{after_sha}"
        if not rev_exists(before_sha):
            raise MissingBase()
        return f"{before_sha}..{after_sha}"
    raise MissingBase()


def _git_rev_exists(rev: str, cwd: Path | None) -> bool:
    if not SHA_RE.fullmatch(rev):
        return False
    proc = subprocess.run(
        ["git", "rev-parse", "--verify", "--end-of-options", rev + "^{commit}"],
        cwd=cwd,
        capture_output=True,
        check=False,
    )
    return proc.returncode == 0


def _git_merge_base(after: str, main_ref: str, cwd: Path | None) -> str | None:
    if not re.fullmatch(r"[A-Za-z0-9_./-]+", main_ref) or main_ref.startswith("-"):
        return None
    if any(part == ".." for part in main_ref.split("/")):
        return None
    if not SHA_RE.fullmatch(after):
        return None
    proc = subprocess.run(
        ["git", "merge-base", "--end-of-options", after, main_ref],
        cwd=cwd,
        capture_output=True,
        check=False,
    )
    if proc.returncode != 0:
        return None
    text = proc.stdout.decode("utf-8", "replace").strip()
    if not SHA_RE.fullmatch(text):
        return None
    return text


def _git_diff(range_spec: str, cwd: Path | None) -> str:
    if not RANGE_RE.fullmatch(range_spec) or range_spec.startswith("-"):
        raise Unparseable("diff")
    try:
        proc = subprocess.run(
            [
                "git",
                "-c",
                "core.quotepath=false",
                "diff",
                "--no-color",
                "--unified=0",
                "--no-ext-diff",
                "--end-of-options",
                range_spec,
            ],
            cwd=cwd,
            capture_output=True,
            check=False,
        )
    except OSError as exc:
        raise MissingBase() from exc
    if proc.returncode != 0:
        raise MissingBase()
    try:
        return proc.stdout.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise Unparseable("diff") from exc


def _emit(summary_path: str | None, text: str, *, to_stdout: bool) -> None:
    if summary_path:
        path = Path(summary_path)
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("a", encoding="utf-8") as handle:
            handle.write(text)
    if to_stdout:
        sys.stdout.write(text)


def _closed_message(exc: Exception) -> str:
    if isinstance(exc, MissingBase):
        return "failed closed (missing diff base)\n"
    if isinstance(exc, Unparseable):
        if exc.kind == "diff":
            return "failed closed (unparseable diff)\n"
        return "failed closed (unparseable file)\n"
    return "failed closed (internal error)\n"


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Scan a diff with the code gate.")
    parser.add_argument("--range", default="")
    parser.add_argument("--diff-file", default="")
    parser.add_argument("--summary", default="")
    parser.add_argument("--allowlist", default="")
    parser.add_argument("--root", default="")
    parser.add_argument("--resolve", action="store_true")
    parser.add_argument("--event", default="")
    parser.add_argument("--base", default="")
    parser.add_argument("--head", default="")
    parser.add_argument("--before", default="")
    parser.add_argument("--after", default="")
    parser.add_argument("--main-ref", default="origin/main")
    args = parser.parse_args(list(argv) if argv is not None else None)
    summary = args.summary or None
    cwd = Path(args.root).resolve() if args.root else None
    try:
        if args.resolve:
            spec = resolve_event(
                args.event,
                base=args.base or None,
                head=args.head or None,
                before=args.before or None,
                after=args.after or None,
                main_ref=args.main_ref,
                rev_exists=lambda rev: _git_rev_exists(rev, cwd),
                merge_base=lambda after, ref: _git_merge_base(after, ref, cwd),
            )
            sys.stdout.write(spec + "\n")
            return 0
        if bool(args.range) == bool(args.diff_file):
            _emit(summary, "failed closed (internal error)\n", to_stdout=True)
            return 2
        allow_path = (
            Path(args.allowlist)
            if args.allowlist
            else Path(__file__).resolve().parent / "allowed-hosts.txt"
        )
        allow = load_allowlist(allow_path)
        if args.diff_file:
            if args.diff_file == "-":
                data = sys.stdin.buffer.read()
            else:
                data = Path(args.diff_file).read_bytes()
            try:
                diff_text = data.decode("utf-8")
            except UnicodeDecodeError as exc:
                raise Unparseable("diff") from exc
        else:
            diff_text = _git_diff(args.range, cwd)
        root = cwd if cwd is not None else None
        findings = scan_diff(diff_text, root=root, allow=allow)
    except (MissingBase, Unparseable) as exc:
        message = _closed_message(exc)
        _emit(summary, message, to_stdout=True)
        sys.stderr.write(message)
        if os.environ.get("CODE_GATE_DEBUG") == "1":
            sys.stderr.write(type(exc).__name__ + "\n")
        return 2
    except Exception as exc:
        _emit(summary, "failed closed (internal error)\n", to_stdout=True)
        sys.stderr.write("failed closed (internal error)\n")
        if os.environ.get("CODE_GATE_DEBUG") == "1":
            sys.stderr.write(type(exc).__name__ + "\n")
        return 2
    text = format_summary(findings)
    _emit(summary, text, to_stdout=True)
    if any(not item.suppressed for item in findings):
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
