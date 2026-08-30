package com.salvage.core.api;

import java.util.Objects;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Counted telemetry for one merchant.
 *
 * <p>See {@link MerchantStats} for what this deliberately does not report and
 * why. The same authentication caveat as {@link LedgerController} applies.
 */
@RestController
@RequestMapping("/api/v1/telemetry")
public class TelemetryController {

    private static final int DEFAULT_WINDOW_HOURS = 24;

    private final TelemetryService telemetry;

    public TelemetryController(TelemetryService telemetry) {
        this.telemetry = Objects.requireNonNull(telemetry, "telemetry must not be null");
    }

    @GetMapping("/merchants/{merchantId}/stats")
    public MerchantStats stats(
            @PathVariable String merchantId,
            @RequestParam(name = "hours", defaultValue = "" + DEFAULT_WINDOW_HOURS) int hours) {
        return telemetry.statsFor(merchantId, hours);
    }
}
