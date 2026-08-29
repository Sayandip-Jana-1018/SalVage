package com.salvage.core.bounds.service;

import java.time.Instant;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.Objects;
import org.springframework.stereotype.Component;

/**
 * Hard guard enforcing quiet hours (22:00 to 08:00) in the customer's timezone.
 * Customer communication during quiet hours is strictly forbidden.
 */
@Component
public class QuietHoursGuard {

    public static final ZoneId DEFAULT_ZONE = ZoneId.of("Asia/Kolkata");
    public static final LocalTime QUIET_HOURS_START = LocalTime.of(22, 0); // 10:00 PM
    public static final LocalTime QUIET_HOURS_END = LocalTime.of(8, 0);   // 08:00 AM

    /**
     * Returns true if the given instant falls within quiet hours in the specified timezone.
     */
    public boolean isQuietHour(Instant timestamp, ZoneId zoneId) {
        Objects.requireNonNull(timestamp, "timestamp must not be null");
        ZoneId zone = (zoneId != null) ? zoneId : DEFAULT_ZONE;
        ZonedDateTime zdt = timestamp.atZone(zone);
        LocalTime time = zdt.toLocalTime();

        // Quiet hours cross midnight: [22:00, 23:59:59] or [00:00, 08:00)
        return !time.isBefore(QUIET_HOURS_START) || time.isBefore(QUIET_HOURS_END);
    }
}
