package com.salvage.core.api.auth;

import org.springframework.core.MethodParameter;
import org.springframework.lang.NonNull;
import org.springframework.lang.Nullable;
import org.springframework.stereotype.Component;
import org.springframework.web.bind.support.WebDataBinderFactory;
import org.springframework.web.context.request.NativeWebRequest;
import org.springframework.web.context.request.RequestAttributes;
import org.springframework.web.method.support.HandlerMethodArgumentResolver;
import org.springframework.web.method.support.ModelAndViewContainer;

/**
 * Lets a controller declare {@code ApiPrincipal principal} and get the caller.
 *
 * <p>The alternative was a static helper reading a request attribute, which
 * works and reads badly: the entitlement check is the most important line in a
 * tenant-scoped handler and it should be visible in the signature. A controller
 * method that takes an {@link ApiPrincipal} is a method somebody has thought
 * about who is allowed to call it.
 *
 * <p>If the attribute is missing the resolver fails rather than substituting an
 * open principal. A missing attribute means the filter did not run, which means
 * either the path is exempt -- in which case no controller here should be
 * asking for a principal -- or the filter chain is misconfigured. Both are bugs,
 * and defaulting to "allow" would turn either into a silent one.
 */
@Component
public class ApiPrincipalArgumentResolver implements HandlerMethodArgumentResolver {

    @Override
    public boolean supportsParameter(@NonNull MethodParameter parameter) {
        return ApiPrincipal.class.equals(parameter.getParameterType());
    }

    @Override
    public Object resolveArgument(
            @NonNull MethodParameter parameter,
            @Nullable ModelAndViewContainer mavContainer,
            @NonNull NativeWebRequest webRequest,
            @Nullable WebDataBinderFactory binderFactory) {

        Object attribute =
                webRequest.getAttribute(
                        ApiKeyAuthFilter.PRINCIPAL_ATTRIBUTE, RequestAttributes.SCOPE_REQUEST);
        if (attribute instanceof ApiPrincipal principal) {
            return principal;
        }
        throw new IllegalStateException(
                "No API principal on this request. ApiKeyAuthFilter did not run for "
                        + webRequest.getDescription(false)
                        + ", so this handler cannot know who is calling. Refusing rather than "
                        + "assuming.");
    }
}
