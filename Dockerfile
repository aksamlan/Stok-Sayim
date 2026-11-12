FROM node:24-alpine

WORKDIR /app

# KKTC saat dilimi (TZ=Europe/Nicosia) için zoneinfo gerekir
RUN apk add --no-cache tzdata

RUN corepack enable && corepack prepare pnpm@8.15.0 --activate

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

ENV NODE_ENV=production
ENV DATA_DIR=/app/data
ENV PORT=3009
VOLUME /app/data
EXPOSE 3009

CMD ["pnpm", "start"]
