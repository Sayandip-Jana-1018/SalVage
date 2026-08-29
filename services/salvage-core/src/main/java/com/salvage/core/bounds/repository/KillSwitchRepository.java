package com.salvage.core.bounds.repository;

import com.salvage.core.bounds.model.KillSwitch;
import com.salvage.core.bounds.model.KillSwitchScope;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface KillSwitchRepository extends JpaRepository<KillSwitch, UUID> {

    List<KillSwitch> findAllByActiveTrue();

    List<KillSwitch> findAllByScopeAndActiveTrue(KillSwitchScope scope);
}
