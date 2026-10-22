# Code gate

The code gate scans **added lines** in a diff. It fails the check when those lines contain a credential footprint, a public network address, or a database URL that is not strictly local. Exit 0 means clean (suppressed hits do not fail the check). Exit 1 means at least one blocking finding. Exit 2 means the gate failed closed: missing diff base, unparseable diff or file, bad allowlist, or an internal error. A workflow treats both 1 and 2 as failure.

The check name is `code-gate`. The workflow definition ships as an example, not as an installed workflow:

`scripts/code-gate/tessera-mesh-sync.yml.example`

An admin moves it to `.github/workflows/tessera-mesh-sync.yml` once the workflow scope is granted.

Father, this check is not real until three settings exist together: a CODEOWNERS file covering `.github/` and `scripts/code-gate/`, required code-owner review, and `code-gate` as a required status check. Without all three, a pull request can rewrite the workflow so the check exits 0. This pull request does not add a CODEOWNERS file, does not change branch protection, and does not turn those settings on.

The workflow has two jobs. The `gate` job (check name `code-gate`) runs first, from a checkout of the base commit, before any pull request code runs. The base is the pull request base SHA, or on a push to main the `before` SHA. Git commands name that remote `refs/remotes/origin/main`, so a tag named `origin/main` cannot shadow it. An all-zeros `before` SHA is a new branch: the gate is `refs/remotes/origin/main`, and the head copy is refused when that ref has `gate.py`. When that push creates `main`, `git rev-parse refs/remotes/origin/main` equals the pushed `after` SHA. The job requires those SHAs to differ and otherwise fails closed (`creating main: no trusted base to diff against; failing closed`); it does not run the pushed copy. The head-copy note still runs when a prior `main` exists and both it and the base lack `gate.py`: `Bootstrap: base and main have no gate; running the head copy.` Manual check: in a throwaway repository, point `refs/remotes/origin/main` at the commit being pushed and confirm the guard exits 2; point it at an older commit and confirm the guard continues. The job reads `scripts/code-gate/gate.py` with `git ls-tree`. When that listing is empty with exit 0, the job reads `refs/remotes/origin/main` next. If main has the file, that copy is the gate, and the head copy is refused even when the pull request's base branch lacks the file. The head blob is copied into `$RUNNER_TEMP` only when both the base and `refs/remotes/origin/main` lack the file, and the summary says `Bootstrap: base and main have no gate; running the head copy.` A nonzero `git ls-tree`, or a line that is not a regular-file blob, fails closed and does not fall back. The program that runs is `python3 -I` on the copy in `$RUNNER_TEMP`. Head content is data: `git show` of a blob and `git diff` of the range. The job does not pass a worktree root, so a size check uses added bytes from the diff. The `unit-tests` job is separate, declares `needs: gate`, and runs only after the gate job. A pull request cannot weaken the gate or widen the allowlist that scans it; such changes take effect only after they merge. The trigger is `pull_request`, never `pull_request_target`.

Triggers: `pull_request` (opened, synchronize, reopened, ready_for_review, edited) and `push` on `main` only. `edited` covers a pull request whose base branch changed. A pull request commit is not scanned twice.

## What it blocks

Rules run on added lines only. Deleted lines are ignored. Binary files are skipped. A file over 2 MB is a `file-too-large` finding (`too large to scan`) unless the path starts with `archive/`. Paths under `archive/` are still scanned for the rules below; only the size finding is skipped. `Archive/` and `foo/archive/` are not exempt.

### Credentials (class a)

- AWS access key IDs (`AKIA` or `ASIA` plus 16 uppercase letters or digits) and 40-character values assigned to `aws_secret_access_key`, `aws_secret_key`, or `secret_access_key`.
- GitHub tokens (`ghp_`, `gho_`, `ghs_`, `ghu_` plus 36 alphanumerics, and `github_pat_` plus 22 or more token characters). Rule id `cred-github-token`.
- OpenAI keys (`sk-proj-` and other `sk-` keys, excluding Anthropic). Rule id `cred-openai`.
- Anthropic keys (`sk-ant-`). Rule id `cred-anthropic`.
- Google API keys (`AIza` plus 35 token characters). Rule id `cred-google-api`.
- Stripe live keys (`sk_live_` and `rk_live_`). Test-mode prefixes are not this rule. Rule id `cred-stripe`.
- OpenAI service-account and admin keys (`sk-svcacct-`, `sk-admin-`). Rule id `cred-openai`.
- Slack tokens (`xox` then `a`, `b`, `p`, `r`, or `s`, then `-`). Rule id `cred-slack`.
- Slack incoming-webhook URLs (`hooks.slack.com/services/T…/B…/…`). Rule id `cred-slack-webhook`.
- npm tokens (`npm_` plus 36 alphanumerics). Rule id `cred-npm`.
- GitLab personal access tokens (`glpat-` plus 20 or more token characters). Rule id `cred-gitlab`.
- Hugging Face tokens (`hf_` plus 30 or more letters). Rule id `cred-huggingface`.
- Bearer tokens in an `Authorization` header or key (`Authorization: Bearer <16+ token characters>`, quoted or not, with at least one digit and no placeholder text). Rule id `cred-bearer-token`.
- Private-key PEM banners (`BEGIN` … `PRIVATE KEY`, including RSA, DSA, EC, OPENSSH, ENCRYPTED, and PGP). Rule id `cred-private-key`.
- JWTs (three base64url parts starting with `eyJ`). Rule id `cred-jwt`.
- Generic secrets: a value of at least 20 characters assigned to a name such as `key`, `secret`, `token`, `password`, `api_key`, or a name ending in `_key`, `_secret`, `_token`, `_password`, or `_passwd`, with Shannon entropy at least 4.0, both a letter and a digit, and no placeholder text. Rule id `cred-generic-secret`. A camelCase name whose last word is `key`, `secret`, `token`, `password`, or `passwd` (`accessToken`, `apiKey`) is included. A single word such as `tokenizer` is not. Covered forms: `name = value`, `name: value`, `name := value`, `name => value`, a quoted name (`"api_token": "…"`, `{'password': '…'}`), a type annotation (`password: str = "…"`), and an assignment nested inside another string. Quoted values may contain any non-space characters, including `!@#$%`. `$VAR` and `${VAR}` references are ignored.
- A password in `http`, `https`, `ws`, or `wss` userinfo (the text after the first colon and before `@`) is `cred-url-password` on any host, including an allowlisted host. An empty password is not a finding. A password that is only `$VAR` or `${IDENT}` (a plain identifier), an empty `${VAR:-}`, a GitHub expression with no quotes and no literals (`secrets.X`, `env.X`, `github.token`), or a Python f-string `{identifier}` is not a finding. The same forms percent-encoded are not findings. `${VAR:-literal}` with a non-empty default is a finding. A GitHub expression that contains quotes or a literal is a finding. `{...}` and `<...>` are placeholders only when the inside is an identifier (`[A-Za-z_][A-Za-z0-9_-]*`); anything else is a finding. The placeholder-word check is not applied to `$IDENT`, `${IDENT}`, or any `${IDENT:-...}` default form, and it is not applied to dotted GitHub paths `secrets.`, `env.`, `vars.`, `github.`, and `inputs.`. A non-empty `${VAR:-literal}` default is still a finding. A digit inside an identifier such as `TOKEN_2026` is not a numeric literal. Inside `{...}` and `<...>`, plain snake_case and kebab-case stay placeholders: lowercase or uppercase words joined by `_` or `-`, with digits allowed inside a word (`api_key_v2`, `password2`, `base64-token`). A mixed-case word that contains a digit, or a token-like word that is not snake_case or kebab-case, is a finding. Short names with no digit, including `{name}`, `<TOKEN>`, `${API_KEY}`, and `${{ secrets.X }}`, stay placeholders. Exact placeholder words are not findings: `changeme`, `pass`, `password`, `xxx`, and a string of only `*`. The match is the whole word, not a prefix. Any other password still is. The summary masks the password as `***` and does not print it. Database URL rules are unchanged.

File paths are scanned too: a credential or a public address in a path is a finding on line 0 (`in file path`), and the summary prints the path with that part masked.

### Public network paths (class b)

In code and config files only (not Markdown or logs): `http`, `https`, `ws`, and `wss` URLs, plus IPv4 and IPv6 literals, whose host is a public address. Code and config includes `.html`, `.vue`, `.c`, `.h`, `.cs`, `.kt`, `.swift`, `.ps1`, and `.txt` besides the usual source and config types. Loopback, private, link-local, multicast, reserved, and unspecified addresses are allowed. `169.254.169.254` in an ordinary URL stays allowed, by design, because it is link-local. RFC 2606 names `example`, `test`, `invalid`, and `localhost`, plus their subdomains (`foo.example`, `a.b.test`, `x.invalid`, `db.localhost`), are non-public and allowed. Matching is case-insensitive, a trailing dot is ignored, and only the right-most label counts, and only after the cleaned host is a real DNS name. `example.com` is not covered. `myexample`, `testing`, `example-evil`, `examplex`, `xn--example`, `example.evil`, and `evil.example.attacker.com` are not covered. Every other dotless host (`intranet`, `exfil`, `evilhost`) is unknown and is flagged. A host that is not a DNS name (a `$`, `{`, leftover backslash, or other non-hostname character), including a template glued onto `.localhost`, is unknown and is flagged. It is not treated as private. Database URLs still allow only the exact hosts `127.0.0.1`, `::1`, and `localhost`.

Digit guard. A bare 8–10 digit decimal or a `0x` hex form is read as IPv4 only when it is a URL host or comes right after a network keyword (`ip=`, `--ip`, `addr`, `address`, `host=`, `hostname`, `host_ip`, `upstream_host`, `remote`, `remote_addr`, `peer`, `bind_addr`, `server_ip`, `url=`, `endpoint=`, `target=`, `server=`, `dst_ip`, `name.connect((` for any socket variable, `nc`). In free text only dotted quads and IPv6 literals count. Dates (`20261021`), unix timestamps, numeric user IDs such as a GitHub noreply prefix, constants like `0xCAFEBABE`, and LCG seeds are not findings. A dotted quad needs exactly four parts, each 0–255, so OIDs (`1.3.6.1.4.1…`) and five-part versions do not match. Dotted quads with a leading zero are always `net-public-ip`, because the encoding is ambiguous. A dotted quad in a version context is not a finding: `version=`, a leading `v` that is not preceded by a letter or digit, `==`, or `__version__`. The same quad still flags after a network keyword, and a bare quad still flags.

Host parsing. A regex-escaped dot (`\.`) is read as a dot. Before the host check, userinfo is stripped at `@` and leftover backslashes become slashes, which is how curl and WHATWG read the authority. The host is not cut at `$`, `{`, or `\`. The URL match consumes `${...}` and `${{ ... }}` before `$`, and `{name}` before `{`, because those characters otherwise match an earlier class and the template alternative never runs. That keeps the host after `@`. It does not make a template inside the host a DNS name. The host is percent-decoded, so a `%2E` dot is a real dot. `github.com\@evil.com` is host `evil.com` and is flagged. `api.github.com$1` and `github.com{path}` stay whole and are flagged. `github\.com` still matches the allowlist.

Rule ids: `net-public-url`, `net-public-ip`.

Reviewed hosts live in `scripts/code-gate/allowed-hosts.txt`. A listed host also allows its subdomains (`api.github.com` via `github.com`). `github.com.evil.com` and `notgithub.com` do not match. The allowlist does not relax database rules. Badge and citation hosts (`img.shields.io`, `python.org`, `zenodo.org`, `doi.org`, `brain-cog.network`) are listed so checkout-note lines in `.txt` files are not findings.

### Database URLs (class c)

Schemes: postgres, postgresql, mysql, mariadb, mongodb, mongodb+srv, redis, rediss, sqlserver, amqp, plus a `jdbc:` prefix. Assignments whose name ends with `DATABASE_URL`, `DB_URL`, `MYSQL_URL`, `POSTGRES_URL`, `POSTGRESQL_URL`, `REDIS_URL`, `MONGODB_URL`, `MONGO_URL`, `AMQP_URL`, `SQLSERVER_URL`, or `MARIADB_URL` are included (any case).

The host must be exactly `127.0.0.1`, `::1`, or `localhost` (any case). Bracketed `[::1]` is the only IPv6 form that passes. One local example:

`postgres://127.0.0.1:5432/app`

Anything else fails, including a host that will not parse:

- `mongodb+srv` always fails (`db-mongodb-srv`), including when the host is localhost, because the scheme implies DNS.
- Missing host, empty port, a leading-zero port, or a port outside 1–65535 (`db-unparseable`).
- Percent-encoding, a backslash, non-ASCII characters, or whitespace in the authority (`db-unparseable`).
- Two `@` signs, or a query key `host`, `hostaddr`, or `hostname` (`db-unparseable`).
- A single `@` is userinfo. `localhost@evil` is user `localhost` and host `evil` (`db-nonlocal-host`).
- `localhost.evil.com`, `127.0.0.1.nip.io`, a trailing-dot host (`localhost.`), decimal or hex IPs, and lookalike Unicode characters fail. Decimal loopback is not treated as `127.0.0.1`.

`$VAR` and `${VAR}` values are ignored. An empty quoted assignment fails. A bare name with no value is not a finding.

These hits cannot be suppressed.

## How to fix a finding

The job summary lists `file:line`, the rule id, and a masked preview. It does not print the matched value. Prefix rules show the first four characters (the known prefix) plus `***`. Generic secrets, AWS secret values, bearer tokens, and database-env values show at most two characters plus `***`. A fail-closed run (exit 2) prints its one-line reason to stdout, stderr, and the summary file.

- Credential: remove the value from the diff and rotate it. Use a secret store or an environment reference, not a literal.
- Public URL or IP: point at an allowlisted host, or use loopback. A bare number is only a finding as a URL host or after an IP keyword; if it is not an address, rename the key or suppress it with a reason (see below).
- Database: use host `127.0.0.1`, `::1`, or `localhost` exactly. Do not use the mongodb+srv scheme. Do not percent-encode the authority. Do not put a second host in the query string.
- Too large: split the file, or if it is a historical blob that should not be content-scanned for size, place it under `archive/`. Added lines there are still scanned for the other rules.

## How to suppress

On the same line, or on the immediately previous line:

`# code-gate: allow <rule-id> <reason>`

A reason is required. Suppression is allowed only for credential rules and network rules. Database rules and `file-too-large` still fail; the summary says suppression was ignored. Suppressed hits are listed in the summary and do not fail the check when they are the only hits. Do not put the secret or a URL in the reason; the gate replaces that kind of reason with `(redacted reason)`. Any other reason word that looks like a token (12 or more characters with letters, digits, and high entropy, or a known key prefix) is replaced with `***`. A reason word of 4 or more characters that contains both a letter and a digit is replaced with `***` even when it is not the matched value, so a reason never prints a secret-like token. A short version word (`v` plus dotted numbers, each part at most three digits, such as `v1.2`) or a well-known word (`ipv4`, `ipv6`, or `rfc` plus at most five digits, such as `rfc2606`) is left as written. A longer version-like word such as `v2026.1021` or `v20261021` is replaced with `***`, the same as any other matched token. A secret-like mix is still replaced. A reason word is also replaced with `***` when it is the matched value, or when a case-insensitive slice of 4 or more characters sits in the matched value or the other way around. Short and low-entropy echoes are included. A shorter slice of letters only is left as written.

## How to add a host

Add one bare hostname per line to `scripts/code-gate/allowed-hosts.txt`. Blank lines and `#` comments are ignored. No scheme, no path, no `://`. A listed host covers its subdomains. The change needs human review in the pull request. Adding a host does not make that host legal in a database URL.

## Measurements

Labels follow the mesh rules: TESTED means rerun on the head of this pull request; REPORTED means taken from an earlier run whose output is not committed by SHA; SYNTHETIC means built cases, not real-world data. Intervals are Wilson 95%.

- False negatives (SYNTHETIC, TESTED): `python3 scripts/code-gate/fn_harness.py` builds 240 cases (40 base cases in 6 line contexts) at runtime and prints `caught 240/240`, Wilson lower bound 0.984. This is recall on synthetic cases only, not real-world recall.
- Recent `origin/main~20..origin/main` (TESTED, base `ee826d6b246d`, head `9cfda5a66b33`): 4,548 added lines in code and config files (6,082 added text lines in 65 files). 0 findings. The `example` hosts in `tools/pen_openmanus/tests/test_allowlist_loop.py` lines 50 and 51 are reserved names under this revision. Rate 0/4,548, Wilson [0, 8.4e-4].
- Earlier window (REPORTED, before this revision; scan output not committed by SHA): 13 findings, 11 true (photos over 2 MB), precision 11/13 = 0.846, Wilson [0.578, 0.957]. The 2 false positives were a date and a unix timestamp read as IPv4; the digit guard removes that class. Over all 96,300 added lines that was 2/96,300 = 2.1e-5, Wilson [5.7e-6, 7.6e-5].

## Gitai

This copy is in the public Gitai repository, `vitalitychems-dot/Gitai`. The sections above are the collab document at squash `8b88f0b5` (collab #290). The scanner and tests in this pull request are that revision, copied byte for byte. The workflow example is that revision copied verbatim: the only change from the Gitai copy of `37d38c4c` is the upstream main-create guard, and this file had no extra Gitai notes. `scripts/code-gate/allowed-hosts.txt` was not changed, including the six Gitai #1 allowlist entries.

The workflow stays at `scripts/code-gate/tessera-mesh-sync.yml.example`. It is not installed under `.github/workflows/`, because the credential that maintains Gitai has no workflow scope. This change does not add a CODEOWNERS file, does not change branch protection, and does not turn `code-gate` on as a required status check.

`scripts/code-gate/allowed-hosts.txt` starts from the collab file at `eb81e932`. Six Gitai hosts were added, each with a one-line reason: `frontend-api.clerk.dev` (Clerk Frontend API the API server proxies for authentication), `ui.shadcn.com` (official shadcn components schema referenced by components.json), `fonts.googleapis.com` (Google Fonts stylesheet the app index pages load), `fonts.gstatic.com` (Google Fonts file host the app index pages preconnect to), `phantom.app` (outbound user-facing link in WalletPage.tsx, bare apex, and the gate also matches its subdomains), and `jup.ag` (outbound user-facing link in WalletPage.tsx, bare apex, and the gate also matches its subdomains). No wildcard, raw IP, or private host was added.

Gitai has no `mesh/` directory and does not have `scripts/mesh-queue.sh` or `scripts/mesh-watch.sh`. `COLLAB_REQUIRE_MESH_TESTS` is unset, so the mesh script tests skip. The absolute-path guard from collab #288 was not applied.

The collab SHAs in Measurements are not Gitai commits. Gitai history on `main` is shorter than 20 commits, so a history scan is the whole tree.

History scan of Gitai `main` (TESTED, empty tree `4b825dc642cb6eb9a060e54bf8d69288fbee4904` through `33fcc9e8cde098441942efff8bf8dae63f21fcb0`, 12 commits): 231 files, 28,521 added lines, 27,380 in code and config. 0 blocking findings. No credential rule fired. New findings versus this branch: 0.

History scan of this working tree (TESTED, same empty tree, branch `pen/code-gate-288-port`): 231 files, 29,071 added lines, 27,910 in code and config. 0 blocking findings.

`python3 -m unittest discover -s scripts/code-gate -t scripts/code-gate`

`python3 scripts/code-gate/fn_harness.py`
