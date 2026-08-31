package com.salvage.core.api.auth;

import java.util.List;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.method.support.HandlerMethodArgumentResolver;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/** Registers the principal resolver so controllers can declare one. */
@Configuration
public class ApiAuthWebConfig implements WebMvcConfigurer {

    private final ApiPrincipalArgumentResolver resolver;

    public ApiAuthWebConfig(ApiPrincipalArgumentResolver resolver) {
        this.resolver = resolver;
    }

    @Override
    public void addArgumentResolvers(List<HandlerMethodArgumentResolver> resolvers) {
        resolvers.add(resolver);
    }
}
