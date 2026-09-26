.PHONY: up down restart logs install migrate fresh build

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
	docker compose exec mysql mysql -u cemetery_user -psecret cemetery_db < database/schema.sql

fresh:
	docker compose down -v
	docker compose up -d --build

php:
	docker compose exec php bash

node:
	docker compose exec node sh

mysql:
	docker compose exec mysql mysql -u cemetery_user -psecret cemetery_db
