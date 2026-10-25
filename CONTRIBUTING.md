# Contributing

Thanks for considering a contribution. This project is small on purpose, so the
fastest way to get a change merged is to keep it focused and leave the existing
architecture intact.

## Before you start

- Open an issue for anything larger than a bug fix so the approach can be agreed
  on first.
- Never paste a real Discord token into an issue, pull request, test, or log.
  Use obviously fake values such as `abc.def.ghi`.
- Report security problems privately as described in [SECURITY.md](SECURITY.md).

## Setup

```sh
bun install
cp .env.example .env   # fill in a bot token if you want to run the bot
```

Bun **1.1+** is required.

## Checks

Run the full suite before opening a pull request:

```sh
bun run check          # typecheck + lint + tests
```

The individual commands are also available:

| Command             | What it does                              |
| ------------------- | ----------------------------------------- |
| `bun run typecheck` | Strict `tsc --noEmit`                     |
| `bun run lint`      | Biome lint and formatting check           |
| `bun run lint:fix`  | Apply Biome's safe fixes and formatting   |
| `bun test`          | Run the Bun test suite                    |
| `bun run test:watch`| Re-run tests on change                    |

CI runs the same typecheck, lint, and test steps on every push and pull request.

## Code expectations

- **Keep the engine independent.** `src/quest/` and `src/api/` must not import
  `discord.js`. The bot layer (`src/bot/`) is the only place that should depend
  on it.
- **Follow the existing style.** Tabs, single quotes, semicolons, and a 120
  column line width are enforced by Biome. Run `bun run lint:fix` rather than
  hand-formatting.
- **Explain non-obvious decisions in comments.** Comments should say why a
  choice was made, not restate what the line does.
- **Keep tokens out of logs and errors.** `DiscordApiError` deliberately does
  not include the request headers or token; do not add them.
- **Add a test with behaviour changes.** Tests live next to the code as
  `*.test.ts`. Use `src/testing/fake-client.ts` for engine tests instead of
  hitting the network.

## Commits and pull requests

- Write a concise commit title and explain the what and why in the body.
- Keep unrelated changes in separate commits.
- Describe how you tested the change in the pull request.
- Do not commit `.env`, tokens, credentials, or generated runtime data.
