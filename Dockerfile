FROM node:22-bookworm-slim

WORKDIR /app

RUN npm install -g pnpm@9.15.9

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

COPY artifacts ./artifacts
COPY lib ./lib
COPY scripts ./scripts

RUN pnpm install --frozen-lockfile

RUN pnpm --filter @workspace/api-server build

ENV NODE_ENV=production

EXPOSE 3000

CMD ["pnpm", "--filter", "@workspace/api-server", "start"]
