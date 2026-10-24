FROM php:8.3-cli

RUN apt-get update && apt-get install -y \
    unzip \
    && docker-php-ext-install pdo pdo_mysql \
    && rm -rf /var/lib/apt/lists/*

COPY --from=composer:latest /usr/bin/composer /usr/bin/composer

WORKDIR /app

COPY composer.json composer.lock ./
RUN composer install --no-dev --no-interaction --no-scripts --no-autoloader

COPY . .

RUN composer dump-autoload --optimize --no-scripts

EXPOSE 8000

# opcache is loaded in the CLI image but off for CLI by default. The dev server
# is CLI, so enabling it stops recompiling the framework on every request;
# timestamps are always revalidated so edits still take effect immediately.
RUN printf 'opcache.enable_cli=1\nopcache.validate_timestamps=1\nopcache.revalidate_freq=0\n' \
    > /usr/local/etc/php/conf.d/opcache-dev.ini

# PHP's built-in server behind Laravel's router script. --no-reload keeps the
# compose environment (DB_*), which the reloading mode would strip.
CMD ["php", "artisan", "serve", "--host=0.0.0.0", "--port=8000", "--no-reload"]
