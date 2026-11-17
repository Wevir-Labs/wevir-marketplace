# Default categories and discriminators

Adapted from the six Trail of Bits `plugins/insecure-defaults/references/*.md` category guides at commit `711af095215ad4ecde5b90cd1d0124b3f1c4ca9e`. CC-BY-SA-4.0. Examples below are rewritten analysis cues, not scanner rules or evidence about the user's repository.

| Category | Candidate | Evidence that makes it a finding | Counterevidence to check |
| --- | --- | --- | --- |
| Fail-open controls | Missing config disables auth, signature checks or certificate verification; exceptions return “allow” | Production input reaches a protected operation with the check disabled or bypassed | Startup aborts, safe parse defaults, a stronger guard at the same boundary |
| Fallback secrets | A fixed fallback becomes a session/JWT signing or encryption key | Startup accepts the fallback and security-sensitive data is actually protected by it | Mandatory secret validation; a suitable randomly generated key instead of a shared literal; a non-security identifier |
| Default credentials | First-run code seeds an account with a predictable password or accepts a built-in token | The credential authenticates with useful privileges on a reachable path | Disabled account; reset gate that prevents useful access until reset; fixture never imported by production |
| Permissive access | Broad file modes, public ACLs, unrestricted origin reflection, overbroad access policy | A party outside the intended trust boundary can read, write or invoke a sensitive operation | Effective umask/ACL/directory restrictions; intentional public assets; enforced authorization |
| Debug exposure | Error responses include internal data, debug consoles bind broadly, diagnostics default on | A lower-privileged party receives sensitive information or gains a dangerous capability | Redacted external response; protected internal logs; authenticated diagnostics; actual binding and routing |
| Crypto misuse | Fast unsalted password hashes, predictable security tokens, disabled verification, obsolete encryption | The primitive or parameter has a concrete weakness in this security use and reaches that use | Checksums/cache IDs rather than credentials; a protocol-specific construction with different security properties; enforced safe settings |

## Follow the default, then the sink

```text
unsafe candidate: config reader supplies a fixed fallback
    → missing input selects it
    → startup accepts it
    → a signing/auth/access decision uses it
    → an attacker can reach the affected operation

refuted candidate: config reader sees missing input
    → required-value validation rejects startup before any listener is opened
```

Find the code implementing each arrow. Where local deployment templates force an override, report which ones do so and what remains unknown. Do not infer universal production configuration from a single example.

## Stack-specific search cues

- JavaScript/TypeScript: `process.env`, `||`, `??`, wrapper schemas, string-to-boolean conversions and error handlers. The string `"false"` is truthy in JavaScript; verify how it is parsed.
- Python: `os.getenv`, `os.environ.get`, parser defaults, truthiness of nonempty strings and exception paths.
- Other stacks: `ENV.fetch`, `getOrDefault`, `System.getProperty`, shell default expansion, config merge order, CLI defaults and deployment templates. Derive the actual wrappers from the repository rather than assume these examples cover it.

## Avoid these shortcuts

- A CORS wildcard alone is not an authentication bypass. Establish the sensitive response, browser credential behavior, origin handling and attacker read path. A wildcard combined with credentials is not automatically accepted by browsers.
- Schema introspection alone does not prove disclosure of sensitive records or bypass of authorization.
- A requested file mode is not necessarily the effective permission: account for umask, existing files, ACLs and parent directories. Do not run `chmod` or change umask to test this.
- A forced-reset flag is not sufficient unless it blocks useful access before the reset.
- MD5 in a cache key is not password hashing. Collision weaknesses of a hash do not automatically prove its HMAC use forgeable. Explain the actual construction, threat and evidence; mark unavailable protocol context as a limit.
- A debug flag with no exposed sensitive data or capability is not a finding by itself. Conversely, unconditional raw error disclosure does not need a flag to matter.
- A suspicious test fixture can still matter if shipped or imported; a file named `production` does not prove deployment reachability either.
