using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;
using SktopApp.Services;

namespace SktopApp.Controllers;

[Authorize(Roles = "Customer")]
public class OrdersController : Controller
{
    private readonly ReferenceDataService _referenceDataService;

    public OrdersController(ReferenceDataService referenceDataService)
    {
        _referenceDataService = referenceDataService;
    }

    [HttpGet]
    public async Task<IActionResult> My(CancellationToken cancellationToken)
    {
        if (!_referenceDataService.IsConfigured)
        {
            return Ok(Array.Empty<object>());
        }

        var userIdString = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (!int.TryParse(userIdString, out var userId))
        {
            return Unauthorized();
        }

        var email = User.Identity?.Name;

        var orders = await _referenceDataService.GetOrderHistoryAsync(userId, cancellationToken);
        var results = new List<object>();

        foreach (var order in orders)
        {
            var items = await _referenceDataService.GetOrderItemsAsync(order.OrderId, cancellationToken);
            results.Add(new
            {
                id = order.OrderNumber,
                customer = email,
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

        return Ok(results);
    }

    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> Create([FromBody] CreateOrderRequest? request, CancellationToken cancellationToken)
    {
        if (request?.Items is null || request.Items.Count == 0)
        {
            return BadRequest(new { error = "Order must contain at least one item." });
        }

        if (!_referenceDataService.IsConfigured)
        {
            return BadRequest(new { error = "Database is not configured." });
        }

        var userIdString = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (!int.TryParse(userIdString, out var userId))
        {
            return Unauthorized();
        }

        var itemsJson = JsonSerializer.Serialize(request.Items.Select(i => new
        {
            name = i.Name,
            type = i.Type,
            category = i.Category,
            qty = i.Qty,
            minPrice = i.MinPrice,
            maxPrice = i.MaxPrice
        }));

        ReferenceDataService.CreateOrderResult? created;
        try
        {
            created = await _referenceDataService.CreateOrderAsync(userId, itemsJson, cancellationToken);
        }
        catch (SqlException ex) when (ex.Message.Contains("Cannot create order", StringComparison.OrdinalIgnoreCase))
        {
            return Conflict(new { error = ex.Message });
        }

        if (created is null)
        {
            return BadRequest(new { error = "Unable to create order." });
        }

        return Ok(new
        {
            orderId = created.OrderId,
            orderNumber = created.OrderNumber
        });
    }

    public sealed record CreateOrderRequest
    {
        public IReadOnlyList<CreateOrderItem> Items { get; init; } = Array.Empty<CreateOrderItem>();
    }

    public sealed record CreateOrderItem(
        string Name,
        string Type,
        string? Category,
        int Qty,
        decimal MinPrice,
        decimal MaxPrice);
}
