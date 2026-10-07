using System.Diagnostics;
using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using SktopApp.Models;
using SktopApp.Services;

namespace SktopApp.Controllers;

public class HomeController : Controller
{
    private readonly ReferenceDataService _referenceDataService;

    public HomeController(ReferenceDataService referenceDataService)
    {
        _referenceDataService = referenceDataService;
    }

    public async Task<IActionResult> Index(string? view, CancellationToken cancellationToken)
    {
        var role = User.FindFirstValue(ClaimTypes.Role);
        var isAdmin = string.Equals(role, "Admin", StringComparison.OrdinalIgnoreCase);
        var isCustomer = string.Equals(role, "Customer", StringComparison.OrdinalIgnoreCase);

        // Block customers from admin portal URLs; send admins to admin dashboard when needed.
        if (User.Identity?.IsAuthenticated == true)
        {
            var requestedView = view ?? Request.Query["view"].ToString();
            var isAdminView = requestedView.StartsWith("admin", StringComparison.OrdinalIgnoreCase);

            if (isCustomer && isAdminView)
            {
                return RedirectToAction(nameof(Index));
            }

            if (isAdmin && !isAdminView)
            {
                return RedirectToAction(nameof(Index), new { view = "admin-dashboard" });
            }
        }

        if (_referenceDataService.IsConfigured && !isAdmin)
        {
            var products = await _referenceDataService.GetProductCatalogForClientAsync(null, null, cancellationToken);
            var json = JsonSerializer.Serialize(products);
            ViewData["InitialProductsJson"] = json;

            int? customerUserId = null;
            if (User.Identity?.IsAuthenticated == true && isCustomer)
            {
                var userIdString = User.FindFirstValue(ClaimTypes.NameIdentifier);
                if (int.TryParse(userIdString, out var parsedUserId))
                {
                    customerUserId = parsedUserId;
                }
            }

            var availableSegments = await _referenceDataService.GetAvailableSegmentsAsync(
                customerUserId,
                null,
                cancellationToken);
            ViewData["AvailableSegmentsJson"] = JsonSerializer.Serialize(availableSegments);
        }

        if (_referenceDataService.IsConfigured && isAdmin)
        {
            var adminBootstrap = await _referenceDataService.GetAdminTabDataForClientAsync(null, cancellationToken);
            ViewData["AdminBootstrapJson"] = JsonSerializer.Serialize(adminBootstrap);
        }

        var authJson = JsonSerializer.Serialize(new
        {
            isAuthenticated = User.Identity?.IsAuthenticated ?? false,
            email = User.Identity?.Name,
            role,
            userId = User.FindFirstValue(ClaimTypes.NameIdentifier),
        });
        ViewData["AuthJson"] = authJson;

        if (_referenceDataService.IsConfigured && User.Identity?.IsAuthenticated == true && isCustomer)
        {
            var userIdString = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (int.TryParse(userIdString, out var userId))
            {
                var userCategories = await _referenceDataService.GetCustomerCategoriesAsync(userId, cancellationToken);
                ViewData["UserCategoriesJson"] = JsonSerializer.Serialize(userCategories);

                var orders = await _referenceDataService.GetOrderHistoryAsync(userId, cancellationToken);
                var results = new List<object>();
                foreach (var order in orders)
                {
                    var items = await _referenceDataService.GetOrderItemsAsync(order.OrderId, cancellationToken);
                    results.Add(new
                    {
                        id = order.OrderNumber,
                        customer = User.Identity?.Name,
                        status = order.Status,
                        date = order.OrderDate.ToString("yyyy-MM-dd"),
                        items = items.Select(i => new
                        {
                            name = i.Name,
                            type = i.ProductType,
                            category = i.Category,
                            qty = i.Quantity,
                            minPrice = i.MinPrice,
                            maxPrice = i.MaxPrice,
                        })
                    });
                }

                ViewData["InitialOrdersJson"] = JsonSerializer.Serialize(results);
            }
        }

        return View();
    }

    [HttpGet]
    [ResponseCache(Duration = 0, Location = ResponseCacheLocation.None, NoStore = true)]
    public async Task<IActionResult> Catalog(CancellationToken cancellationToken)
    {
        if (!_referenceDataService.IsConfigured)
        {
            return Ok(Array.Empty<object>());
        }

        var products = await _referenceDataService.GetProductCatalogForClientAsync(null, null, cancellationToken);
        return Ok(products);
    }

    [HttpGet]
    [ResponseCache(Duration = 0, Location = ResponseCacheLocation.None, NoStore = true)]
    public async Task<IActionResult> AvailableSegments(string? productType, CancellationToken cancellationToken)
    {
        if (!_referenceDataService.IsConfigured)
        {
            return Ok(new { Product = Array.Empty<string>(), Gift = Array.Empty<string>() });
        }

        int? userId = null;
        var role = User.FindFirstValue(ClaimTypes.Role);
        var isCustomer = string.Equals(role, "Customer", StringComparison.OrdinalIgnoreCase);
        if (User.Identity?.IsAuthenticated == true && isCustomer)
        {
            var userIdString = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (int.TryParse(userIdString, out var parsedUserId))
            {
                userId = parsedUserId;
            }
        }

        var segments = await _referenceDataService.GetAvailableSegmentsAsync(userId, productType, cancellationToken);
        return Ok(segments);
    }

    [ResponseCache(Duration = 0, Location = ResponseCacheLocation.None, NoStore = true)]
    public IActionResult Error()
    {
        return View(new ErrorViewModel { RequestId = Activity.Current?.Id ?? HttpContext.TraceIdentifier });
    }
}
