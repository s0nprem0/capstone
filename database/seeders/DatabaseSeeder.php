<?php

declare(strict_types=1);

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        // Default admin (password: admin123).
        DB::table('users')->insert([
            'fullname' => 'System Administrator',
            'email' => 'admin@cemetery.test',
            'phone' => '09170000001',
            'password' => '$2y$10$By0J7o/86O1M19BODiwRGOq6EcnSjZehzxdQVrDiEOe1lW2tTA2Rq',
            'role' => 'admin',
            'status' => 'active',
        ]);

        // Sections as numbered on the survey plan. Each circled number is one
        // section (a row of plots); svg_viewbox is a small crop around that
        // number for the section detail view. Plots are not seeded here:
        // `make map-data` loads the surveyed ones.
        $sections = [
            ['Section 3', 'Survey section 3', '0 876 4096 65', 3, '542 882 1042 882 1042 935 542 935'],
            ['Section 4', 'Survey section 4', '0 931 4096 96', 4, '541 937 1042 937 1042 1021 541 1021'],
            ['Section 5', 'Survey section 5', '0 1015 4096 96', 5, '540 1021 1041 1021 1041 1105 540 1105'],
            ['Section 6', 'Survey section 6', '0 1100 4096 93', 6, '520 1106 1040 1106 1040 1187 520 1187'],
            ['Section 7', 'Survey section 7', '0 1184 4096 95', 7, '519 1190 1039 1190 1039 1273 519 1273'],
            ['Section 8', 'Survey section 8', '0 1269 4096 91', 8, '518 1275 1038 1275 1038 1354 518 1354'],
            ['Section 9', 'Survey section 9', '0 1352 4096 94', 9, '517 1358 1037 1358 1037 1440 517 1440'],
            ['Section 10', 'Survey section 10', '0 1437 4096 97', 10, '516 1443 1021 1443 1021 1528 516 1528'],
            ['Section 11', 'Survey section 11', '0 1524 4096 54', 11, '516 1530 986 1530 986 1572 516 1572'],
            ['Section 12', 'Survey section 12', '0 894 4096 56', 12, '1100 900 1506 900 1506 944 1100 944'],
            ['Section 13', 'Survey section 13', '0 935 4096 99', 13, '1100 941 1507 941 1507 1028 1100 1028'],
            ['Section 14', 'Survey section 14', '0 1020 4096 98', 14, '1101 1026 1507 1026 1507 1112 1101 1112'],
            ['Section 15', 'Survey section 15', '0 1104 4096 98', 15, '1101 1110 1528 1110 1528 1196 1101 1196'],
            ['Section 16', 'Survey section 16', '0 1187 4096 96', 16, '1102 1193 1560 1193 1560 1277 1102 1277'],
            ['Section 17', 'Survey section 17', '0 1270 4096 93', 17, '1102 1276 1680 1276 1680 1357 1102 1357'],
            ['Section 18', 'Survey section 18', '0 1352 4096 95', 18, '1103 1358 1614 1358 1614 1441 1103 1441'],
            ['Section 19', 'Survey section 19', '0 1437 4096 97', 19, '1024 1443 1560 1443 1560 1528 1024 1528'],
            ['Section 20', 'Survey section 20', '0 1522 4096 53', 20, '990 1528 1680 1528 1680 1569 990 1569'],
            ['Section 21', 'Survey section 21', '0 1353 4096 94', 21, '1581 1359 1680 1359 1680 1441 1581 1441'],
            ['Section 22', 'Survey section 22', '0 0 4096 84', 22, null],
            ['Section 23', 'Survey section 23', '0 1411 4096 49', 23, '2070 1417 2113 1417 2113 1454 2070 1454'],
            ['Section 24', 'Survey section 24', '0 1449 4096 137', 24, '1563 1456 2164 1456 2164 1578 1563 1578'],
            ['Section 25', 'Survey section 25', '0 1666 4096 53', 25, '496 1672 1183 1672 1183 1713 496 1713'],
            ['Section 26', 'Survey section 26', '0 1699 4096 142', 26, '496 1707 1233 1707 1233 1834 496 1834'],
            ['Section 27', 'Survey section 27', '0 1790 4096 102', 27, '496 1796 1216 1796 1216 1886 496 1886'],
            ['Section 28', 'Survey section 28', '0 1874 4096 106', 28, '475 1880 1216 1880 1216 1974 475 1974'],
            ['Section 29', 'Survey section 29', '0 0 4096 84', 29, null],
            ['Section 30', 'Survey section 30', '0 2040 4096 112', 30, '478 2046 1232 2046 1232 2146 478 2146'],
            ['Section 31', 'Survey section 31', '0 2127 4096 106', 31, '496 2133 1231 2133 1231 2227 496 2227'],
            ['Section 32', 'Survey section 32', '0 1619 4096 124', 32, '1187 1626 2008 1626 2008 1737 1187 1737'],
            ['Section 33', 'Survey section 33', '0 1690 4096 138', 33, '1134 1697 2007 1697 2007 1820 1134 1820'],
            ['Section 34', 'Survey section 34', '0 1772 4096 140', 34, '1134 1779 2008 1779 2008 1904 1134 1904'],
            ['Section 35', 'Survey section 35', '0 1858 4096 139', 35, '1152 1865 2007 1865 2007 1989 1152 1989'],
            ['Section 36', 'Survey section 36', '0 1941 4096 138', 36, '1285 1948 2007 1948 2007 2071 1285 2071'],
            ['Section 37', 'Survey section 37', '0 2023 4096 134', 37, '1133 2030 2339 2030 2339 2150 1133 2150'],
            ['Section 38', 'Survey section 38', '0 2103 4096 115', 38, '1113 2109 2278 2109 2278 2212 1113 2212'],
            ['Section 39', 'Survey section 39', '0 2182 4096 110', 39, '1577 2188 2569 2188 2569 2286 1577 2286'],
            ['Section 40', 'Survey section 40', '0 0 4096 84', 40, null],
            ['Section 41', 'Survey section 41', '0 2393 4096 98', 41, '1826 2399 1990 2399 1990 2485 1826 2485'],
            ['Section 42', 'Survey section 42', '0 867 4096 139', 42, '2007 874 3097 874 3097 998 2007 998'],
            ['Section 43', 'Survey section 43', '0 949 4096 136', 43, '2022 956 3130 956 3130 1077 2022 1077'],
            ['Section 44', 'Survey section 44', '0 1031 4096 92', 44, '2040 1037 3157 1037 3157 1117 2040 1117'],
            ['Section 45', 'Survey section 45', '0 1113 4096 90', 45, '2007 1119 3189 1119 3189 1197 2007 1197'],
            ['Section 46', 'Survey section 46', '0 1192 4096 51', 46, '2042 1198 3205 1198 3205 1237 2042 1237'],
            ['Section 47', 'Survey section 47', '0 1313 4096 48', 47, '2241 1319 3116 1319 3116 1355 2241 1355'],
            ['Section 48', 'Survey section 48', '0 1408 4096 52', 48, '2116 1414 2684 1414 2684 1454 2116 1454'],
            ['Section 49', 'Survey section 49', '0 1450 4096 91', 49, '2167 1456 2700 1456 2700 1535 2167 1535'],
            ['Section 50', 'Survey section 50', '0 1530 4096 96', 50, '2071 1536 2700 1536 2700 1620 2071 1620'],
            ['Section 51', 'Survey section 51', '0 1610 4096 88', 51, '1976 1616 2669 1616 2669 1692 1976 1692'],
            ['Section 52', 'Survey section 52', '0 1684 4096 97', 52, '2061 1690 2717 1690 2717 1775 2061 1775'],
            ['Section 53', 'Survey section 53', '0 1765 4096 97', 53, '1929 1771 2670 1771 2670 1856 1929 1856'],
            ['Section 54', 'Survey section 54', '0 1847 4096 97', 54, '2061 1853 2702 1853 2702 1938 2061 1938'],
            ['Section 55', 'Survey section 55', '0 1923 4096 161', 55, '2063 1932 2743 1932 2743 2076 2063 2076'],
            ['Section 56', 'Survey section 56', '0 1368 4096 92', 56, '2687 1374 3225 1374 3225 1454 2687 1454'],
            ['Section 57', 'Survey section 57', '0 1447 4096 93', 57, '2671 1453 3227 1453 3227 1534 2671 1534'],
            ['Section 58', 'Survey section 58', '0 1529 4096 91', 58, '2671 1535 3260 1535 3260 1614 2671 1614'],
            ['Section 59', 'Survey section 59', '0 1606 4096 88', 59, '2671 1612 3210 1612 3210 1688 2671 1688'],
            ['Section 60', 'Survey section 60', '0 1684 4096 91', 60, '2689 1690 3347 1690 3347 1769 2689 1769'],
            ['Section 61', 'Survey section 61', '0 1758 4096 98', 61, '2672 1764 3413 1764 3413 1850 2672 1850'],
            ['Section 62', 'Survey section 62', '0 1839 4096 97', 62, '2625 1845 3472 1845 3472 1930 2625 1930'],
            ['Section 63', 'Survey section 63', '0 1914 4096 159', 63, '2673 1923 3507 1923 3507 2065 2673 2065'],
            ['Section 64', 'Survey section 64', '0 1606 4096 85', 64, '3199 1612 3318 1612 3318 1685 3199 1685'],
            ['Section 65', 'Survey section 65', '0 2045 4096 198', 65, '2106 2056 3417 2056 3417 2233 2106 2233'],
            ['Section 66', 'Survey section 66', '0 0 4096 84', 66, null],
            ['Section 67', 'Survey section 67', '0 0 4096 84', 67, null],
            ['Section 68', 'Survey section 68', '0 0 4096 84', 68, null],
        ];

        DB::table('cemetery_sections')->insert(array_map(fn (array $row) => [
            'section_name' => $row[0],
            'location' => null,
            'description' => $row[1],
            'svg_viewbox' => $row[2],
            'section_number' => $row[3],
            'svg_points' => $row[4],
        ], $sections));
    }
}
