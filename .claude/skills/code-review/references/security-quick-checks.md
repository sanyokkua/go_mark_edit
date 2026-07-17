# Security Quick Checks

A fast, scannable list of security smells to catch during a normal code review. This is a
*complement* to a dedicated security audit, not a replacement — when a real risk is found, note it
as a **blocking finding and flag it for a dedicated deeper security pass**.

For GoMarkEdit specifically, weight the checks toward its real attack surface: the guarded
`internal/assets` handler (path-traversal / allowlist), the Stage-3 LLM tool loop treating **model
output as untrusted input** (schema-validate every tool call, allowlist workspace-file reads), secret
handling (env-var **name** only, never a key in code/DB/log/transcript), and the offline invariant
(no unexpected outbound socket). SQLite is CGO-free `modernc.org/sqlite` with sqlc-parameterized
queries — raw string-concatenated SQL is a red flag.

Each item gives: the **smell**, **why it matters**, a **grep-style pattern** to find candidates, and
the **flag** trigger. Patterns are starting points — confirm by reading the code in context;
treat hits as candidates, not confirmed bugs.

## Injection sinks

- **SQL built by string concatenation / interpolation**
  - Why: untrusted input becomes executable SQL → data theft or destruction.
  - Grep: `"SELECT .*" *[+%] |f"SELECT.*\{|execute\(.*[%+]|\.format\(.*SELECT`
  - Fix direction: parameterized queries / prepared statements / an ORM's binding API.
  - Flag as blocking if user-controlled data reaches any query string.
- **Command execution with user input**
  - Why: shell/command injection → arbitrary code execution.
  - Grep: `os\.system|subprocess.*shell=True|exec\(|eval\(|child_process\.exec\(|Runtime\.getRuntime\(\)\.exec`
  - Fix direction: pass argument arrays (no shell), validate/allowlist, avoid `eval`.
  - Escalate if any externally influenced value flows into a command.
- **Template injection**
  - Why: user input rendered as a template can execute code or leak data.
  - Grep: `render_template_string|Template\(.*\+|{{.*request|Handlebars\.compile\(.*\+`
  - Fix direction: pass data as context variables, never build the template from input.
  - Escalate if user input forms part of the template source.

## Authorization

- **Missing authorization checks on new endpoints / handlers**
  - Why: a route without an authz check exposes data or actions to anyone.
  - Grep: route/handler decorators (`@app\.(get|post)|@RequestMapping|router\.(get|post)`) — then verify each new one has an auth/permission check.
  - Fix direction: enforce authentication and per-resource authorization on every new entry point.
  - Escalate if any new endpoint touches user data or privileged actions without an explicit check.

## Secrets

- **Hardcoded secrets / credentials / API keys**
  - Why: secrets in source leak via repos, logs, and history; rotation becomes painful.
  - Grep: `(password|passwd|secret|api[_-]?key|token|access[_-]?key)\s*[=:]\s*["'][^"']+["']|AKIA[0-9A-Z]{16}|-----BEGIN (RSA|EC|OPENSSH) PRIVATE KEY-----`
  - Fix direction: load from environment / a secrets manager; add to ignore lists.
  - Escalate immediately if a real secret was committed (it must also be rotated).

## Unsafe deserialization

- **Deserializing untrusted data**
  - Why: many deserializers can instantiate arbitrary objects → remote code execution.
  - Grep: `pickle\.load|yaml\.load\((?!.*Loader=SafeLoader)|readObject\(|unserialize\(|Marshal\.load`
  - Fix direction: `yaml.safe_load`, JSON instead of native serialization, signed/validated payloads, allowlists.
  - Escalate whenever untrusted bytes hit a native deserializer.

## Path traversal

- **User-controlled file paths**
  - Why: `../` sequences let attackers read/write outside the intended directory.
  - Grep: `open\(.*request|os\.path\.join\(.*request|new File\(.*request|readFile\(.*req\.`
  - Fix direction: canonicalize and verify the resolved path stays within an allowed root; allowlist names.
  - Escalate if any external input contributes to a filesystem path.

## Server-Side Request Forgery (SSRF)

- **User-controlled URLs in server-side fetches**
  - Why: the server can be tricked into requesting internal/metadata endpoints.
  - Grep: `requests\.(get|post)\(.*request|fetch\(.*req\.|urlopen\(.*request|http.*Get\(.*r\.`
  - Fix direction: allowlist hosts/schemes, block private/link-local ranges, disable redirects to internal targets.
  - Escalate if a request target is derived from user input.

## Weak cryptography

- **Weak hashing / ciphers / hardcoded crypto material**
  - Why: MD5/SHA-1 for passwords are crackable; ECB leaks patterns; hardcoded IV/keys break confidentiality.
  - Grep: `MD5|SHA1|hashlib\.md5|DES|AES.*ECB|Cipher\.getInstance\("AES"\)|IV *= *["']`
  - Fix direction: bcrypt/scrypt/Argon2 for passwords; authenticated modes (GCM) with random per-message IVs; keys from a manager.
  - Escalate if weak crypto protects credentials or sensitive data.

## Transport security

- **Disabled TLS verification**
  - Why: turns off the protection that prevents man-in-the-middle interception.
  - Grep: `verify=False|rejectUnauthorized:\s*false|InsecureSkipVerify:\s*true|trustAllCerts|NODE_TLS_REJECT_UNAUTHORIZED`
  - Fix direction: keep verification on; pin/trust the correct CA instead of disabling.
  - Escalate any disabled verification reaching production code.

## CORS

- **Overly permissive Cross-Origin Resource Sharing (CORS)**
  - Why: `*` with credentials, or reflecting arbitrary origins, exposes authenticated APIs cross-site.
  - Grep: `Access-Control-Allow-Origin.*\*|cors\(\)|origin:\s*true|Allow-Credentials.*true`
  - Fix direction: allowlist specific trusted origins; never combine wildcard origin with credentials.
  - Escalate if a credentialed API allows wildcard or reflected origins.

## Logging

- **Logging secrets or personal data (PII)**
  - Why: logs are widely readable and long-lived; they become a secondary leak.
  - Grep: `log.*(password|token|secret|ssn|card|authorization)|print\(.*(password|token)`
  - Fix direction: redact/mask sensitive fields; log identifiers, not raw values.
  - Escalate if credentials or regulated PII are written to logs.

---

**Rule of thumb:** if any of these patterns matches and the data involved is *externally
influenced* (a user's Markdown/file, a provider response, or model tool-call output), raise it as a
finding with the relevant severity and recommend a dedicated deeper security pass. When in doubt,
flag it — a false positive costs a sentence; a missed injection costs an incident.
