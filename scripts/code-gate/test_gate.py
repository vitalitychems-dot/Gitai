"""Unit tests for the diff-only code gate.

Fixtures are built at runtime. This file must not contain a contiguous token,
public address, private-key banner, or database URL.
"""

from __future__ import annotations

import io
import os
import re
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
_MESH_SCRIPT_NAMES = ("mesh-queue.sh", "mesh-watch.sh")


def _mesh_test_action(scripts_present: bool, *, mesh_dir: bool, require_env: bool) -> str:
    """Run when the scripts exist. Fail when this repo requires them. Otherwise skip."""
    if scripts_present:
        return "run"
    if mesh_dir or require_env:
        return "fail"
    return "skip"


def _guard_mesh_scripts(test: unittest.TestCase) -> None:
    missing = [
        "scripts/" + name
        for name in _MESH_SCRIPT_NAMES
        if not (REPO / "scripts" / name).is_file()
    ]
    action = _mesh_test_action(
        not missing,
        mesh_dir=(REPO / "mesh").is_dir(),
        require_env=os.environ.get("COLLAB_REQUIRE_MESH_TESTS") == "1",
    )
    if action == "run":
        return
    if action == "fail":
        test.fail("required mesh script missing: " + ", ".join(missing))
    test.skipTest(
        "scripts/mesh-queue.sh and scripts/mesh-watch.sh are absent from this repo"
    )

import sys

sys.path.insert(0, str(HERE))

import gate

ALLOW = {"github.com", "api.github.com", "docs.github.com"}
ZERO = "0" * 40


def join(*parts: str) -> str:
    return "".join(parts)


def ipv4(*octets: int) -> str:
    return ".".join(str(part) for part in octets)


def http_url(host: str) -> str:
    return join("ht", "tp", "://") + host


def https_url(host: str) -> str:
    return join("ht", "tps", "://") + host


def ws_url(host: str) -> str:
    return join("ws", "://") + host


def wss_url(host: str) -> str:
    return join("ws", "s", "://") + host


def db_scheme(*parts: str) -> str:
    return join(*parts)


def db_url(scheme: str, rest: str) -> str:
    return scheme + "://" + rest


def pem(label: str = "") -> str:
    return join("-----", "BE", "GIN ") + label + join("PRIVATE ", "KEY") + join("-----")


def jwt() -> str:
    return join("eyJ", "abcdefgh", ".", "ijklmnop", ".", "qrstuvwx")


def high_entropy() -> str:
    return join("abcdefghij", "0123456789")


def gh_token(kind: str) -> str:
    return join("gh", kind, "_") + ("A1" * 18)


def github_pat() -> str:
    return join("github", "_pat_") + ("Ab1_" * 6)


def openai_proj() -> str:
    return join("sk-", "proj-") + ("a1" * 10)


def openai_plain() -> str:
    return join("sk-") + ("b2" * 10)


def anthropic() -> str:
    return join("sk-", "ant-") + ("c3" * 8)


def google_key() -> str:
    return join("AI", "za") + ("d4E" * 12)[:35]


def stripe(prefix: str) -> str:
    return join(prefix, "live_") + ("e5" * 8)


def slack(kind: str) -> str:
    return join("xox", kind, "-") + join("a1", "b2", "c3", "d4", "e5")


def assign(name: str, value: str) -> str:
    return name + "=" + value


def aws_access(prefix: str) -> str:
    return join(prefix) + ("AB" * 8)


def aws_secret_line() -> str:
    name = join("aws_", "secret_", "access_", "key")
    value = ("aA" + "1/") * 10
    return name + "=" + value


def dec_public() -> str:
    return str((8 << 24) | (8 << 16) | (8 << 8) | 8)


def dec_loop() -> str:
    return str((127 << 24) | 1)


def hex_public() -> str:
    return format((8 << 24) | (8 << 16) | (8 << 8) | 8, "#x")


def hex_loop() -> str:
    return format((127 << 24) | 1, "#x")


def dotted_hex_public() -> str:
    return ".".join(format(8, "#x") for _ in range(4))


def sym_secret() -> str:
    return join("Zq7", "!@#$%", "Lm3", "Xv9", "Pk2", "Rt8", "Wb")


def openai_svc(kind: str) -> str:
    return join("sk-", kind, "-") + ("f6G" * 8)


def npm_token() -> str:
    return join("np", "m_") + ("g7H" * 12)


def gitlab_pat() -> str:
    return join("gl", "pat-") + ("h8J" * 7)


def hf_token() -> str:
    return join("h", "f_") + ("kLmNoP" * 6)


def slack_hook() -> str:
    path = join("T", "ABC1234", "/", "B", "DEF5678", "/") + ("q9R" * 8)
    return https_url(join("hooks", ".slack", ".com/", "services/") + path)


def noreply_id() -> str:
    return str(332565808) + "+" + join("vitality", "chems-dot", "@users", ".noreply", ".github", ".com")


def added(path: str, lines: list[str]) -> str:
    body = [
        f"diff --git a/{path} b/{path}",
        "new file mode 100644",
        "--- /dev/null",
        f"+++ b/{path}",
        f"@@ -0,0 +1,{len(lines)} @@",
    ]
    for line in lines:
        body.append("+" + line)
    return "\n".join(body) + "\n"


def scan(text: str, **kwargs: object) -> list[gate.Finding]:
    allow = kwargs.pop("allow", ALLOW)
    return gate.scan_diff(text, allow=allow, **kwargs)  # type: ignore[arg-type]


def blocking(text: str, **kwargs: object) -> list[gate.Finding]:
    return [item for item in scan(text, **kwargs) if not item.suppressed]


def rules(text: str, **kwargs: object) -> list[str]:
    return [item.rule_id for item in blocking(text, **kwargs)]


def pg(rest: str) -> str:
    return db_url(db_scheme("post", "gres"), rest)


class GateTests(unittest.TestCase):
    def test_mask_and_repr_hide_the_rest(self) -> None:
        token = gh_token("p")
        masked = gate.mask_value(token)
        self.assertEqual(masked, token[:4] + "***")
        self.assertNotIn(token[4:], masked)
        found = gate.Finding("a.py", 1, "cred-github-token", masked)
        self.assertNotIn(token, repr(found))
        self.assertEqual(gate.mask_value("ab"), "***")

    def test_aws_access_and_secret(self) -> None:
        for prefix in (join("AK", "IA"), join("AS", "IA")):
            hit = rules(added("a.py", [aws_access(prefix)]))
            self.assertEqual(hit, ["cred-aws-access-key"])
        self.assertEqual(rules(added("a.py", [aws_secret_line()])), ["cred-aws-secret"])
        self.assertEqual(rules(added("a.py", [aws_access(join("AK", "IA"))[:-1]])), [])
        self.assertEqual(rules(added("a.py", [aws_access(join("AK", "IA")).lower()])), [])

    def test_github_openai_anthropic_google_stripe_slack(self) -> None:
        pairs = [
            (gh_token("p"), "cred-github-token"),
            (gh_token("o"), "cred-github-token"),
            (gh_token("s"), "cred-github-token"),
            (gh_token("u"), "cred-github-token"),
            (github_pat(), "cred-github-token"),
            (openai_proj(), "cred-openai"),
            (openai_plain(), "cred-openai"),
            (anthropic(), "cred-anthropic"),
            (google_key(), "cred-google-api"),
            (stripe(join("sk_", )), "cred-stripe"),
            (stripe(join("rk_", )), "cred-stripe"),
        ]
        for kind in ("a", "b", "p", "r", "s"):
            pairs.append((slack(kind), "cred-slack"))
        for value, rule in pairs:
            with self.subTest(rule=rule, prefix=value[:4]):
                self.assertEqual(rules(added("a.py", [value])), [rule])
                self.assertNotIn(value, gate.format_summary(scan(added("a.py", [value]))))
        self.assertEqual(rules(added("a.py", [gh_token("p")[:-1]])), [])
        self.assertEqual(rules(added("a.py", [google_key()[:-1]])), [])
        self.assertEqual(rules(added("a.py", [join("sk_", "test_") + ("a" * 16)])), [])
        self.assertEqual(
            rules(added("a.py", ["api_key = " + gh_token("p")])),
            ["cred-github-token"],
        )

    def test_pem_and_jwt(self) -> None:
        for label in ("", "RSA ", "DSA ", "EC ", "OPENSSH ", "ENCRYPTED ", "PGP "):
            self.assertEqual(rules(added("k.txt", [pem(label)])), ["cred-private-key"])
        self.assertEqual(rules(added("k.txt", [pem().lower()])), [])
        self.assertEqual(rules(added("k.txt", [jwt()])), ["cred-jwt"])
        short = join("eyJ", "abc", ".", "def", ".", "ghi")
        self.assertEqual(rules(added("k.txt", [short])), [])

    def test_generic_secret_positive_and_negative(self) -> None:
        value = high_entropy()
        self.assertGreaterEqual(gate._shannon(value), gate.ENTROPY_THRESHOLD)
        for line in (
            "token = " + value,
            "api_key=" + value,
            'secret: "' + value + '"',
            "db_password = " + value,
        ):
            self.assertEqual(rules(added("a.py", [line])), ["cred-generic-secret"])
        self.assertEqual(rules(added("a.py", ["token = " + ("a" * 20) + "1"])), [])
        self.assertEqual(rules(added("a.py", ["token = " + ("abcdefghij" * 2)])), [])
        self.assertEqual(rules(added("a.py", ["token = " + ("0" * 20)])), [])
        self.assertEqual(
            rules(added("a.py", ["token = " + join("your-", "api-key-", "12", "34")])),
            [],
        )
        self.assertEqual(rules(added("a.py", ["token = $" + value])), [])
        self.assertEqual(
            rules(added("a.py", ["note = " + value])),
            [],
        )

    def test_network_urls_and_ips(self) -> None:
        public_ip = ipv4(8, 8, 8, 8)
        cases = [
            (http_url("example.com/a"), ["net-public-url"]),
            (https_url("notgithub.com/a"), ["net-public-url"]),
            (https_url("github.com.evil.com/a"), ["net-public-url"]),
            (ws_url("example.com/a"), ["net-public-url"]),
            (wss_url("example.com/a"), ["net-public-url"]),
            (https_url("github.com/org/repo"), []),
            (https_url("api.github.com/v3"), []),
            (https_url("docs.github.com/en"), []),
            (https_url("codeload.github.com/x"), []),
            (https_url("GitHub.com/x"), []),
            (http_url("localhost/a"), []),
            (http_url("foo.localhost/a"), []),
            (http_url("127.0.0.1/a"), []),
            (http_url("[::1]/a"), []),
            (http_url(public_ip + "/a"), ["net-public-ip"]),
            (public_ip, ["net-public-ip"]),
            (dec_public(), []),
            (http_url(dec_public()), ["net-public-ip"]),
            (dec_loop(), []),
            (hex_public(), []),
            (http_url(hex_public()), ["net-public-ip"]),
            (hex_loop(), []),
            (dotted_hex_public(), ["net-public-ip"]),
            (".".join(["010", "0", "0", "1"]), ["net-public-ip"]),
            (".".join(["192", "168", "001", "001"]), ["net-public-ip"]),
            (".".join(["127", "000", "000", "001"]), ["net-public-ip"]),
            (ipv4(10, 1, 2, 3), []),
            (ipv4(172, 16, 0, 1), []),
            (ipv4(192, 168, 1, 1), []),
            (ipv4(169, 254, 1, 1), []),
            (ipv4(224, 0, 0, 1), []),
            (ipv4(100, 64, 0, 1), []),
            (ipv4(192, 0, 2, 1), []),
            (ipv4(1, 2, 3, 4), ["net-public-ip"]),
            (ipv4(192, 88, 99, 1), ["net-public-ip"]),
            (":".join(["2001", "db8", "", "1"]), []),
            (":".join(["fe80", "", "1"]), []),
            (":".join(["ff02", "", "1"]), []),
            ("::ffff:" + "127.0.0.1", []),
            ("::ffff:" + public_ip, ["net-public-ip"]),
            (":".join(["2001", "4860", "4860", "", "8888"]), ["net-public-ip"]),
            (":".join(["64", "ff9b", ""]) + ":" + public_ip, []),
            (str(10**7 - 1), []),
        ]
        for line, expect in cases:
            with self.subTest(line=line[:12], expect=expect):
                self.assertEqual(rules(added("a.py", [line])), expect)

    def test_network_skips_markdown_credentials_do_not(self) -> None:
        url = https_url("example.com/a")
        self.assertEqual(rules(added("README.md", [url])), [])
        self.assertEqual(rules(added("README.md", [gh_token("p")])), ["cred-github-token"])
        self.assertEqual(rules(added("README.md", [pg("evil.example/db")])), ["db-nonlocal-host"])
        self.assertEqual(rules(added("Dockerfile", [url])), ["net-public-url"])
        self.assertEqual(rules(added(".env.local", [url])), ["net-public-url"])

    def test_digit_guard_bare_numbers_only_in_url_host(self) -> None:
        cases = [
            ("20261021", []),
            ("1761083000", []),
            ("date = 20261021", []),
            ("ts: 1761083000", []),
            ("mask = 0x08080808", []),
            (http_url("134744072/"), ["net-public-ip"]),
            (http_url("0x08080808/"), ["net-public-ip"]),
            (http_url("2130706433/"), []),
        ]
        for line, expect in cases:
            with self.subTest(line=line, expect=expect):
                self.assertEqual(rules(added("a.py", [line])), expect)

    def test_gitai_digit_guard_and_keywords(self) -> None:
        public = dec_public()
        hexed = hex_public()
        cases = [
            ("git config user.email " + noreply_id(), []),
            ("email = '" + noreply_id() + "'", []),
            ("ts = " + str(1761084000), []),
            ("seed = " + str(1013904223), []),
            ("magic = " + join("0x", "CAFE", "BABE"), []),
            ("oid = '" + ".".join(["1", "3", "6", "1", "4", "1", "311"]) + "'", []),
            (".".join(["1", "3", "6", "1"]) + ".", ["net-public-ip"]),
            (".".join(["8", "8", "8", "8", "8"]), []),
            (".".join(["256", "8", "8", "8"]), []),
            ("version " + ".".join(["2", "10", "300", "4"]), []),
            ("ip=" + public, ["net-public-ip"]),
            ("--ip " + public, ["net-public-ip"]),
            ("host = " + hexed, ["net-public-ip"]),
            ('"addr": ' + public, ["net-public-ip"]),
            ("server_ip: " + public, ["net-public-ip"]),
            ("ip=" + dec_loop(), []),
            ("zip=" + public, []),
            ("ipsum " + public, []),
        ]
        for line, expect in cases:
            with self.subTest(line=line[:16], expect=expect):
                self.assertEqual(rules(added("a.sh", [line])), expect)

    def test_gitai_host_cut_at_template_marks(self) -> None:
        # The host is not cut at $ { or backslash. A cut used to leave an
        # allowlisted or dotless prefix, which was then allowed.
        cases = [
            ("s/x/" + https_url("api.github.com$1") + "/", ["net-public-url"]),
            ("re = r'" + https_url("github\\.com/") + "'", []),
            (https_url("github.com{path}"), ["net-public-url"]),
            (https_url("api.github.com${X}/a"), ["net-public-url"]),
            (https_url("github.com\\evil.com/"), []),
            (https_url("github.com$@evil.com/"), ["net-public-url"]),
            (https_url("evil.com$1"), ["net-public-url"]),
            (https_url("github\\.com\\.evil\\.com/"), ["net-public-url"]),
            (https_url("$HOST/a"), ["net-public-url"]),
            ("urlopen('" + http_url("example") + "')", []),
            (http_url("intranet:8080/x"), ["net-public-url"]),
            (http_url("example.com"), ["net-public-url"]),
        ]
        for line, expect in cases:
            with self.subTest(line=line[:20], expect=expect):
                self.assertEqual(rules(added("a.py", [line])), expect)

    def test_uncut_dotless_percent_and_backslash_hosts(self) -> None:
        flagged = ["net-public-url"]
        cases = [
            (https_url("exfil${''}.attacker.com"), flagged),
            (http_url("exfil/x"), flagged),
            (http_url("evil%2Ecom/a"), flagged),
            (http_url("github.com\\@evil.com/a"), flagged),
            (http_url("localhost/x"), []),
            (http_url("api.localhost/x"), []),
            (http_url("127.0.0.1/x"), []),
            (http_url("[::1]/x"), []),
        ]
        for line, expect in cases:
            with self.subTest(line=line[:24], expect=expect):
                self.assertEqual(rules(added("a.py", [line])), expect)
        self.assertEqual(gate._url_host(http_url("github.com\\@evil.com/a")), "evil.com")
        self.assertEqual(gate._url_host(http_url("evil%2Ecom/a")), "evil.com")
        self.assertEqual(gate._url_host(https_url("exfil${''}.attacker.com")), "exfil${''}.attacker.com")
        self.assertEqual(gate._url_host(http_url("exfil/x")), "exfil")
        self.assertEqual(gate._url_host(https_url("api.github.com$1")), "api.github.com$1")
        self.assertEqual(gate._url_host(https_url("github\\.com/")), "github.com")
        self.assertEqual(gate._url_host(https_url("github.com\\evil.com/")), "github.com")
        self.assertEqual(
            rules(added("a.py", [http_url(ipv4(169, 254, 169, 254) + "/")])),
            [],
        )
        db = pg("127.0.0.1:5432/app")
        self.assertEqual(rules(added("a.py", [db])), [])
        self.assertEqual(rules(added("a.py", [pg("localhost/app")])), [])
        self.assertEqual(rules(added("a.py", [pg("[::1]/app")])), [])

    def test_version_context_spares_quads_keywords_do_not(self) -> None:
        quad = ipv4(1, 2, 3, 4)
        public = dec_public()
        self.assertEqual(rules(added("a.py", [quad])), ["net-public-ip"])
        spared = [
            "version=" + quad,
            "version = '" + quad + "'",
            "v" + quad,
            "==" + quad,
            "== " + quad,
            "__version__ = '" + quad + "'",
        ]
        for line in spared:
            with self.subTest(line=line[:16]):
                self.assertEqual(rules(added("a.py", [line])), [])
        self.assertEqual(rules(added("a.py", ["av" + quad])), ["net-public-ip"])
        self.assertEqual(rules(added("a.py", ["ip=" + quad])), ["net-public-ip"])
        for prefix in ("url=", "endpoint=", "target=", "server=", "dst_ip=", "dst_ip "):
            with self.subTest(prefix=prefix):
                self.assertEqual(rules(added("a.sh", [prefix + public])), ["net-public-ip"])
                self.assertEqual(rules(added("a.sh", [prefix + quad])), ["net-public-ip"])
        self.assertEqual(
            rules(added("a.py", ["socket.connect((" + public + ", 1))"])),
            ["net-public-ip"],
        )
        self.assertEqual(
            rules(added("a.py", ["socket.connect((" + quad + ", 1))"])),
            ["net-public-ip"],
        )
        self.assertEqual(rules(added("a.sh", ["nc " + public])), ["net-public-ip"])
        self.assertEqual(rules(added("a.sh", ["nc " + quad])), ["net-public-ip"])
        for prefix in ("peer=", "peer ", "remote=", "remote ", "upstream_host=", "host_ip="):
            with self.subTest(prefix=prefix):
                self.assertEqual(rules(added("a.sh", [prefix + public])), ["net-public-ip"])
        self.assertEqual(rules(added("a.py", ["peer=" + quad])), ["net-public-ip"])
        self.assertEqual(rules(added("a.py", ["s.connect((" + public + ", 1))"])), ["net-public-ip"])
        self.assertEqual(
            rules(added("a.py", ["sock.connect((" + quad + ", 1))"])),
            ["net-public-ip"],
        )
        self.assertEqual(rules(added("a.sh", ["peerage=" + public])), [])
        self.assertEqual(rules(added("a.sh", ["remotecontrol " + public])), [])

    def test_camel_case_secret_names(self) -> None:
        value = high_entropy()
        for name in ("accessToken", "apiKey", "clientSecret", "dbPassword"):
            with self.subTest(name=name):
                self.assertEqual(
                    rules(added("a.py", [name + " = '" + value + "'"])),
                    ["cred-generic-secret"],
                )
        self.assertEqual(rules(added("a.py", ["tokenizer = '" + value + "'"])), [])
        self.assertEqual(rules(added("a.py", ["token = '" + value + "'"])), ["cred-generic-secret"])

    def test_reason_redacts_short_echo_of_match(self) -> None:
        host = "evil.example.com"
        url = http_url(host + "/a")
        echo = host.split(".")[0]
        self.assertLess(len(echo), 12)
        line = url + "  # code-gate: allow net-public-url saw " + echo
        found = scan(added("a.py", [line]))
        self.assertTrue(found and found[0].suppressed)
        self.assertNotIn(echo, found[0].note)
        self.assertIn("saw", found[0].note)
        self.assertIn("***", found[0].note)
        tiny = echo[:2]
        tiny_line = url + "  # code-gate: allow net-public-url saw " + tiny
        tiny_note = scan(added("a.py", [tiny_line]))[0].note
        self.assertIn(tiny, tiny_note)

    def test_rfc2606_reserved_names_are_non_public(self) -> None:
        allowed = [
            "example",
            "EXAMPLE.",
            "test",
            "invalid",
            "localhost",
            "foo.example",
            "a.b.test",
            "x.invalid",
            "db.localhost",
            "Foo.Example.",
        ]
        for host in allowed:
            with self.subTest(host=host):
                self.assertEqual(rules(added("a.py", [http_url(host + "/a")])), [])
                self.assertIsNone(gate._classify_url(http_url(host + "/a"), ALLOW))
        flagged = [
            "evilhost",
            "exfil",
            "testing",
            "myexample",
            "example-evil",
            "examplex",
            "xn--example",
            "example.evil",
            "example.com",
            "evil.example.attacker.com",
            "example.evil.com",
        ]
        for host in flagged:
            with self.subTest(host=host):
                self.assertEqual(rules(added("a.py", [http_url(host + "/a")])), ["net-public-url"])
                self.assertEqual(gate._classify_url(http_url(host + "/a"), ALLOW), "net-public-url")
        for host in ("example/db", "test/db", "invalid/db"):
            with self.subTest(host=host):
                self.assertEqual(rules(added("a.py", [pg(host)])), ["db-nonlocal-host"])

    def test_template_localhost_is_not_loopback(self) -> None:
        # The reserved-name check runs after the DNS-name check, so a template
        # glued onto `.localhost` is unknown and flagged.
        hosts = [
            "${HOST}.localhost/",
            "a${x}.localhost",
            "evil.com{x}.localhost",
        ]
        for host in hosts:
            url = https_url(host)
            with self.subTest(host=host):
                self.assertEqual(rules(added("a.py", [url])), ["net-public-url"])
                self.assertEqual(gate._classify_url(url, ALLOW), "net-public-url")

    def test_url_password_flagged_on_any_host(self) -> None:
        secret = join("s3", "cret")
        flagged = [
            https_url("user:" + secret + "@github.com/a"),
            https_url("user:" + secret + "@evil.example/a"),
            https_url(":" + secret + "@127.0.0.1/"),
            http_url("user:" + secret + "@example/a"),
        ]
        for line in flagged:
            with self.subTest(kind="flag"):
                found = blocking(added("a.py", [line]))
                self.assertIn("cred-url-password", [item.rule_id for item in found])
                summary = gate.format_summary(found)
                self.assertNotIn(secret, summary)
                self.assertTrue(all(item.masked == "***" for item in found if item.rule_id == "cred-url-password"))
        clean = [
            https_url("user:@github.com/a"),
            https_url("user@github.com/a"),
            https_url("user:${VAR}@github.com/a"),
            https_url("user:$NAME@github.com/a"),
            https_url("user:%24%7BVAR%7D@github.com/a"),
        ]
        for line in clean:
            with self.subTest(kind="clean"):
                self.assertNotIn("cred-url-password", rules(added("a.py", [line])))
                self.assertNotIn(secret, gate.format_summary(scan(added("a.py", [line]))))
        evil_template = https_url("user:${VAR}@attacker.com/a")
        self.assertEqual(rules(added("a.py", [evil_template])), ["net-public-url"])

    def test_reason_redacts_short_secret_that_is_not_the_match(self) -> None:
        secret = join("s3", "cret")
        url = http_url("evil.example.com/a")
        self.assertNotIn(secret, url)
        line = url + "  # code-gate: allow net-public-url note " + secret
        note = scan(added("a.py", [line]))[0].note
        self.assertNotIn(secret, note)
        self.assertIn("***", note)
        self.assertIn("note", note)
        self.assertNotIn(secret, gate.format_summary(scan(added("a.py", [line]))))

    def test_checkout_note_badge_hosts(self) -> None:
        allow = gate.load_allowlist(HERE / "allowed-hosts.txt")
        for host in (
            "img.shields.io",
            "python.org",
            "zenodo.org",
            "doi.org",
            "www.brain-cog.network",
        ):
            with self.subTest(host=host):
                self.assertEqual(
                    rules(added("notes.txt", [https_url(host + "/a")]), allow=allow),
                    [],
                )
        # Inline stand-in for checkout-note lines. The real INDEX.txt is not
        # part of this change, so the test does not read it.
        notes = [
            "home " + http_url("www.brain-cog.network/"),
            "py " + https_url("img.shields.io/badge/x") + " " + https_url("python.org"),
            "doi " + https_url("zenodo.org/badge/1.svg") + " " + https_url("doi.org/10.1/2"),
        ]
        for line in notes:
            with self.subTest(line=line[:12]):
                self.assertEqual(rules(added("notes.txt", [line]), allow=allow), [])

    def test_gitai_generic_secret_forms(self) -> None:
        value = high_entropy()
        sym = sym_secret()
        self.assertGreaterEqual(gate._shannon(sym), gate.ENTROPY_THRESHOLD)
        lines = [
            '"api_token": "' + value + '"',
            "{'password': '" + value + "'}",
            'password: str = "' + value + '"',
            "password = '" + sym + "'",
            '"db_password": "' + sym + '"',
        ]
        for line in lines:
            with self.subTest(prefix=line[:10]):
                found = blocking(added("a.py", [line]))
                self.assertEqual([item.rule_id for item in found], ["cred-generic-secret"])
                self.assertEqual(found[0].masked[-3:], "***")
                self.assertLessEqual(len(found[0].masked), 5)
                self.assertNotIn(value[2:], gate.format_summary(found))
        bearer = join("Author", "ization: ", "Bea", "rer ") + value
        found = blocking(added("a.py", [bearer]))
        self.assertEqual([item.rule_id for item in found], ["cred-bearer-token"])
        self.assertEqual(found[0].masked, value[:2] + "***")
        quoted = '"' + join("Author", "ization") + '": "' + join("Bea", "rer ") + value + '"'
        self.assertEqual(rules(added("a.py", [quoted])), ["cred-bearer-token"])
        self.assertEqual(rules(added("a.py", [join("Author", "ization: ", "Bea", "rer ") + "${" + "TOKEN}"])), [])
        self.assertEqual(rules(added("a.py", ['password = "' + "${" + "PASSWORD}" + '"'])), [])
        self.assertEqual(rules(added("a.py", ['password: str = "' + join("change", "me-please-now-ok") + '"'])), [])

    def test_gitai_new_prefixes_and_extensions(self) -> None:
        pairs = [
            (openai_svc(join("svc", "acct")), "cred-openai"),
            (openai_svc(join("ad", "min")), "cred-openai"),
            (npm_token(), "cred-npm"),
            (gitlab_pat(), "cred-gitlab"),
            (hf_token(), "cred-huggingface"),
        ]
        for value, rule in pairs:
            with self.subTest(rule=rule, prefix=value[:4]):
                self.assertEqual(rules(added("a.md", [value])), [rule])
        hook = rules(added("a.md", [slack_hook()]))
        self.assertEqual(hook, ["cred-slack-webhook"])
        url = https_url("example.com/a")
        for name in ("a.html", "a.vue", "a.c", "a.cs", "a.kt", "a.swift", "a.ps1", "a.txt"):
            with self.subTest(name=name):
                self.assertEqual(rules(added(name, [url])), ["net-public-url"])
        self.assertEqual(rules(added("a.md", [url])), [])

    def test_gitai_masks_reason_and_paths(self) -> None:
        aws = blocking(added("a.py", [aws_secret_line()]))
        self.assertEqual(len(aws[0].masked), 5)
        env = blocking(added("a.env", [assign(join("DATA", "BASE_URL"), pg("evil.example/db"))]))
        self.assertTrue(env and all(len(item.masked) <= 7 for item in env))
        self.assertIn(env[0].masked[:2] + "***", [item.masked for item in env])
        token = gh_token("p")
        odd = join("zz9", "Q8w", "E7r", "T6y", "U5i")
        line = token + "  # code-gate: allow cred-github-token fixture " + odd
        note = scan(added("a.py", [line]))[0].note
        self.assertNotIn(odd, note)
        self.assertIn("***", note)
        self.assertIn("fixture", note)
        path_rules = rules(added("keys/" + gh_token("o") + ".txt", ["x"]))
        self.assertEqual(path_rules, ["cred-github-token"])
        found = scan(added("keys/" + gh_token("o") + ".txt", ["x"]))
        self.assertEqual(found[0].line, 0)
        self.assertNotIn(gh_token("o"), gate.format_summary(found))
        self.assertEqual(rules(added("net/" + ipv4(8, 8, 8, 8) + "/a.md", ["x"])), ["net-public-ip"])

    def test_fn_harness_catches_every_synthetic_case(self) -> None:
        import fn_harness

        caught, total, missed = fn_harness.run()
        self.assertEqual(total, 240)
        self.assertEqual(missed, [])
        self.assertEqual(caught, total)

    def test_checkout_sha_is_not_a_decimal_ip(self) -> None:
        example = (HERE / "tessera-mesh-sync.yml.example").read_text(encoding="utf-8")
        match = re.search(r"@[0-9a-f]{40}", example)
        self.assertIsNotNone(match)
        sha = match.group(0)[1:]
        self.assertEqual(rules(added("a.py", ["checksum = " + sha])), [])

    def test_local_database_schemes(self) -> None:
        schemes = [
            db_scheme("post", "gres"),
            db_scheme("post", "gresql"),
            db_scheme("my", "sql"),
            db_scheme("maria", "db"),
            db_scheme("mongo", "db"),
            db_scheme("re", "dis"),
            db_scheme("re", "diss"),
            db_scheme("sql", "server"),
            db_scheme("am", "qp"),
        ]
        hosts = ["127.0.0.1/app", "localhost/app", "[::1]/app", "LocalHost/app"]
        for scheme in schemes:
            for host in hosts:
                line = db_url(scheme, host)
                with self.subTest(line=line[:24]):
                    self.assertIsNone(gate.inspect_db_url(line))
                    self.assertEqual(rules(added("a.py", [line])), [])
        self.assertEqual(
            rules(added("a.py", ["jdbc:" + pg("127.0.0.1:5432/app")])),
            [],
        )
        self.assertEqual(
            rules(added("a.py", [pg("user:pass@127.0.0.1/app")])),
            [],
        )
        self.assertEqual(rules(added("a.py", [pg("127.0.0.1/db.")])), [])
        self.assertEqual(
            rules(
                added(
                    "cfg.env",
                    ["export " + assign(join("DATA", "BASE_URL"), pg("127.0.0.1/app"))],
                )
            ),
            [],
        )
        self.assertEqual(
            rules(
                added(
                    "cfg.json",
                    ['"' + join("DATA", "BASE_URL") + '": "' + pg("127.0.0.1/app") + '"'],
                )
            ),
            [],
        )

    def test_database_bypass_attempts(self) -> None:
        srv = db_scheme("mongo", "db+", "srv")
        failures = [
            (db_url(srv, "localhost/db"), "db-mongodb-srv"),
            (db_url(srv, "%2e/db"), "db-mongodb-srv"),
            (pg("localhost@evil/db"), "db-nonlocal-host"),
            (pg("user@localhost@evil/db"), "db-unparseable"),
            (pg("localhost.evil.com/db"), "db-nonlocal-host"),
            (pg(ipv4(127, 0, 0, 1) + ".nip.io/db"), "db-nonlocal-host"),
            (pg(dec_loop() + "/db"), "db-nonlocal-host"),
            (pg(hex_loop() + "/db"), "db-nonlocal-host"),
            (pg("l" + chr(0x043E) + "calhost/db"), "db-unparseable"),
            (pg("/db"), "db-unparseable"),
            (pg(""), "db-unparseable"),
            (pg("localhost:0/db"), "db-unparseable"),
            (pg("localhost:65536/db"), "db-unparseable"),
            (pg("localhost:05432/db"), "db-unparseable"),
            (pg("localhost:/db"), "db-unparseable"),
            (pg("%6cocalhost/db"), "db-unparseable"),
            (pg("localhost\\db"), "db-unparseable"),
            (pg("127.0.0.1/db?host=evil"), "db-unparseable"),
            (pg("127.0.0.1/db?hostaddr=evil"), "db-unparseable"),
            (pg("127.0.0.1/db?hostname=evil"), "db-unparseable"),
            (pg(":".join(["0", "0", "0", "0", "0", "0", "0", "1"]) + "/db"), "db-unparseable"),
            (pg("::1/db"), "db-unparseable"),
            (pg("127.0.0.2/db"), "db-nonlocal-host"),
            (pg("localhost."), "db-nonlocal-host"),
            (pg("localhost./db"), "db-nonlocal-host"),
            (pg("127.0.0.1:5432."), "db-unparseable"),
            (assign(join("DATA", "BASE_URL"), '""'), "db-unparseable"),
            (assign(join("DATA", "BASE_URL"), https_url("example.com/db")), "db-unparseable"),
            (assign(join("DATA", "BASE_URL"), '" ' + pg("127.0.0.1/db") + '"'), "db-unparseable"),
            (assign(join("APP_", "DATA", "BASE_URL"), pg("evil.example/db")), "db-nonlocal-host"),
        ]
        for line, rule in failures:
            with self.subTest(rule=rule, prefix=line[:16]):
                self.assertEqual(rules(added("a.py", [line])), [rule])
                summary = gate.format_summary(scan(added("a.py", [line])))
                self.assertNotIn(line, summary)
        self.assertEqual(
            rules(added("a.py", [assign(join("DATA", "BASE_URL"), "$" + "OTHER")])),
            [],
        )
        self.assertEqual(
            rules(added("a.py", [assign(join("DATA", "BASE_URL"), "${" + "OTHER}")])),
            [],
        )
        self.assertEqual(rules(added("notes.md", ["see DATABASE_URL later"])), [])

    def test_suppression(self) -> None:
        token = gh_token("p")
        same = token + "  # code-gate: allow cred-github-token unit fixture"
        found = scan(added("a.py", [same]))
        self.assertTrue(found and found[0].suppressed)
        self.assertEqual(found[0].note, "unit fixture")
        summary = gate.format_summary(found)
        self.assertIn("Suppressed:", summary)
        self.assertNotIn(token, summary)
        self.assertIn("No blocking findings.", summary)

        previous = added("a.py", ["# code-gate: allow cred-jwt unit fixture", jwt()])
        found = scan(previous)
        self.assertTrue(found[0].suppressed)

        wrong = token + "  # code-gate: allow cred-aws-access-key unit fixture"
        self.assertEqual(rules(added("a.py", [wrong])), ["cred-github-token"])
        bare = token + "  # code-gate: allow cred-github-token"
        self.assertEqual(rules(added("a.py", [bare])), ["cred-github-token"])

        db_line = pg("evil.example/db") + "  # code-gate: allow db-nonlocal-host unit fixture"
        db_hits = scan(added("a.py", [db_line]))
        self.assertEqual(db_hits[0].rule_id, "db-nonlocal-host")
        self.assertFalse(db_hits[0].suppressed)
        self.assertIn("suppression ignored", db_hits[0].note)

        url = https_url("example.com/a")
        mixed = token + " " + url + "  # code-gate: allow cred-github-token unit fixture"
        mixed_rules = rules(added("a.py", [mixed]))
        self.assertEqual(mixed_rules, ["net-public-url"])

        leaked = token + "  # code-gate: allow cred-github-token " + https_url("example.com/a")
        note = scan(added("a.py", [leaked]))[0].note
        self.assertEqual(note, "(redacted reason)")
        self.assertNotIn("example.com", gate.format_summary(scan(added("a.py", [leaked]))))

    def test_suppression_from_worktree_previous_line(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            path = root / "a.py"
            path.write_text("# code-gate: allow cred-jwt unit fixture\n" + jwt() + "\n", encoding="utf-8")
            diff = "\n".join(
                [
                    "diff --git a/a.py b/a.py",
                    "--- a/a.py",
                    "+++ b/a.py",
                    "@@ -1,0 +2,1 @@",
                    "+" + jwt(),
                ]
            ) + "\n"
            found = scan(diff, root=root)
            self.assertEqual(len(found), 1)
            self.assertTrue(found[0].suppressed)

    def test_size_binary_and_archive(self) -> None:
        token = gh_token("p")
        large = scan(added("blob.py", [token]), max_bytes=1)
        self.assertEqual(large[0].rule_id, "file-too-large")
        self.assertIn("too large to scan", large[0].note)
        self.assertNotIn(token, gate.format_summary(large))

        ignored = scan(
            added("blob.py", ["# code-gate: allow file-too-large unit fixture"]),
            max_bytes=1,
        )
        self.assertFalse(ignored[0].suppressed)
        self.assertIn("suppression ignored", ignored[0].note)

        archived = scan(added("archive/blob.py", [token]), max_bytes=1)
        self.assertEqual([item.rule_id for item in archived], ["cred-github-token"])
        self.assertEqual(
            rules(added("foo/archive/blob.py", [token]), max_bytes=1),
            ["file-too-large"],
        )
        self.assertEqual(
            [item.rule_id for item in scan(added("Archive/blob.py", [token]), max_bytes=1)],
            ["file-too-large"],
        )

        binary = "\n".join(
            [
                "diff --git a/a.bin b/a.bin",
                "new file mode 100644",
                "Binary files a/a.bin and b/a.bin differ",
            ]
        ) + "\n"
        self.assertEqual(scan(binary), [])

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "a.py").write_bytes(b"a\x00b")
            found = scan(added("a.py", [token]), root=root)
            self.assertEqual(found, [])
            with patch.object(gate, "MAX_FILE_BYTES", 4):
                (root / "big.bin").write_bytes(b"\x00" * 8)
                found = scan(added("big.bin", ["hello"]), root=root)
                self.assertEqual(found[0].rule_id, "file-too-large")
                (root / "archive").mkdir()
                (root / "archive" / "big.bin").write_bytes(b"\x00" * 8)
                self.assertEqual(scan(added("archive/big.bin", ["hello"]), root=root), [])

    def test_deleted_and_context_lines_are_ignored(self) -> None:
        token = gh_token("p")
        diff = "\n".join(
            [
                "diff --git a/a.py b/a.py",
                "--- a/a.py",
                "+++ b/a.py",
                "@@ -1,2 +1,1 @@",
                "-" + token,
                " kept",
            ]
        ) + "\n"
        self.assertEqual(scan(diff), [])

    def test_plus_line_inside_hunk_is_content(self) -> None:
        token = gh_token("p")
        diff = added("a.py", ["+" + token])
        self.assertEqual(rules(diff), ["cred-github-token"])

    def test_fail_closed_paths(self) -> None:
        token = gh_token("p")
        with self.assertRaises(gate.Unparseable) as ctx:
            scan("this is not a diff\n" + token)
        self.assertEqual(ctx.exception.kind, "diff")
        with self.assertRaises(gate.Unparseable):
            scan(added("a.py", ["ok"]) + "\0" + token)
        with self.assertRaises(gate.Unparseable):
            scan(
                "\n".join(
                    [
                        "diff --git a/../x.py b/../x.py",
                        "+++ b/../x.py",
                        "@@ -0,0 +1,1 @@",
                        "+" + token,
                    ]
                )
            )
        with self.assertRaises(gate.Unparseable):
            scan(
                "\n".join(
                    [
                        "diff --git a/a.py b/a.py",
                        "+++ /etc/passwd",
                        "@@ -0,0 +1,1 @@",
                        "+ok",
                    ]
                )
            )
        with self.assertRaises(gate.Unparseable):
            scan(
                "\n".join(
                    [
                        "diff --git a/a.py b/a.py",
                        "+++ b/a.py",
                        "@@ bad",
                        "+" + token,
                    ]
                )
            )
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "repo"
            root.mkdir()
            (root / "a.py").write_bytes(b"\xff\xfe")
            with self.assertRaises(gate.Unparseable) as ctx:
                scan(added("a.py", ["# comment"]), root=root)
            self.assertEqual(ctx.exception.kind, "file")
            outside = Path(tmp) / "outside.py"
            outside.write_text("hello\n", encoding="utf-8")
            link = root / "link.py"
            link.symlink_to(outside)
            with self.assertRaises(gate.Unparseable):
                scan(added("link.py", ["# comment"]), root=root)

    def test_allowlist_loader(self) -> None:
        hosts = gate.load_allowlist(HERE / "allowed-hosts.txt")
        for host in (
            "github.com",
            "api.github.com",
            "docs.github.com",
            "doc.libsodium.org",
            "owasp.org",
            "cheatsheetseries.owasp.org",
            "www.w3.org",
            "age-encryption.org",
            "csrc.nist.gov",
            "pages.nist.gov",
            "learn.microsoft.com",
            "passkeys.dev",
            "fidoalliance.org",
        ):
            self.assertIn(host, hosts)
        self.assertTrue(gate._host_allowed("api.github.com", {"github.com"}))
        self.assertFalse(gate._host_allowed("github.com.evil.com", {"github.com"}))
        self.assertFalse(gate._host_allowed("notgithub.com", {"github.com"}))
        with tempfile.TemporaryDirectory() as tmp:
            empty = Path(tmp) / "empty.txt"
            empty.write_text("# none\n\n", encoding="utf-8")
            self.assertEqual(gate.load_allowlist(empty), set())
            self.assertEqual(
                rules(added("a.py", [https_url("github.com/x")]), allow=set()),
                ["net-public-url"],
            )
            bad = Path(tmp) / "bad.txt"
            bad.write_text("github.com/extra\n", encoding="utf-8")
            with self.assertRaises(gate.Unparseable):
                gate.load_allowlist(bad)
            missing = Path(tmp) / "missing.txt"
            with self.assertRaises(gate.Unparseable):
                gate.load_allowlist(missing)

    def test_resolve_event(self) -> None:
        base = "a" * 40
        head = "b" * 40
        before = "c" * 40
        after = "d" * 40
        merged = "e" * 40

        def exists(rev: str) -> bool:
            return rev in {base, head, before, after, merged}

        spec = gate.resolve_event(
            "pull_request",
            base=base,
            head=head,
            before=None,
            after=None,
            main_ref="origin/main",
            rev_exists=exists,
            merge_base=lambda _after, _ref: None,
        )
        self.assertEqual(spec, f"{base}...{head}")
        spec = gate.resolve_event(
            "push",
            base=None,
            head=None,
            before=before,
            after=after,
            main_ref="origin/main",
            rev_exists=exists,
            merge_base=lambda _after, _ref: None,
        )
        self.assertEqual(spec, f"{before}..{after}")
        spec = gate.resolve_event(
            "push",
            base=None,
            head=None,
            before=ZERO,
            after=after,
            main_ref="origin/main",
            rev_exists=exists,
            merge_base=lambda _after, _ref: merged,
        )
        self.assertEqual(spec, f"{merged}...{after}")
        spec = gate.resolve_event(
            "push",
            base=None,
            head=None,
            before=ZERO,
            after=ZERO,
            main_ref="origin/main",
            rev_exists=exists,
            merge_base=lambda _after, _ref: None,
        )
        self.assertEqual(spec, "SKIP")
        with self.assertRaises(gate.MissingBase):
            gate.resolve_event(
                "push",
                base=None,
                head=None,
                before="nope",
                after=after,
                main_ref="origin/main",
                rev_exists=exists,
                merge_base=lambda _after, _ref: None,
            )
        with self.assertRaises(gate.MissingBase):
            gate.resolve_event(
                "other",
                base=base,
                head=head,
                before=before,
                after=after,
                main_ref="origin/main",
                rev_exists=exists,
                merge_base=lambda _after, _ref: None,
            )

    def test_main_exit_codes_and_summary(self) -> None:
        token = gh_token("p")
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            clean = root / "clean.diff"
            clean.write_text(added("a.py", ["print(1)"]), encoding="utf-8")
            summary = root / "summary.txt"
            stdout = io.StringIO()
            with patch("sys.stdout", stdout):
                rc = gate.main(["--diff-file", str(clean), "--summary", str(summary)])
            self.assertEqual(rc, 0)
            self.assertIn("No findings.", summary.read_text(encoding="utf-8"))

            bad = root / "bad.diff"
            bad.write_text(added("a.py", [token]), encoding="utf-8")
            summary.write_text("", encoding="utf-8")
            stdout = io.StringIO()
            with patch("sys.stdout", stdout):
                rc = gate.main(["--diff-file", str(bad), "--summary", str(summary), "--allowlist", str(HERE / "allowed-hosts.txt")])
            text = summary.read_text(encoding="utf-8")
            self.assertEqual(rc, 1)
            self.assertIn("cred-github-token", text)
            self.assertIn(token[:4] + "***", text)
            self.assertNotIn(token, text)
            self.assertNotIn(token, stdout.getvalue())

            stdout = io.StringIO()
            with patch("sys.stdout", stdout):
                rc = gate.main(["--summary", str(summary)])
            self.assertEqual(rc, 2)
            self.assertIn("failed closed (internal error)", stdout.getvalue())

            secret = "boom-" + high_entropy()
            stdout = io.StringIO()
            with patch("gate.scan_diff", side_effect=RuntimeError(secret)), patch("sys.stdout", stdout):
                rc = gate.main(["--diff-file", str(clean), "--summary", str(summary)])
            text = summary.read_text(encoding="utf-8")
            self.assertEqual(rc, 2)
            self.assertIn("failed closed (internal error)", text)
            self.assertNotIn(secret, text)
            self.assertNotIn(secret, stdout.getvalue())
            self.assertNotIn("Traceback", text)

            stdout = io.StringIO()
            with patch("sys.stdout", stdout):
                rc = gate.main(
                    [
                        "--diff-file",
                        str(bad),
                        "--allowlist",
                        str(root / "missing-allow.txt"),
                        "--summary",
                        str(summary),
                    ]
                )
            self.assertEqual(rc, 2)
            self.assertIn("failed closed (unparseable file)", summary.read_text(encoding="utf-8"))
            self.assertNotIn(token, stdout.getvalue())

    def test_git_integration(self) -> None:
        token = high_entropy()
        env = os.environ.copy()
        env.update(
            {
                "GIT_AUTHOR_NAME": "Code Gate",
                "GIT_AUTHOR_EMAIL": "code-gate@example.invalid",
                "GIT_COMMITTER_NAME": "Code Gate",
                "GIT_COMMITTER_EMAIL": "code-gate@example.invalid",
            }
        )

        def git(*args: str, cwd: Path) -> str:
            proc = subprocess.run(
                ["git", "-c", "user.name=Code Gate", "-c", "user.email=code-gate@example.invalid", *args],
                cwd=cwd,
                env=env,
                check=True,
                capture_output=True,
                text=True,
            )
            return proc.stdout.strip()

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            git("init", "-b", "main", cwd=root)
            (root / "ok.py").write_text("print(1)\n", encoding="utf-8")
            allow = root / "allowed.txt"
            allow.write_text("github.com\n", encoding="utf-8")
            git("add", "ok.py", cwd=root)
            git("commit", "-m", "base", cwd=root)
            base = git("rev-parse", "HEAD", cwd=root)
            (root / "ok.py").write_text("print(2)\n", encoding="utf-8")
            git("add", "ok.py", cwd=root)
            git("commit", "-m", "clean", cwd=root)
            head = git("rev-parse", "HEAD", cwd=root)
            summary = root / "summary.txt"
            stdout = io.StringIO()
            with patch("sys.stdout", stdout):
                rc = gate.main(
                    [
                        "--range",
                        f"{base}..{head}",
                        "--root",
                        str(root),
                        "--allowlist",
                        str(allow),
                        "--summary",
                        str(summary),
                    ]
                )
            self.assertEqual(rc, 0)

            git("checkout", "-b", "feature", cwd=root)
            (root / "bad.py").write_text("token = " + token + "\n", encoding="utf-8")
            git("add", "bad.py", cwd=root)
            git("commit", "-m", "bad", cwd=root)
            after = git("rev-parse", "HEAD", cwd=root)
            stdout = io.StringIO()
            with patch("sys.stdout", stdout):
                rc = gate.main(
                    [
                        "--resolve",
                        "--event",
                        "push",
                        "--before",
                        ZERO,
                        "--after",
                        after,
                        "--main-ref",
                        "main",
                        "--root",
                        str(root),
                    ]
                )
            self.assertEqual(rc, 0)
            spec = stdout.getvalue().strip()
            self.assertEqual(spec, f"{head}...{after}")
            summary.write_text("", encoding="utf-8")
            stdout = io.StringIO()
            with patch("sys.stdout", stdout):
                rc = gate.main(
                    [
                        "--range",
                        spec,
                        "--root",
                        str(root),
                        "--allowlist",
                        str(allow),
                        "--summary",
                        str(summary),
                    ]
                )
            text = summary.read_text(encoding="utf-8")
            self.assertEqual(rc, 1)
            self.assertIn("cred-generic-secret", text)
            self.assertNotIn(token, text)
            self.assertNotIn(token, stdout.getvalue())

            missing = "ab" * 20 + ".." + "cd" * 20
            stdout = io.StringIO()
            stderr = io.StringIO()
            with patch("sys.stdout", stdout), patch("sys.stderr", stderr):
                rc = gate.main(["--range", missing, "--root", str(root), "--summary", str(summary)])
            self.assertEqual(rc, 2)
            self.assertIn("failed closed (missing diff base)", summary.read_text(encoding="utf-8"))
            self.assertEqual(stdout.getvalue(), "failed closed (missing diff base)\n")
            self.assertEqual(stderr.getvalue(), "failed closed (missing diff base)\n")

            stdout = io.StringIO()
            with patch("sys.stdout", stdout):
                rc = gate.main(
                    [
                        "--resolve",
                        "--event",
                        "push",
                        "--before",
                        ZERO,
                        "--after",
                        ZERO,
                        "--root",
                        str(root),
                    ]
                )
            self.assertEqual(rc, 0)
            self.assertEqual(stdout.getvalue().strip(), "SKIP")

    def test_workflow_example_contract(self) -> None:
        path = HERE / "tessera-mesh-sync.yml.example"
        text = path.read_text(encoding="utf-8")
        self.assertIn("name: tessera-mesh-sync\n", text)
        self.assertIn("name: code-gate\n", text)
        self.assertIn("permissions:\n  contents: read\n", text)
        self.assertNotIn("contents: write", text)
        self.assertNotIn("pull_request_target", text)
        self.assertNotIn("continue-on-error", text)
        self.assertIn("cancel-in-progress: true", text)
        self.assertIn("timeout-minutes: 10", text)
        self.assertEqual(text.count("set -euo pipefail"), 2)
        self.assertIn("\n  gate:\n    name: code-gate\n", text)
        self.assertIn("needs: gate\n", text)
        self.assertLess(text.index("--range"), text.index("unittest"))
        self.assertIn("git ls-tree", text)
        self.assertNotIn("cp scripts/code-gate", text)
        self.assertNotIn("--root", text)
        for kind in ("opened", "synchronize", "reopened", "ready_for_review", "edited"):
            self.assertIn(kind, text)
        self.assertIn("refuse the head copy when origin/main has gate.py", text)
        self.assertIn("refs/remotes/origin/main", text)
        self.assertNotIn('have_commit "origin/main"', text)
        self.assertNotIn('GATE_REF="origin/main"', text)
        self.assertNotIn('gate_tree "origin/main"', text)
        self.assertNotIn("--main-ref origin/main", text)
        self.assertIn("--main-ref refs/remotes/origin/main", text)
        self.assertIn("Using gate from origin/main.", text)
        self.assertIn("Bootstrap: base and main have no gate; running the head copy.", text)
        self.assertLess(
            text.index("Using gate from origin/main."),
            text.index("running the head copy"),
        )
        self.assertNotIn('"**"', text)
        self.assertIn("  push:\n    branches:\n      - main\n", text)
        self.assertIn('GATE="$GATE_DIR/gate.py"', text)
        self.assertIn('python3 -I "$GATE" --resolve', text)
        self.assertEqual(text.count('python3 -I "$GATE"'), 2)
        self.assertNotIn("python3 scripts/code-gate/gate.py", text)
        self.assertNotIn('python3 "$GATE"', text)
        uses = re.findall(r"uses:\s*(\S+)", text)
        self.assertTrue(uses)
        for item in uses:
            self.assertRegex(item, r"@[0-9a-f]{40}(?:\s|$)")
        self.assertNotIn(join("TESSERA_", "ENABLE"), text)
        docs = (REPO / "docs" / "CODE-GATE.md").read_text(encoding="utf-8")
        self.assertIn(
            "An admin moves it to `.github/workflows/tessera-mesh-sync.yml` once the workflow scope is granted.",
            docs,
        )
        self.assertIn("scripts/code-gate/", docs)
        self.assertIn("required status check", docs)
        self.assertIn("exits 0", docs)
        self.assertNotIn(join("TESSERA_", "ENABLE"), docs)

    def test_template_urls_are_not_public_and_bypasses_stay_flagged(self) -> None:
        # The `${...}` alternative has to run before the class that matches `$`.
        expr = "${{ secrets." + "GITHUB_TOKEN }}"
        github_expr = https_url("x-access-token:" + expr + "@github.com/org/repo")
        shell_user = https_url("user:${TOKEN}@github.com")
        bare_user = "user:${TOKEN}@github.com"
        fstring = 'f"' + https_url("{token}@github.com") + '"'
        for line in (github_expr, shell_user, bare_user, fstring):
            with self.subTest(line=line[:24]):
                self.assertNotIn("net-public-url", rules(added("a.py", [line])))
                self.assertNotIn("cred-url-password", rules(added("a.py", [line])))
        for line in (github_expr, shell_user, fstring):
            match = gate._PATS["net-url"].search(line)
            self.assertIsNotNone(match)
            assert match is not None
            self.assertIn("@github.com", match.group(0))
            self.assertEqual(gate._url_host(match.group(0)), "github.com")
        self.assertIsNone(gate._PATS["net-url"].search(bare_user))
        for host in ("${HOST}.localhost/", "exfil${''}.attacker.com"):
            with self.subTest(host=host):
                self.assertEqual(
                    rules(added("a.py", [https_url(host)])),
                    ["net-public-url"],
                )

    def test_url_password_placeholders_are_not_findings(self) -> None:
        placeholders = (
            "changeme",
            "***",
            "pass",
            "password",
            "xxx",
            "<password>",
            "<my-token>",
        )
        for password in placeholders:
            line = https_url("user:" + password + "@github.com/a")
            with self.subTest(password=password):
                self.assertEqual(rules(added("a.py", [line])), [])
        dotted = https_url("user:<...>@github.com/a")
        self.assertEqual(rules(added("a.py", [dotted])), ["cred-url-password"])
        public = https_url("user:changeme@evil.example.com/a")
        self.assertEqual(rules(added("a.py", [public])), ["net-public-url"])
        real = https_url("user:" + join("s3", "cret") + "@github.com/a")
        self.assertEqual(rules(added("a.py", [real])), ["cred-url-password"])
        longer = https_url("user:password1@github.com/a")
        self.assertIn("cred-url-password", rules(added("a.py", [longer])))

    def test_reason_keeps_version_and_well_known_words(self) -> None:
        url = http_url("evil.example.com/a")
        for word in ("v1.2", "ipv4", "rfc2606"):
            line = url + "  # code-gate: allow net-public-url note " + word
            note = scan(added("a.py", [line]))[0].note
            with self.subTest(word=word):
                self.assertIn(word, note)
                self.assertNotIn("***", note)
        secret = join("s3", "cret")
        secret_line = url + "  # code-gate: allow net-public-url note " + secret
        secret_note = scan(added("a.py", [secret_line]))[0].note
        self.assertNotIn(secret, secret_note)
        self.assertIn("***", secret_note)
        long_ver = "v20261021"
        long_line = url + "  # code-gate: allow net-public-url note " + long_ver
        long_note = scan(added("a.py", [long_line]))[0].note
        self.assertNotIn(long_ver, long_note)
        self.assertIn("***", long_note)
        self.assertNotIn(long_ver, gate.format_summary(scan(added("a.py", [long_line]))))
        dotted_ver = "v2026.1021"
        dotted_line = url + "  # code-gate: allow net-public-url note " + dotted_ver
        dotted_note = scan(added("a.py", [dotted_line]))[0].note
        self.assertNotIn(dotted_ver, dotted_note)
        self.assertIn("***", dotted_note)
        self.assertNotIn(dotted_ver, gate.format_summary(scan(added("a.py", [dotted_line]))))

    def test_mesh_scripts_quote_the_api_host_off_the_path(self) -> None:
        _guard_mesh_scripts(self)
        needle = '"' + https_url("api.github.com") + '""$1"'
        allow = gate.load_allowlist(HERE / "allowed-hosts.txt")
        for name in ("mesh-queue.sh", "mesh-watch.sh"):
            text = (REPO / "scripts" / name).read_text(encoding="utf-8")
            self.assertIn(needle, text)
            lines = [line.strip() for line in text.splitlines() if "api.github.com" in line]
            self.assertEqual(rules(added("scripts/" + name, lines), allow=allow), [])
        glued = https_url("api.github.com$1")
        self.assertEqual(rules(added("a.sh", [glued])), ["net-public-url"])

    def test_literal_inside_template_password_is_flagged(self) -> None:
        # A non-identifier literal. Identifier-like references stay clean.
        literal = join("p@", "ss")
        flagged = [
            https_url("u:${PASS:-" + literal + "}@github.com"),
            https_url("u:${{ '" + literal + "' }}@github.com"),
            https_url("u:{" + literal + "}@github.com"),
            https_url("u:${" + literal + "}@github.com"),
            https_url("u:<" + literal + ">@github.com"),
        ]
        for line in flagged:
            with self.subTest(kind="flag"):
                found = rules(added("a.py", [line]))
                self.assertIn("cred-url-password", found)
                self.assertNotIn("net-public-url", found)
                self.assertNotIn(literal, gate.format_summary(scan(added("a.py", [line]))))
                match = gate._PATS["net-url"].search(line)
                self.assertIsNotNone(match)
                assert match is not None
                self.assertIn("@github.com", match.group(0))
        clean = [
            https_url("u:${TOKEN}@github.com"),
            https_url("u:${PASS:-}@github.com"),
            https_url("u:${{ secrets.GITHUB_TOKEN }}@github.com"),
            https_url("u:${{ env.TOKEN }}@github.com"),
            https_url("u:${{ github.token }}@github.com"),
            https_url("u:{token}@github.com"),
            https_url("u:{my-token}@github.com"),
            https_url("u:<password>@github.com"),
        ]
        for line in clean:
            with self.subTest(kind="clean"):
                self.assertNotIn("cred-url-password", rules(added("a.py", [line])))
                self.assertNotIn("net-public-url", rules(added("a.py", [line])))
        quoted = https_url("u:${{ secrets.TOKEN || 'x' }}@github.com")
        self.assertIn("cred-url-password", rules(added("a.py", [quoted])))
        number = https_url("u:${{ 1 }}@github.com")
        self.assertIn("cred-url-password", rules(added("a.py", [number])))

    def test_secret_shaped_placeholder_words_are_flagged(self) -> None:
        # Mixed-case digit tokens and token-like non-snake words stay findings.
        # PASSHq7zR2pLw9 is the PASS-prefixed random form.
        caught = (
            "Hunter2_secret",
            "Hq7zR2pLw9",
            "PASSHq7zR2pLw9",
            "Hq7z-R2pL-w9xx",
        )
        flagged = (
            https_url("u:{Hunter2_secret}@github.com"),
            https_url("u:<Hq7zR2pLw9>@github.com"),
            https_url("u:${{ Hq7zR2pLw9 }}@github.com"),
            https_url("u:{PASSHq7zR2pLw9}@github.com"),
            https_url("u:<Hq7z-R2pL-w9xx>@github.com"),
        )
        for line in flagged:
            with self.subTest(kind="flag"):
                self.assertIn("cred-url-password", rules(added("a.py", [line])))
                summary = gate.format_summary(scan(added("a.py", [line])))
                for word in caught:
                    self.assertNotIn(word, summary)
        # Real reference names and plain snake/kebab identifiers are not findings.
        clean = (
            https_url("u:{name}@github.com"),
            https_url("u:<TOKEN>@github.com"),
            https_url("u:${API_KEY}@github.com"),
            https_url("u:${{ secrets.X }}@github.com"),
            https_url("u:${S3_PASSWORD}@github.com"),
            https_url("u:$S3_PASSWORD@github.com"),
            https_url("u:${OAUTH2_TOKEN}@github.com"),
            https_url("u:${K8S_TOKEN}@github.com"),
            https_url("u:${{ secrets.GH_PAT_V2 }}@github.com"),
            https_url("u:${{ secrets.TOKEN_2026 }}@github.com"),
            https_url("u:{api_key_v2}@github.com"),
            https_url("u:{password2}@github.com"),
            https_url("u:<base64-token>@github.com"),
        )
        for line in clean:
            with self.subTest(kind="clean"):
                self.assertEqual(rules(added("a.py", [line])), [])

    def test_mesh_tests_fail_when_this_repo_requires_them(self) -> None:
        self.assertEqual(
            _mesh_test_action(True, mesh_dir=True, require_env=False),
            "run",
        )
        self.assertEqual(
            _mesh_test_action(False, mesh_dir=True, require_env=False),
            "fail",
        )
        self.assertEqual(
            _mesh_test_action(False, mesh_dir=False, require_env=True),
            "fail",
        )
        self.assertEqual(
            _mesh_test_action(False, mesh_dir=False, require_env=False),
            "skip",
        )
        self.assertTrue((REPO / "mesh").is_dir())
        self.assertTrue(
            all((REPO / "scripts" / name).is_file() for name in _MESH_SCRIPT_NAMES)
        )

    def test_mesh_api_path_must_be_absolute(self) -> None:
        _guard_mesh_scripts(self)
        marker = "CALLED"
        for name, fn in (("mesh-queue.sh", "get"), ("mesh-watch.sh", "api")):
            text = (REPO / "scripts" / name).read_text(encoding="utf-8")
            self.assertIn('case "$1" in', text)
            self.assertIn("/*)", text)
            self.assertIn("return 1", text)
            start = text.index(fn + "(){")
            # The function ends at the first line that is only `}`.
            rest = text[start:]
            end = rest.index("\n}")
            fn_src = rest[: end + 2]
            script = "\n".join(
                [
                    "set +e",
                    "set -u",
                    "mark=$(mktemp)",
                    "CALLF=$(mktemp)",
                    "curl() { echo " + marker + " >> \"$mark\"; }",
                    "hdr=()",
                    fn_src,
                    fn + " '@evil.example'",
                    "echo RC:$?",
                    fn + " 'https://evil.example/x'",
                    "echo RC:$?",
                    "echo BAD:$(wc -l < \"$mark\" | tr -d ' ')",
                    ": > \"$mark\"",
                    fn + " '/repos/acme/widgets/pulls/1'",
                    "echo RC:$?",
                    "echo GOOD:$(wc -l < \"$mark\" | tr -d ' ')",
                ]
            )
            proc = subprocess.run(
                ["bash", "-c", script],
                check=False,
                capture_output=True,
                text=True,
            )
            self.assertEqual(proc.returncode, 0, proc.stderr + proc.stdout)
            lines = [line for line in proc.stdout.splitlines() if line]
            self.assertEqual(lines[0], "RC:1")
            self.assertEqual(lines[1], "RC:1")
            self.assertEqual(lines[2], "BAD:0")
            self.assertEqual(lines[4], "GOOD:1")

    def test_zero_before_push_uses_origin_main_gate(self) -> None:
        text = (HERE / "tessera-mesh-sync.yml.example").read_text(encoding="utf-8")
        forced = (
            'if [[ "$EVENT_NAME" == "push" && "$BEFORE_SHA" == "$ZERO" '
            '&& "$AFTER_SHA" != "$ZERO" ]]; then'
        )
        self.assertNotIn(forced, text)
        assign = 'if [[ "$GATE_REF" == "$ZERO" ]]; then\n              GATE_REF="refs/remotes/origin/main"'
        self.assertIn(assign, text)
        call = 'if ! gate_tree "$GATE_REF"; then'
        self.assertLess(text.index(assign), text.index(call))
        note = "Bootstrap: base and main have no gate; running the head copy."
        self.assertLess(text.index(call), text.index(note))
        docs = (REPO / "docs" / "CODE-GATE.md").read_text(encoding="utf-8")
        self.assertIn("An all-zeros `before` SHA is a new branch", docs)
        self.assertIn("the head copy is refused when that ref has `gate.py`", docs)
        guard_at = text.index("# main-create-guard")
        self.assertLess(guard_at, text.index(call))
        self.assertLess(text.index("# end main-create-guard"), text.index(note))
        self.assertIn('git rev-parse --verify "refs/remotes/origin/main^{commit}"', text)
        self.assertIn('"$main_sha" == "$AFTER_SHA"', text)
        self.assertIn("fails closed", docs)
        self.assertIn(note, docs)

    def test_creating_main_fails_closed_when_origin_is_the_push(self) -> None:
        text = (HERE / "tessera-mesh-sync.yml.example").read_text(encoding="utf-8")
        start = text.index("# main-create-guard\n")
        end = text.index("# end main-create-guard\n")
        guard = text[start:end]

        def run(after_is_main: bool) -> tuple[subprocess.CompletedProcess[str], str]:
            with tempfile.TemporaryDirectory() as tmp:
                repo = Path(tmp) / "repo"
                repo.mkdir()
                summary = Path(tmp) / "summary"
                env = os.environ.copy()
                env.update(
                    {
                        "GIT_AUTHOR_NAME": "gate",
                        "GIT_AUTHOR_EMAIL": "gate@example.com",
                        "GIT_COMMITTER_NAME": "gate",
                        "GIT_COMMITTER_EMAIL": "gate@example.com",
                    }
                )
                subprocess.check_call(["git", "init", "-q", "-b", "main"], cwd=repo, env=env)
                subprocess.check_call(
                    ["git", "commit", "-q", "--allow-empty", "-m", "base"],
                    cwd=repo,
                    env=env,
                )
                base = subprocess.check_output(
                    ["git", "rev-parse", "HEAD"], cwd=repo, text=True
                ).strip()
                subprocess.check_call(
                    ["git", "update-ref", "refs/remotes/origin/main", base],
                    cwd=repo,
                )
                if after_is_main:
                    after = base
                else:
                    subprocess.check_call(
                        ["git", "commit", "-q", "--allow-empty", "-m", "next"],
                        cwd=repo,
                        env=env,
                    )
                    after = subprocess.check_output(
                        ["git", "rev-parse", "HEAD"], cwd=repo, text=True
                    ).strip()
                script = "\n".join(
                    [
                        "set -euo pipefail",
                        "fail() { printf 'failed closed (%s)\\n' \"$1\" >> \"$GITHUB_STEP_SUMMARY\"; exit 2; }",
                        "ZERO=" + ZERO,
                        "EVENT_NAME=push",
                        "BEFORE_SHA=" + ZERO,
                        'GATE_REF="refs/remotes/origin/main"',
                        "AFTER_SHA=" + after,
                        "GITHUB_STEP_SUMMARY=" + str(summary),
                        guard,
                        "printf 'kept prior main\\n'",
                    ]
                )
                proc = subprocess.run(
                    ["bash", "-c", script],
                    cwd=repo,
                    check=False,
                    capture_output=True,
                    text=True,
                    env=env,
                )
                written = summary.read_text(encoding="utf-8") if summary.exists() else ""
                return proc, written

        created, created_summary = run(True)
        self.assertEqual(created.returncode, 2, created.stderr + created.stdout)
        self.assertIn(
            "failed closed (creating main: no trusted base to diff against; failing closed)",
            created_summary,
        )
        self.assertNotIn("kept prior main", created.stdout)
        self.assertNotIn(
            "Bootstrap: base and main have no gate; running the head copy.",
            created_summary,
        )
        prior, prior_summary = run(False)
        self.assertEqual(prior.returncode, 0, prior.stderr + prior.stdout)
        self.assertIn("kept prior main", prior.stdout)
        self.assertEqual(prior_summary, "")

    def test_shipped_files_have_no_findings(self) -> None:
        allow = gate.load_allowlist(HERE / "allowed-hosts.txt")
        shipped = [
            HERE / "gate.py",
            HERE / "test_gate.py",
            HERE / "allowed-hosts.txt",
            HERE / "fn_harness.py",
            HERE / "tessera-mesh-sync.yml.example",
            REPO / "docs" / "CODE-GATE.md",
        ]
        for path in shipped:
            text = path.read_text(encoding="utf-8")
            rel = path.relative_to(REPO).as_posix()
            found = [item for item in scan(added(rel, text.splitlines()), allow=allow) if not item.suppressed]
            self.assertEqual([(item.path, item.line, item.rule_id) for item in found], [])
        example = (HERE / "tessera-mesh-sync.yml.example").read_text(encoding="utf-8")
        as_yml = [item for item in scan(added(".github/workflows/tessera-mesh-sync.yml", example.splitlines()), allow=allow) if not item.suppressed]
        self.assertEqual([(item.line, item.rule_id) for item in as_yml], [])


if __name__ == "__main__":
    unittest.main()
