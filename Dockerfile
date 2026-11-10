FROM node:24-alpine

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@8.15.0 --activate

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

ENV NODE_ENV=production
ENV DATA_DIR=/app/data
ENV PORT=3000
VOLUME /app/data
EXPOSE 3000

CMD ["pnpm", "start"]
