.PHONY: up down restart logs install migrate upgrade map-data demo fresh build verify-map test setup php node mysql

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

# One-shot bring-up from a clean clone. .env is gitignored, so a fresh checkout
# has none; install creates it and generates the APP_KEY sessions are sealed with.
setup:
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
	@[ -f .env ] || cp .env.example .env
	$(DC) exec php composer install
	@grep -q '^APP_KEY=base64:' .env || $(DC) exec -T php php artisan key:generate
	$(DC) exec node pnpm install

build:
	$(NODE_EXEC) pnpm build

# Rebuilds the database from the migrations and seeds the admin account and the
# survey sections. Drops every table first, so it resets the data too; apply a
# new migration to a database you want to keep with `make upgrade`.
migrate:
	$(DC) exec -T php php artisan migrate:fresh --seed --force

# Applies pending migrations, keeping the data. A database built from the
# pre-Laravel schema.sql is adopted as it is by the first migration, once the
# SQL upgrades it is missing have been applied:
#   make upgrade FILE=database/upgrades/2026-10-23-reservation-cancel.sql
upgrade:
	@if [ -z "$(FILE)" ]; then $(DC) exec -T php php artisan migrate --force; exit; fi
	$(DC) exec -T mysql mysql -u cemetery_user -psecret cemetery_db < $(FILE)

# Loads the surveyed map: the 70 sections and the 6769 plots traced off the plan
# in public/traces/survey-lines.png. Kept out of the migrations because it is
# thousands of rows of surveyed geometry rather than a definition of the
# database, and the plan can be re-traced without the schema moving.
# Run after `make migrate`.
map-data:
	$(DC) exec -T php php artisan map:load

# Loads the demo dataset. Run after `make migrate` and `make map-data`, which
# reset the database to the schema and the surveyed plots alone.
demo:
	$(DC) exec -T php php artisan demo:load

fresh:
	$(DC) down -v
	$(DC) up -d --build

# Checks the map geometry the seed and the lot editor both depend on: every
# plot's centre inside its section outline, no two plots overlapping, and
# nothing outside the overall viewBox. Exits non-zero when one is not.
verify-map:
	$(DC) exec -T php php artisan map:verify

# The PHPUnit suite, against its own cemetery_test database (created here too,
# for a MySQL volume made before docker/mysql/init.sql existed).
test:
	$(DC) exec -T mysql mysql -u root -proot -e "CREATE DATABASE IF NOT EXISTS cemetery_test DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; GRANT ALL PRIVILEGES ON cemetery_test.* TO 'cemetery_user'@'%';"
	$(DC) exec -T php php artisan test

php:
	$(DC) exec php bash

node:
	$(DC) exec node sh

mysql:
	$(DC) exec mysql mysql -u cemetery_user -psecret cemetery_db
