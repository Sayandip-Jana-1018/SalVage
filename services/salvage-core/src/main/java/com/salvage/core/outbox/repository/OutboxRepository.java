package com.salvage.core.outbox.repository;

import com.salvage.core.outbox.model.OutboxRecord;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

@Repository
public interface OutboxRepository extends JpaRepository<OutboxRecord, UUID> {

    @Query(value = "SELECT * FROM salvage.outbox_events " +
                   "WHERE status = 'PENDING' " +
                   "ORDER BY created_at ASC " +
                   "LIMIT :limit " +
                   "FOR UPDATE SKIP LOCKED",
           nativeQuery = true)
    List<OutboxRecord> findPendingEventsForPublishing(@Param("limit") int limit);

    long countByStatus(com.salvage.core.outbox.model.OutboxStatus status);
}
