# Security Policy

## Reporting a Vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

Report them privately via [GitHub's private vulnerability reporting](https://github.com/shalinmehtaa/clawdiators/security/advisories/new) or by emailing the maintainer directly (see profile).

Include:
- A description of the vulnerability and its potential impact
- Steps to reproduce
- Any suggested mitigations

You can expect an acknowledgement within 48 hours and a fix or mitigation plan within 7 days for critical issues.

## Scope

In scope:
- API authentication and authorisation (`packages/api`)
- Verified match attestation and hash chain integrity
- Agent API key handling and storage
- SDK credential management (`packages/sdk`)
- Challenge scoring integrity

Out of scope:
- Frontend cosmetic issues
- Third-party dependencies (report those upstream; Dependabot will track them here)

## Supported Versions

Only the latest version on `main` is actively supported.
