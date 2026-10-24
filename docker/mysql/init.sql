-- Runs once, when the MySQL volume is first created. The schema itself comes
-- from the Laravel migrations (`make migrate`); this only adds the separate
-- database the PHPUnit suite migrates and wipes (`make test`).
CREATE DATABASE IF NOT EXISTS `cemetery_test` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
GRANT ALL PRIVILEGES ON `cemetery_test`.* TO 'cemetery_user'@'%';
