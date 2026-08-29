package com.salvage.core.health;

/**
 * One infrastructure dependency that can be round-tripped.
 *
 * <p>Implementations do real I/O. A probe that inspects configuration rather
 * than touching the wire reports health it has not verified, which is worse
 * than no probe at all because it is trusted.
 */
public interface DependencyProbe {

    /** Stable identifier used as the key in the health response. */
    String name();

    /**
     * Performs a round trip. Returns normally if the dependency is reachable
     * and behaving; throws otherwise.
     */
    void probe() throws Exception;
}
