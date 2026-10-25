# Discord Quests Bot

A Discord bot that automatically completes your Discord quests - pick a quest or run all of them with a single click, then claim your rewards.

Built with [Bun](https://bun.sh) and TypeScript. The quest engine (`src/quest`) is fully decoupled from the bot layer, so you can also use it as a library in your own projects.

## How it works

Discord tracks quest progress server-side through a set of undocumented endpoints normally driven by the desktop client. Given a user token, the bot speaks to those endpoints directly:

1. **Validate** - the token is checked against `GET /users/@me`.
2. **Fetch** - `GET /quests/@me` lists every active quest on the account.
3. **Enroll** - `POST /quests/{id}/enroll` opts the account into the quest when needed.
4. **Progress** - the engine reports activity until the task target is reached:
   - *Video quests* (`WATCH_VIDEO`, `WATCH_VIDEO_ON_MOBILE`) post a timestamp to `/quests/{id}/video-progress` every 5 seconds.
   - *Game quests* (`PLAY_ON_DESKTOP`, `PLAY_ON_XBOX`, `PLAY_ON_PLAYSTATION`, `STREAM_ON_DESKTOP`, `PLAY_ACTIVITY`) post `application_id` and `executable_path` to `/quests/{id}/heartbeat` every 30 seconds. Executable paths are resolved from Discord's public application directory and cached per game.
5. **Finish** - game sessions end with a `terminal: true` heartbeat, matching what the real client sends when a game closes.

The engine handles rate limits (including 429 backoff), transient network retries, stall detection (a game quest that reports no progress for 8 minutes is abandoned and the batch moves on), and graceful cancellation mid-heartbeat.

## Supported quest types

| Task | Method |
| --- | --- |
| `WATCH_VIDEO` / `WATCH_VIDEO_ON_MOBILE` | Video progress |
| `PLAY_ON_DESKTOP` | Heartbeat |
| `PLAY_ON_XBOX` | Heartbeat |
| `PLAY_ON_PLAYSTATION` | Heartbeat |
| `STREAM_ON_DESKTOP` | Heartbeat |
| `PLAY_ACTIVITY` | Heartbeat |

Quests whose tasks fall outside this list are shown in the quest list but skipped by the automation.

## Setup

Requires [Bun](https://bun.sh) v1.1 or newer.

```sh
bun install
cp .env.example .env   # then fill in DISCORD_TOKEN
```

| Variable | Required | Description |
| --- | --- | --- |
| `DISCORD_TOKEN` | yes | Your bot token from the [developer portal](https://discord.com/developers/applications) |
| `GUILD_ID` | no | Register commands in one guild for instant availability during development; leave empty for global registration |

```sh
bun run dev     # development, with file watching
bun run start   # production
bun run typecheck
```

## Usage

1. Run `/quests` and paste your Discord user token into the modal.
2. The bot lists your active quests with live progress.
3. Pick a single quest from the menu, or press **Complete all**.
4. Watch the progress embed, press **Stop** at any time, and claim your rewards in the Discord client when done.

Tokens are validated, kept in memory for the duration of a session, and dropped as soon as the run ends. Nothing is persisted, logged, or sent anywhere other than discord.com.

## Project structure

```
src/
├── api/                REST client for user-token requests
│   ├── client.ts       rate limiting, retries, timeouts
│   ├── errors.ts       typed API errors
│   ├── fingerprint.ts  desktop client headers / x-super-properties
│   └── token.ts        token shape checks and validation
├── bot/                Discord bot layer (discord.js)
│   ├── commands.ts     slash command registration
│   ├── embeds.ts       embed builders for the quest UI
│   ├── flow.ts         interaction handling and run orchestration
│   └── registry.ts     per-user setup and run state
├── quest/              Quest engine - no discord.js dependency
│   ├── complete.ts     batch orchestration with hooks
│   ├── executables.ts  game executable resolution
│   ├── quest.ts        quest model and progress queries
│   ├── runner.ts       heartbeat / video-progress loop
│   └── tasks.ts        supported task registry and pacing
├── util/               Small shared helpers
├── config.ts           environment configuration
└── index.ts            entry point
```

## Disclaimer

Automating a user account violates the Discord Terms of Service and can lead to the account being suspended. This project exists for educational purposes - use it at your own risk, ideally on an account you can afford to lose.

## License

[Apache-2.0](LICENSE)
