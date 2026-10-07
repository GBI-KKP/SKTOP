using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using SktopApp.Services;

namespace SktopApp.Controllers;

public class AccountController : Controller
{
    private readonly ReferenceDataService _referenceDataService;

    public AccountController(ReferenceDataService referenceDataService)
    {
        _referenceDataService = referenceDataService;
    }

    [HttpGet]
    public IActionResult Login()
    {
        if (User.Identity?.IsAuthenticated == true)
        {
            return RedirectForRole(User.FindFirstValue(ClaimTypes.Role));
        }

        ViewData["AuthJson"] = BuildAuthJson();
        return View();
    }

    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> Login(string email, string password, CancellationToken cancellationToken)
    {
        ViewData["AuthJson"] = BuildAuthJson();

        if (string.IsNullOrWhiteSpace(email) || string.IsNullOrWhiteSpace(password))
        {
            ViewData["Error"] = "Email and password are required.";
            return View();
        }

        var result = await _referenceDataService.LoginAsync(email, password, cancellationToken);
        if (result is null)
        {
            ViewData["Error"] = _referenceDataService.IsConfigured
                ? "Invalid email or password."
                : "Database is not configured.";
            return View();
        }

        await SignInUser(result);
        return RedirectForRole(result.Role);
    }

    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> Logout(CancellationToken cancellationToken)
    {
        var userIdString = User.FindFirstValue(ClaimTypes.NameIdentifier);
        var sessionIdString = User.FindFirstValue("sessionId");

        if (int.TryParse(userIdString, out var userId))
        {
            Guid? sessionId = null;
            if (Guid.TryParse(sessionIdString, out var parsedSessionId))
            {
                sessionId = parsedSessionId;
            }

            await _referenceDataService.LogoutAsync(userId, sessionId, cancellationToken);
        }

        await HttpContext.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
        return RedirectToAction("Index", "Home");
    }

    [HttpGet]
    public IActionResult AccessDenied(string? returnUrl = null)
    {
        return StatusCode(StatusCodes.Status403Forbidden, "Access Denied");
    }

    private IActionResult RedirectForRole(string? role)
    {
        if (string.Equals(role, "Admin", StringComparison.OrdinalIgnoreCase))
        {
            return RedirectToAction("Index", "Home", new { view = "admin-dashboard" });
        }

        return RedirectToAction("Index", "Home");
    }

    private async Task SignInUser(ReferenceDataService.LoginResult result)
    {
        var claims = new List<Claim>
        {
            new(ClaimTypes.NameIdentifier, result.UserId.ToString()),
            new(ClaimTypes.Name, result.Email),
            new(ClaimTypes.Role, result.Role),
            new("sessionId", result.SessionId.ToString()),
        };

        var identity = new ClaimsIdentity(claims, CookieAuthenticationDefaults.AuthenticationScheme);
        var principal = new ClaimsPrincipal(identity);

        await HttpContext.SignInAsync(CookieAuthenticationDefaults.AuthenticationScheme, principal);
    }

    private string BuildAuthJson()
    {
        return JsonSerializer.Serialize(new
        {
            isAuthenticated = User.Identity?.IsAuthenticated ?? false,
            email = User.Identity?.Name,
            role = User.FindFirstValue(ClaimTypes.Role),
            userId = User.FindFirstValue(ClaimTypes.NameIdentifier),
        });
    }
}
