#!/usr/bin/env python3
"""False-negative harness for the code gate (SYNTHETIC cases only).

Every case is built at runtime from split string parts, so this file holds
no contiguous key, public address, or database URL. Each base case is put
in six line contexts and scanned as an added line in `a.py`. A case is
caught when the expected rule id is among the blocking findings.

Run: python3 scripts/code-gate/fn_harness.py
Exit 0 when every case is caught, 1 otherwise. Missed cases print the rule
and context only, never the value.
"""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Callable

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import gate  # noqa: E402
import test_gate as t  # noqa: E402

ALLOW = {"github.com", "api.github.com", "docs.github.com"}

CONTEXTS: list[tuple[str, Callable[[str], str]]] = [
    ("bare", lambda v: v),
    ("dq-assign", lambda v: 'x = "' + v + '"'),
    ("sq-assign", lambda v: "x = '" + v + "'"),
    ("json", lambda v: '{"k": "' + v + '"}'),
    ("comment", lambda v: "# note " + v),
    ("call-arg", lambda v: "f(" + v + ", 1)"),
]


def bases() -> list[tuple[str, str]]:
    value = t.high_entropy()
    public = t.ipv4(8, 8, 8, 8)
    out: list[tuple[str, str]] = [
        (t.gh_token("p"), "cred-github-token"),
        (t.gh_token("o"), "cred-github-token"),
        (t.gh_token("s"), "cred-github-token"),
        (t.gh_token("u"), "cred-github-token"),
        (t.github_pat(), "cred-github-token"),
        (t.openai_proj(), "cred-openai"),
        (t.openai_plain(), "cred-openai"),
        (t.openai_svc(t.join("svc", "acct")), "cred-openai"),
        (t.openai_svc(t.join("ad", "min")), "cred-openai"),
        (t.anthropic(), "cred-anthropic"),
        (t.google_key(), "cred-google-api"),
        (t.stripe("sk_"), "cred-stripe"),
        (t.stripe("rk_"), "cred-stripe"),
        (t.slack("b"), "cred-slack"),
        (t.slack("p"), "cred-slack"),
        (t.slack_hook(), "cred-slack-webhook"),
        (t.npm_token(), "cred-npm"),
        (t.gitlab_pat(), "cred-gitlab"),
        (t.hf_token(), "cred-huggingface"),
        (t.pem("RSA "), "cred-private-key"),
        (t.pem("OPENSSH "), "cred-private-key"),
        (t.jwt(), "cred-jwt"),
        (t.aws_access(t.join("AK", "IA")), "cred-aws-access-key"),
        (t.aws_access(t.join("AS", "IA")), "cred-aws-access-key"),
        (t.aws_secret_line(), "cred-aws-secret"),
        ("api_token=" + value, "cred-generic-secret"),
        ("password: " + t.sym_secret(), "cred-generic-secret"),
        (t.join("Author", "ization: ", "Bea", "rer ") + value, "cred-bearer-token"),
        (t.https_url("example.com/a"), "net-public-url"),
        (t.wss_url("evil.example.org/s"), "net-public-url"),
        (t.http_url(public + "/a"), "net-public-ip"),
        (public, "net-public-ip"),
        (":".join(["2001", "4860", "4860", "", "8888"]), "net-public-ip"),
        (t.http_url(t.dec_public() + "/"), "net-public-ip"),
        ("ip=" + t.dec_public(), "net-public-ip"),
        (t.pg("evil.example/db"), "db-nonlocal-host"),
        (t.db_url(t.db_scheme("re", "dis"), "cache.example:6379/0"), "db-nonlocal-host"),
        (t.db_url(t.db_scheme("mongo", "db+", "srv"), "localhost/db"), "db-mongodb-srv"),
        (t.pg("%6cocalhost/db"), "db-unparseable"),
        (t.join("DATA", "BASE_URL") + "=" + t.pg("10.0.0.5/db"), "db-nonlocal-host"),
    ]
    return out


def run() -> tuple[int, int, list[str]]:
    caught = 0
    total = 0
    missed: list[str] = []
    for value, rule in bases():
        for name, wrap in CONTEXTS:
            total += 1
            line = wrap(value)
            found = gate.scan_diff(t.added("a.py", [line]), allow=ALLOW)
            ids = {item.rule_id for item in found if not item.suppressed}
            if rule in ids:
                caught += 1
            else:
                missed.append(rule + " in " + name)
    return caught, total, missed


def main() -> int:
    caught, total, missed = run()
    print(f"SYNTHETIC false-negative harness: caught {caught}/{total}")
    for item in missed:
        print("missed: " + item)
    return 0 if caught == total else 1


if __name__ == "__main__":
    raise SystemExit(main())
