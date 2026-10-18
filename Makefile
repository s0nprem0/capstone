.PHONY: up down restart logs install migrate map-data demo fresh build verify-map setup php node mysql

# Compose provider. `docker compose` also works under Podman Desktop, where the
# docker CLI is a shim over podman-compose; override for a bare podman install:
#   make DC="podman-compose" up
DC ?= docker compose

# Under rootless Podman the node image's `node` user (uid 1000) maps to a subuid
# and cannot write the bind-mounted workspace, so the build — the one step that
# writes into it — runs as root, which maps back to your own host user. Plain
# Docker already matches the host uid, so it keeps using `node`.
ROOTLESS_PODMAN := $(shell podman info --format '{{.Host.Security.Rootless}}' 2>/dev/null)
ifeq ($(ROOTLESS_PODMAN),true)
NODE_EXEC := $(DC) exec -u root node
else
NODE_EXEC := $(DC) exec node
endif

# One-shot bring-up from a clean clone. The .env copy matters: bootstrap reads
# it when present, and the file is gitignored, so a fresh checkout has none.
setup:
	@[ -f .env ] || cp .env.example .env
	$(MAKE) up
	$(MAKE) install
	$(MAKE) migrate
	$(MAKE) map-data

up:
	$(DC) up -d

down:
	$(DC) down

restart:
	$(DC) restart

logs:
	$(DC) logs -f

install:
	$(DC) exec php composer install
	$(DC) exec node pnpm install

build:
	$(NODE_EXEC) pnpm build

migrate:
	$(DC) exec -T mysql mysql -u cemetery_user -psecret cemetery_db < database/schema.sql

# Loads the surveyed map: the 70 sections and the 6837 plots traced off the plan
# in public/traces/survey-lines.png. Kept out of schema.sql because it is
# thousands of rows of surveyed geometry rather than a definition of the
# database, and the plan can be re-traced without the schema moving.
# Run after `make migrate`.
map-data:
	$(DC) exec -T mysql mysql -u cemetery_user -psecret cemetery_db < database/survey/lots.sql

# Loads the demo dataset. Run after `make migrate` and `make map-data`, which
# reset the database to the schema and the surveyed plots alone.
demo:
	$(DC) exec -T mysql mysql -u cemetery_user -psecret cemetery_db < database/demo.sql

fresh:
	$(DC) down -v
	$(DC) up -d --build

# Checks the map geometry the seed and the lot editor both depend on: every
# plot's centre inside its section outline, no two plots overlapping, and
# nothing outside the overall viewBox. Exits non-zero when one is not.
verify-map:
	$(DC) exec -T php php verify-map.php

php:
	$(DC) exec php bash

node:
	$(DC) exec node sh

mysql:
	$(DC) exec mysql mysql -u cemetery_user -psecret cemetery_db
