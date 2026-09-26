FROM node:22-alpine

# Corepack otherwise prompts for Y/n before downloading pnpm, which blocks
# `docker compose exec` (it allocates a TTY) instead of defaulting to yes.
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0

# Without this, pnpm resolves its store against the filesystem it runs on: the
# image build lands it under /home/node while the bind-mounted /app pulls it to
# <project>/.pnpm-store at runtime. The mismatch made every `make install`
# offer to purge and reinstall node_modules from scratch.
ENV npm_config_store_dir=/home/node/.local/share/pnpm/store

RUN corepack enable

WORKDIR /app
RUN chown node:node /app

COPY --chown=node:node package.json pnpm-lock.yaml .npmrc ./

# Install as the same user that runs the dev server. Installing as root
# recorded storeDir=/root/..., so every later run saw a foreign store and
# offered to purge and reinstall node_modules.
USER node
RUN pnpm install --frozen-lockfile

USER root
COPY --chown=node:node . .

# The workspace is bind-mounted over /app and node_modules is a named volume
# seeded from this image, so run as the uid that owns both on the host. As root
# this container left root-owned dist/ behind, which broke `pnpm build` for
# anyone building on the host.
USER node

EXPOSE 5173

CMD ["pnpm", "dev", "--host"]
