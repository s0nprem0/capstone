<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="description" content="St. John Memorial Garden & Parks — reserve cemetery lots and manage burial records online.">
    <meta name="theme-color" content="#2c5530">
    <link rel="icon" type="image/svg+xml" href="/favicon.svg">
    {{-- Referenced only from the stylesheet, so without this the browser would
         not discover the font until it had parsed the CSS. --}}
    <link rel="preload" href="/fonts/source-serif-4-latin.woff2" as="font" type="font/woff2" crossorigin>
    <title>St. John Memorial Garden &amp; Parks — Cemetery Reservation &amp; Records</title>
    @if ($css)
    <link rel="stylesheet" href="/dist/{{ $css }}">
    @endif
    @if ($js)
    <script type="module" src="/dist/{{ $js }}"></script>
    @endif
</head>
<body>
    <div id="root"></div>
    @unless ($js)
    <script type="module" src="http://localhost:5173/resources/js/main.jsx"></script>
    @endunless
</body>
</html>
