.PHONY: up down restart logs install migrate demo fresh build verify-map

up:
	docker compose up -d

down:
	docker compose down

restart:
	docker compose restart

logs:
	docker compose logs -f

install:
	docker compose exec php composer install
	docker compose exec node pnpm install

build:
	docker compose exec node pnpm build

migrate:
	docker compose exec -T mysql mysql -u cemetery_user -psecret cemetery_db < database/schema.sql

# Loads the demo dataset. Run after `make migrate`, which resets the database
# to the schema alone.
demo:
	docker compose exec -T mysql mysql -u cemetery_user -psecret cemetery_db < database/demo.sql

fresh:
	docker compose down -v
	docker compose up -d --build

# Checks the map geometry the seed and the lot editor both depend on: every
# plot's centre inside its section outline, no two plots overlapping, and
# nothing outside the overall viewBox. Exits non-zero when one is not.
verify-map:
	docker compose exec -T php php verify-map.php

php:
	docker compose exec php bash

node:
	docker compose exec node sh

mysql:
	docker compose exec mysql mysql -u cemetery_user -psecret cemetery_db
