FROM node:22-bookworm-slim

WORKDIR /app

RUN npm install -g pnpm@9.15.9

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./

COPY artifacts ./artifacts
COPY lib ./lib
COPY scripts ./scripts

RUN pnpm install --no-frozen-lockfile

RUN pnpm --filter @workspace/web build

ENV NODE_ENV=production
ENV BASE_PATH=/

EXPOSE 3000

CMD ["pnpm", "--filter", "@workspace/web", "serve"]
