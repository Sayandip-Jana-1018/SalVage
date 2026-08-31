package com.salvage.core.api;

import com.salvage.core.api.auth.ApiPrincipal;
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
 * why. Authenticated and tenant-bound the same way as {@link LedgerController}:
 * a merchant key reaching for another tenant is answered 404.
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
            ApiPrincipal principal,
            @RequestParam(name = "hours", defaultValue = "" + DEFAULT_WINDOW_HOURS) int hours) {
        principal.requireTenant(merchantId);
        return telemetry.statsFor(merchantId, hours);
    }
}
