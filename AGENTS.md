## Philosophy

- Solve problem at hand. No refactors unless asked.
- Smallest diff wins. Three similar lines beat premature helper.
- Less code with same behavior always wins. Equivalent solutions: shorter one ships. Compression is intelligence.
- Don't over-guard. Check only conditions that can actually occur. `if (user)` on non-optional store return is wrong. `try/catch` on code that can't throw is wrong. `?.` on type-guaranteed values is wrong. Dead defensive code isn't safety.
- No comments unless asked. Keep existing ones, they carry context.
- Delete dead code. Don't comment out.
- Natural human text in errors, descriptions, toasts. No dashes, no robotic phrasing. Descriptions start capitalized, end with period.
- One-file plugin default. Split only past ~250 lines or when second file is genuinely reusable (`utils.ts`, `settings.ts`, `components/`).
- No abstraction for 1-2 call sites. Inline beats single-use hook. `createX` used once is just a function call.
- Don't reimplement what `@webpack/common` or `@utils/*` exports. Search first.
- Don't cache Discord data. Stores are source of truth, read on demand. Cache only what isn't in a store.
- Don't manage state Discord manages. `useStateFromStores` over `useState` + flux that mirrors a store.
- Don't recreate Discord components. Reuse `Button`, `TextInput`, `Tooltip`, `Menu.*`, etc. Hand-rolled `<button>` loses theme, focus rings, a11y.
- No state machine for boolean. No class wrapping single function. No `Strategy`/`Manager`/`Handler` suffix unless multiple implementations exist.
- When you want to add comments to the code, comment on why the code exists and not what the code does. The code is readable by the developer, but the developer doesn't know why this solution has been solved like this.

## TypeScript

- `strict: true`, `noImplicitAny: false`, `noUncheckedIndexedAccess: false`. Annotate params explicitly. Array index access not auto `undefined`.
- Never `any`. Use `unknown` + narrow, or type webpack results via `find*` generic.
- Never `as unknown as`. Write type guard or use `satisfies`.
- Never `@ts-ignore`. Use `@ts-expect-error` with one-line reason only when unavoidable.
- Never `!` non-null assertion. Narrow with `if` or early return.
- Never `enum` (including `const enum`). Use `as const` object plus literal union.
- Never boxed primitives (`Number`, `String`, `Boolean`, `Object`, `Function`, `{}`).
- Never `namespace`. Modules only.
- Never `../../` when `@alias` exists.
- `satisfies T` over `as T` when value already conforms. `as` only for genuine narrowing.