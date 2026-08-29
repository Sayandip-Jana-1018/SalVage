package com.salvage.core.health;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.Map;
import java.util.Objects;
import javax.sql.DataSource;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.connection.RedisConnection;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.kafka.core.KafkaAdmin;

class InfrastructureHealthControllerTest {

    private DataSource dataSource;
    private RedisConnectionFactory redisConnectionFactory;
    private KafkaAdmin kafkaAdmin;
    private InfrastructureHealthController controller;

    @BeforeEach
    void setUp() {
        dataSource = mock(DataSource.class);
        redisConnectionFactory = mock(RedisConnectionFactory.class);
        kafkaAdmin = mock(KafkaAdmin.class);
        controller = new InfrastructureHealthController(dataSource, redisConnectionFactory, kafkaAdmin, "localhost:19092");
    }

    @Test
    void liveness_returns_healthy_200() {
        ResponseEntity<Map<String, Object>> response = controller.liveness();
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        Map<String, Object> body = Objects.requireNonNull(response.getBody());
        assertThat(body.get("status")).isEqualTo("healthy");
    }

    @Test
    void readiness_returns_503_when_postgres_fails() throws SQLException {
        when(dataSource.getConnection()).thenThrow(new SQLException("Connection refused"));
        RedisConnection redisConn = mock(RedisConnection.class);
        when(redisConn.ping()).thenReturn("PONG");
        when(redisConnectionFactory.getConnection()).thenReturn(redisConn);
        when(kafkaAdmin.getConfigurationProperties()).thenReturn(Map.of());

        ResponseEntity<Map<String, Object>> response = controller.readiness();
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
        Map<String, Object> body = Objects.requireNonNull(response.getBody());
        assertThat(body.get("status")).isEqualTo("unhealthy");

        @SuppressWarnings("unchecked")
        Map<String, Map<String, Object>> checks =
                (Map<String, Map<String, Object>>) body.get("checks");
        assertThat(checks).isNotNull();
        assertThat(checks.get("postgres").get("status")).isEqualTo("down");
    }

    @Test
    void readiness_returns_503_when_redis_fails() throws SQLException {
        Connection sqlConn = mock(Connection.class);
        Statement stmt = mock(Statement.class);
        ResultSet rs = mock(ResultSet.class);
        when(dataSource.getConnection()).thenReturn(sqlConn);
        when(sqlConn.createStatement()).thenReturn(stmt);
        when(stmt.executeQuery("SELECT 1")).thenReturn(rs);
        when(rs.next()).thenReturn(true);

        when(redisConnectionFactory.getConnection()).thenThrow(new RuntimeException("Redis down"));
        when(kafkaAdmin.getConfigurationProperties()).thenReturn(Map.of());

        ResponseEntity<Map<String, Object>> response = controller.readiness();
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
        Map<String, Object> body = Objects.requireNonNull(response.getBody());
        assertThat(body.get("status")).isEqualTo("unhealthy");

        @SuppressWarnings("unchecked")
        Map<String, Map<String, Object>> checks =
                (Map<String, Map<String, Object>>) body.get("checks");
        assertThat(checks).isNotNull();
        assertThat(checks.get("redis").get("status")).isEqualTo("down");
    }
}
