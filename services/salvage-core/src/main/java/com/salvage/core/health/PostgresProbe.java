package com.salvage.core.health;

import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.Statement;
import javax.sql.DataSource;

import org.springframework.stereotype.Component;

/** Round-trips a trivial query through the connection pool. */
@Component
public class PostgresProbe implements DependencyProbe {

    private final DataSource dataSource;

    public PostgresProbe(DataSource dataSource) {
        this.dataSource = dataSource;
    }

    @Override
    public String name() {
        return "postgres";
    }

    @Override
    public void probe() throws Exception {
        try (Connection conn = dataSource.getConnection();
             Statement stmt = conn.createStatement();
             ResultSet rs = stmt.executeQuery("SELECT 1")) {
            if (!rs.next()) {
                throw new IllegalStateException("SELECT 1 returned no rows");
            }
        }
    }
}
