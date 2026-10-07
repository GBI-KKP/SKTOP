using System.Security.Claims;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using SktopApp.Services;

namespace SktopApp.Middleware;

public sealed class SessionRoleValidationMiddleware
{
    private readonly RequestDelegate _next;

    public SessionRoleValidationMiddleware(RequestDelegate next)
    {
        _next = next;
    }

    public async Task InvokeAsync(HttpContext context, ReferenceDataService referenceDataService)
    {
        if (context.User.Identity?.IsAuthenticated == true
            && ShouldValidate(context)
            && referenceDataService.IsConfigured)
        {
            var userIdString = context.User.FindFirstValue(ClaimTypes.NameIdentifier);
            var sessionIdString = context.User.FindFirstValue("sessionId");
            var cookieRole = context.User.FindFirstValue(ClaimTypes.Role);

            if (!int.TryParse(userIdString, out var userId)
                || !Guid.TryParse(sessionIdString, out var sessionId))
            {
                await RejectAsync(context);
                return;
            }

            var validation = await referenceDataService.ValidateSessionAsync(
                userId,
                sessionId,
                context.RequestAborted);

            if (validation is null || !validation.IsValid)
            {
                await RejectAsync(context);
                return;
            }

            var validatedRole = validation.Role ?? string.Empty;
            var roleChanged = !string.Equals(cookieRole, validatedRole, StringComparison.OrdinalIgnoreCase);

            if (roleChanged)
            {
                await RefreshPrincipalAsync(context, userId, sessionId, validation);

                // Send the user to the portal that matches the new DB role.
                if (!IsApiRequest(context))
                {
                    RedirectToPortal(context, validatedRole);
                    return;
                }
            }

            if (!IsRoleAllowedForPath(context.Request.Path, validatedRole))
            {
                if (!IsApiRequest(context))
                {
                    RedirectToPortal(context, validatedRole);
                    return;
                }

                context.Response.StatusCode = StatusCodes.Status403Forbidden;
                await context.Response.WriteAsync("Access Denied");
                return;
            }

            context.Items["ValidatedRole"] = validatedRole;
        }

        await _next(context);
    }

    private static async Task RefreshPrincipalAsync(
        HttpContext context,
        int userId,
        Guid sessionId,
        ReferenceDataService.SessionValidationResult validation)
    {
        var email = validation.Email
            ?? context.User.FindFirstValue(ClaimTypes.Name)
            ?? context.User.Identity?.Name
            ?? string.Empty;

        var claims = new List<Claim>
        {
            new(ClaimTypes.NameIdentifier, userId.ToString()),
            new(ClaimTypes.Name, email),
            new(ClaimTypes.Role, validation.Role ?? string.Empty),
            new("sessionId", sessionId.ToString()),
        };

        var identity = new ClaimsIdentity(claims, CookieAuthenticationDefaults.AuthenticationScheme);
        var principal = new ClaimsPrincipal(identity);

        await context.SignInAsync(CookieAuthenticationDefaults.AuthenticationScheme, principal);
        context.User = principal;
    }

    private static void RedirectToPortal(HttpContext context, string role)
    {
        var pathBase = context.Request.PathBase.HasValue ? context.Request.PathBase.Value : string.Empty;
        var target = string.Equals(role, "Admin", StringComparison.OrdinalIgnoreCase)
            ? $"{pathBase}/?view=admin-dashboard"
            : $"{pathBase}/";

        context.Response.Redirect(target);
    }

    private static bool ShouldValidate(HttpContext context)
    {
        var path = context.Request.Path;

        if (path.StartsWithSegments("/Account/Login")
            || path.StartsWithSegments("/Account/Logout")
            || path.StartsWithSegments("/Account/AccessDenied"))
        {
            return false;
        }

        if (path.StartsWithSegments("/css")
            || path.StartsWithSegments("/js")
            || path.StartsWithSegments("/images")
            || path.StartsWithSegments("/lib")
            || path.StartsWithSegments("/favicon"))
        {
            return false;
        }

        return true;
    }

    private static bool IsRoleAllowedForPath(PathString path, string role)
    {
        var isAdmin = string.Equals(role, "Admin", StringComparison.OrdinalIgnoreCase);
        var isCustomer = string.Equals(role, "Customer", StringComparison.OrdinalIgnoreCase);

        if (path.StartsWithSegments("/Admin"))
        {
            return isAdmin;
        }

        if (path.StartsWithSegments("/Orders"))
        {
            return isCustomer;
        }

        return true;
    }

    private static async Task RejectAsync(HttpContext context)
    {
        await context.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);

        if (IsApiRequest(context))
        {
            context.Response.StatusCode = StatusCodes.Status401Unauthorized;
            await context.Response.WriteAsync("Session expired");
            return;
        }

        var pathBase = context.Request.PathBase.HasValue ? context.Request.PathBase.Value : string.Empty;
        var returnUrl = context.Request.Path + context.Request.QueryString;
        context.Response.Redirect($"{pathBase}/Account/Login?returnUrl={Uri.EscapeDataString(returnUrl)}");
    }

    private static bool IsApiRequest(HttpContext context)
    {
        var path = context.Request.Path;
        if (path.StartsWithSegments("/Admin") || path.StartsWithSegments("/Orders") || path.StartsWithSegments("/Home/Catalog"))
        {
            return true;
        }

        var accept = context.Request.Headers.Accept.ToString();
        return accept.Contains("application/json", StringComparison.OrdinalIgnoreCase);
    }
}
