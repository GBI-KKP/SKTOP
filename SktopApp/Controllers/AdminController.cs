using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;
using SktopApp.Services;

namespace SktopApp.Controllers;

[Authorize(Roles = "Admin")]
public class AdminController : Controller
{
    private readonly ReferenceDataService _referenceDataService;

    public AdminController(ReferenceDataService referenceDataService)
    {
        _referenceDataService = referenceDataService;
    }

    [HttpGet]
    public async Task<IActionResult> Bootstrap(string? tab, CancellationToken cancellationToken)
    {
        if (!User.IsInRole("Admin"))
        {
            return Forbid();
        }

        if (!_referenceDataService.IsConfigured)
        {
            return Ok(new
            {
                categories = Array.Empty<string>(),
                products = Array.Empty<object>(),
                customers = Array.Empty<object>(),
                orders = Array.Empty<object>()
            });
        }

        var bootstrap = await _referenceDataService.GetAdminTabDataForClientAsync(tab, cancellationToken);
        return Ok(bootstrap);
    }

    [HttpGet]
    public async Task<IActionResult> Product(int id, CancellationToken cancellationToken)
    {
        if (!User.IsInRole("Admin"))
        {
            return Forbid();
        }

        if (id <= 0)
        {
            return BadRequest(new { error = "Product id is required." });
        }

        if (!_referenceDataService.IsConfigured)
        {
            return NotFound();
        }

        var product = await _referenceDataService.GetProductForClientAsync(id, cancellationToken);
        if (product is null)
        {
            return NotFound();
        }

        return Ok(product);
    }

    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> AddCategory([FromBody] NameRequest? request, CancellationToken cancellationToken)
    {
        if (!User.IsInRole("Admin"))
        {
            return Forbid();
        }

        if (string.IsNullOrWhiteSpace(request?.Name))
        {
            return BadRequest(new { error = "Category name is required." });
        }

        if (!_referenceDataService.IsConfigured)
        {
            return BadRequest(new { error = "Database is not configured." });
        }

        await _referenceDataService.AddCategoryAsync(request.Name.Trim(), cancellationToken);
        return Ok();
    }

    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> DeleteCategory([FromBody] NameRequest? request, CancellationToken cancellationToken)
    {
        if (!User.IsInRole("Admin"))
        {
            return Forbid();
        }

        if (string.IsNullOrWhiteSpace(request?.Name))
        {
            return BadRequest(new { error = "Category name is required." });
        }

        if (!_referenceDataService.IsConfigured)
        {
            return BadRequest(new { error = "Database is not configured." });
        }

        await _referenceDataService.DeleteCategoryAsync(request.Name.Trim(), cancellationToken);
        return Ok();
    }

    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> CreateProduct([FromBody] ProductRequest? request, CancellationToken cancellationToken)
    {
        if (!User.IsInRole("Admin"))
        {
            return Forbid();
        }

        if (request is null ||
            string.IsNullOrWhiteSpace(request.Name) ||
            string.IsNullOrWhiteSpace(request.Type) ||
            string.IsNullOrWhiteSpace(request.Category))
        {
            return BadRequest(new { error = "Product type, category, and name are required." });
        }

        if (request.MinPrice <= 0 || request.MaxPrice <= 0 || request.MaxPrice < request.MinPrice)
        {
            return BadRequest(new { error = "Min Price and Max Price are required, and Max Price must be greater than or equal to Min Price." });
        }

        if (request.QtyControl && request.Qty <= 0)
        {
            return BadRequest(new { error = "Qty is required when Qty Control is Yes." });
        }

        if (!_referenceDataService.IsConfigured)
        {
            return BadRequest(new { error = "Database is not configured." });
        }

        var qty = request.QtyControl ? request.Qty : 0;

        var createdId = await _referenceDataService.CreateProductAsync(
            request.Type,
            request.Name,
            request.Desc,
            request.MinPrice,
            request.MaxPrice,
            qty,
            request.QtyControl,
            request.Category,
            request.IsActive,
            request.Images,
            cancellationToken);

        if (createdId is null)
        {
            return BadRequest(new { error = "Unable to create product." });
        }

        return Ok(new { id = createdId });
    }

    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> UpdateProduct([FromBody] UpdateProductRequest? request, CancellationToken cancellationToken)
    {
        if (!User.IsInRole("Admin"))
        {
            return Forbid();
        }

        if (request is null ||
            request.Id <= 0 ||
            string.IsNullOrWhiteSpace(request.Name) ||
            string.IsNullOrWhiteSpace(request.Type) ||
            string.IsNullOrWhiteSpace(request.Category))
        {
            return BadRequest(new { error = "Product id, type, category, and name are required." });
        }

        if (request.MinPrice <= 0 || request.MaxPrice <= 0 || request.MaxPrice < request.MinPrice)
        {
            return BadRequest(new { error = "Min Price and Max Price are required, and Max Price must be greater than or equal to Min Price." });
        }

        if (request.QtyControl && request.Qty <= 0)
        {
            return BadRequest(new { error = "Qty is required when Qty Control is Yes." });
        }

        if (!_referenceDataService.IsConfigured)
        {
            return BadRequest(new { error = "Database is not configured." });
        }

        var qty = request.QtyControl ? request.Qty : 0;

        await _referenceDataService.UpdateProductAsync(
            request.Id,
            request.Type,
            request.Name,
            request.Desc,
            request.MinPrice,
            request.MaxPrice,
            qty,
            request.QtyControl,
            request.Category,
            request.IsActive,
            request.Images,
            cancellationToken);

        return Ok();
    }

    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> DeleteProduct([FromBody] IdRequest? request, CancellationToken cancellationToken)
    {
        if (!User.IsInRole("Admin"))
        {
            return Forbid();
        }

        if (request is null || request.Id <= 0)
        {
            return BadRequest(new { error = "Product id is required." });
        }

        if (!_referenceDataService.IsConfigured)
        {
            return BadRequest(new { error = "Database is not configured." });
        }

        try
        {
            await _referenceDataService.DeleteProductAsync(request.Id, cancellationToken);
            return Ok();
        }
        catch (SqlException ex) when (ex.Message.Contains("Cannot delete", StringComparison.OrdinalIgnoreCase))
        {
            return Conflict(new { error = ex.Message });
        }
    }

    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> CreateCustomer([FromBody] CustomerRequest? request, CancellationToken cancellationToken)
    {
        if (!User.IsInRole("Admin"))
        {
            return Forbid();
        }

        if (request is null ||
            string.IsNullOrWhiteSpace(request.Company) ||
            string.IsNullOrWhiteSpace(request.Email) ||
            string.IsNullOrWhiteSpace(request.Password))
        {
            return BadRequest(new { error = "Company, email and password are required." });
        }

        if (request.Category is null || request.Category.Count == 0)
        {
            return BadRequest(new { error = "At least one segment is required." });
        }

        if (!_referenceDataService.IsConfigured)
        {
            return BadRequest(new { error = "Database is not configured." });
        }

        var categoriesJson = JsonSerializer.Serialize(request.Category ?? Array.Empty<string>());
        var isActive = request.IsActive ?? true;

        var createdId = await _referenceDataService.CreateCustomerAsync(
            request.Company,
            request.Email,
            request.Password,
            isActive,
            categoriesJson,
            request.PersonInCharge,
            request.ContactNo,
            request.Address,
            request.CompanyRegNo,
            request.EInvoiceNo,
            cancellationToken);

        if (createdId is null)
        {
            return BadRequest(new { error = "Unable to create customer." });
        }

        return Ok(new { id = createdId });
    }

    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> UpdateCustomer([FromBody] UpdateCustomerRequest? request, CancellationToken cancellationToken)
    {
        if (!User.IsInRole("Admin"))
        {
            return Forbid();
        }

        if (request is null ||
            request.Id <= 0 ||
            string.IsNullOrWhiteSpace(request.Company) ||
            string.IsNullOrWhiteSpace(request.Email))
        {
            return BadRequest(new { error = "Customer id, company and email are required." });
        }

        if (!_referenceDataService.IsConfigured)
        {
            return BadRequest(new { error = "Database is not configured." });
        }

        if (request.Category is null || request.Category.Count == 0)
        {
            return BadRequest(new { error = "At least one segment is required." });
        }

        var categoriesJson = JsonSerializer.Serialize(request.Category ?? Array.Empty<string>());

        await _referenceDataService.UpdateCustomerAsync(
            request.Id,
            request.Company,
            request.Email,
            request.Password,
            request.IsActive,
            categoriesJson,
            request.PersonInCharge,
            request.ContactNo,
            request.Address,
            request.CompanyRegNo,
            request.EInvoiceNo,
            cancellationToken);

        return Ok();
    }

    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> DeleteCustomer([FromBody] IdRequest? request, CancellationToken cancellationToken)
    {
        if (!User.IsInRole("Admin"))
        {
            return Forbid();
        }

        if (request is null || request.Id <= 0)
        {
            return BadRequest(new { error = "Customer id is required." });
        }

        if (!_referenceDataService.IsConfigured)
        {
            return BadRequest(new { error = "Database is not configured." });
        }

        try
        {
            await _referenceDataService.DeleteCustomerAsync(request.Id, cancellationToken);
            return Ok();
        }
        catch (SqlException ex) when (ex.Message.Contains("Cannot delete", StringComparison.OrdinalIgnoreCase))
        {
            return Conflict(new { error = ex.Message });
        }
    }

    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> UpdateOrderStatus([FromBody] UpdateOrderStatusRequest? request, CancellationToken cancellationToken)
    {
        if (!User.IsInRole("Admin"))
        {
            return Forbid();
        }

        if (request is null || string.IsNullOrWhiteSpace(request.OrderId) || string.IsNullOrWhiteSpace(request.Status))
        {
            return BadRequest(new { error = "Order id and status are required." });
        }

        if (!_referenceDataService.IsConfigured)
        {
            return BadRequest(new { error = "Database is not configured." });
        }

        await _referenceDataService.UpdateOrderStatusAsync(request.OrderId, request.Status, cancellationToken);
        return Ok();
    }

    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> UpdateOrderItemQty([FromBody] UpdateOrderItemQtyRequest? request, CancellationToken cancellationToken)
    {
        if (!User.IsInRole("Admin"))
        {
            return Forbid();
        }

        if (request is null || string.IsNullOrWhiteSpace(request.OrderId) || string.IsNullOrWhiteSpace(request.ItemName) || request.Qty <= 0)
        {
            return BadRequest(new { error = "Order id, item name and qty are required." });
        }

        if (!_referenceDataService.IsConfigured)
        {
            return BadRequest(new { error = "Database is not configured." });
        }

        await _referenceDataService.UpdateOrderItemQtyAsync(request.OrderId, request.ItemName, request.Qty, cancellationToken);
        return Ok();
    }

    public sealed record NameRequest(string Name);

    public sealed record IdRequest(int Id);

    public sealed record ProductRequest(
        string Type,
        string Name,
        string? Desc,
        decimal MinPrice,
        decimal MaxPrice,
        int Qty,
        bool QtyControl,
        string Category,
        bool IsActive,
        IReadOnlyList<string>? Images);

    public sealed record UpdateProductRequest(
        int Id,
        string Type,
        string Name,
        string? Desc,
        decimal MinPrice,
        decimal MaxPrice,
        int Qty,
        bool QtyControl,
        string Category,
        bool IsActive,
        IReadOnlyList<string>? Images);

    public sealed record CustomerRequest(
        string Company,
        string Email,
        string Password,
        bool? IsActive,
        IReadOnlyList<string>? Category,
        string? PersonInCharge,
        string? ContactNo,
        string? Address,
        string? CompanyRegNo,
        string? EInvoiceNo);

    public sealed record UpdateCustomerRequest(
        int Id,
        string Company,
        string Email,
        string? Password,
        bool? IsActive,
        IReadOnlyList<string>? Category,
        string? PersonInCharge,
        string? ContactNo,
        string? Address,
        string? CompanyRegNo,
        string? EInvoiceNo);

    public sealed record UpdateOrderStatusRequest(string OrderId, string Status);

    public sealed record UpdateOrderItemQtyRequest(string OrderId, string ItemName, int Qty);
}
