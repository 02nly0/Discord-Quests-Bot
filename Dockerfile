FROM oven/bun:1.4.4 AS dependencies

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

FROM oven/bun:1.4.4

WORKDIR /app
ENV NODE_ENV=production

COPY --from=dependencies /app/node_modules ./node_modules
COPY package.json tsconfig.json ./
COPY src ./src
COPY assets ./assets

EXPOSE 8080

USER bun

CMD ["bun", "run", "src/index.ts"]
