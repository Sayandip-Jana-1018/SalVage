package com.salvage.core.bounds.service;

import com.salvage.core.bounds.model.ContactBudget;
import com.salvage.core.bounds.repository.ContactBudgetRepository;
import java.time.Duration;
import java.time.Instant;
import java.util.Objects;
import java.util.Optional;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ContactBudgetService {

    public static final int DEFAULT_MAX_ALLOWANCE = 2;
    public static final Duration BUDGET_WINDOW = Duration.ofHours(24);

    private final ContactBudgetRepository contactBudgetRepository;

    public ContactBudgetService(ContactBudgetRepository contactBudgetRepository) {
        this.contactBudgetRepository = Objects.requireNonNull(contactBudgetRepository, "contactBudgetRepository must not be null");
    }

    /**
     * Checks if a customer has remaining contact budget within their active rolling 24-hour window.
     */
    @Transactional(readOnly = true)
    public boolean hasRemainingBudget(String merchantId, String customerId, Instant now) {
        if (customerId == null || customerId.isBlank()) {
            return true;
        }
        Objects.requireNonNull(merchantId, "merchantId must not be null");
        Objects.requireNonNull(now, "now must not be null");

        Optional<ContactBudget> budgetOpt = contactBudgetRepository.findActiveBudget(merchantId, customerId, now);
        if (budgetOpt.isEmpty()) {
            return true;
        }
        return budgetOpt.get().hasRemainingAllowance();
    }

    /**
     * Consumes 1 unit of contact allowance for the customer.
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public ContactBudget consumeBudget(String merchantId, String customerId, Instant now) {
        Objects.requireNonNull(merchantId, "merchantId must not be null");
        Objects.requireNonNull(customerId, "customerId must not be null");
        Objects.requireNonNull(now, "now must not be null");

        Optional<ContactBudget> budgetOpt = contactBudgetRepository.findActiveBudget(merchantId, customerId, now);

        ContactBudget budget;
        if (budgetOpt.isPresent()) {
            budget = budgetOpt.get();
            budget.incrementConsumed();
        } else {
            budget = new ContactBudget(
                    merchantId,
                    customerId,
                    now,
                    now.plus(BUDGET_WINDOW),
                    DEFAULT_MAX_ALLOWANCE,
                    1,
                    now,
                    now);
        }

        return contactBudgetRepository.save(budget);
    }
}
