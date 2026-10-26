# Security policy

## Supported versions

The latest release on the `main` branch is supported. Fixes are not backported
to older tags.

## Reporting a vulnerability

Please report security issues privately through GitHub's
[security advisories](https://github.com/DevonNetwork/Discord-Quests-Bot/security/advisories/new).
Do not open a public issue for a vulnerability.

A useful report includes:

- what the issue allows an attacker to do,
- the affected file or endpoint,
- minimal reproduction steps, and
- any suggested fix.

**Never include a real Discord token in a report.** A description of the
mechanism is enough; the maintainers do not need working credentials.

You can expect an initial response within a few days. Once the issue is
confirmed, a fix and coordinated disclosure timeline will be agreed on before
details are published.

## Token handling

This project handles Discord user tokens, so the following guarantees are
treated as security-sensitive:

- Tokens are held in memory only for the lifetime of a session and are never
  written to disk.
- Tokens are never logged, echoed in error messages, or sent anywhere other
  than `discord.com`.
- `DiscordApiError` intentionally excludes request headers and the token from
  its message and body.
- The bot has no database and stores no user state.

If you find a path that violates any of these, treat it as a vulnerability and
report it privately.
