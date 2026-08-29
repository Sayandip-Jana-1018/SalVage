package com.salvage.core.bounds.service;

import com.salvage.core.bounds.model.KillSwitch;
import com.salvage.core.bounds.model.KillSwitchScope;
import com.salvage.core.bounds.repository.KillSwitchRepository;
import java.util.List;
import java.util.Objects;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class KillSwitchService {

    private final KillSwitchRepository killSwitchRepository;

    public KillSwitchService(KillSwitchRepository killSwitchRepository) {
        this.killSwitchRepository = Objects.requireNonNull(killSwitchRepository, "killSwitchRepository must not be null");
    }

    /**
     * Returns true if any kill switch is tripped matching global, merchant, or rail scope.
     */
    @Transactional(readOnly = true)
    public boolean isTripped(String merchantId, String railId) {
        List<KillSwitch> activeSwitches = killSwitchRepository.findAllByActiveTrue();

        for (KillSwitch ks : activeSwitches) {
            if (ks.getScope() == KillSwitchScope.GLOBAL) {
                return true;
            }
            if (ks.getScope() == KillSwitchScope.MERCHANT && merchantId != null && merchantId.equals(ks.getMerchantId())) {
                return true;
            }
            if (ks.getScope() == KillSwitchScope.RAIL && railId != null && railId.equals(ks.getTargetId())) {
                return true;
            }
        }

        return false;
    }

    /**
     * Activates a global or scoped kill switch.
     */
    @Transactional
    public KillSwitch activateKillSwitch(String merchantId, KillSwitchScope scope, String targetId, String reason) {
        Objects.requireNonNull(scope, "scope must not be null");
        Objects.requireNonNull(reason, "reason must not be null");

        KillSwitch ks = new KillSwitch(merchantId, scope, targetId, true, reason);
        return killSwitchRepository.save(ks);
    }
}
