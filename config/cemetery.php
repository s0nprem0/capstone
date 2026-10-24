<?php

return [

    // Pending requests one client may hold at once; 0 turns the limit off.
    'reservation_max_pending' => max(0, (int) env('RESERVATION_MAX_PENDING', 3)),

    // Days an unpaid pending request holds its plot; 0 keeps holds forever.
    'reservation_hold_days' => max(0, (int) env('RESERVATION_HOLD_DAYS', 7)),

];
