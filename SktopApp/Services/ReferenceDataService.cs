using System.Text.Json;
using Microsoft.Data.SqlClient;

namespace SktopApp.Services;

public class ReferenceDataService
{
    private readonly string? _connectionString;

    public ReferenceDataService(IConfiguration configuration)
    {
        _connectionString =
            Environment.GetEnvironmentVariable("SKTOP_CONNECTIONSTRING")
            ?? configuration.GetConnectionString("DefaultConnection");
    }

    public bool IsConfigured => !string.IsNullOrWhiteSpace(_connectionString);

    public async Task<IReadOnlyList<object>> GetProductCatalogForClientAsync(
        string? category,
        string? productType,
        CancellationToken cancellationToken,
        int? maxImages = null,
        int? productId = null)
    {
        var rows = await GetProductCatalogAsync(category, productType, cancellationToken, maxImages, productId);

        return rows
            .Select(p => new
            {
                id = p.ProductId,
                type = p.ProductType,
                name = p.Name,
                desc = p.Description,
                minPrice = p.MinPrice,
                maxPrice = p.MaxPrice,
                qty = p.Quantity,
                qtyControl = p.QtyControl,
                category = p.Category,
                images = p.Images,
                isActive = p.IsActive,
            })
            .Cast<object>()
            .ToList();
    }

    public async Task<object?> GetProductForClientAsync(int productId, CancellationToken cancellationToken)
    {
        var rows = await GetProductCatalogForClientAsync(null, null, cancellationToken, maxImages: null, productId: productId);
        return rows.FirstOrDefault();
    }

    public async Task<LoginResult?> LoginAsync(string email, string password, CancellationToken cancellationToken)
    {
        if (!IsConfigured)
        {
            return null;
        }

        var json = JsonSerializer.Serialize(new { Email = email, Password = password });

        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync(cancellationToken);

        await using var cmd = new SqlCommand("sp_UserLogin", conn)
        {
            CommandType = System.Data.CommandType.StoredProcedure
        };
        cmd.Parameters.AddWithValue("@json", json);

        await using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
        {
            return null;
        }

        if (reader.IsDBNull(reader.GetOrdinal("UserId")))
        {
            return null;
        }

        var userId = reader.GetInt32(reader.GetOrdinal("UserId"));
        var role = reader.GetString(reader.GetOrdinal("Role"));
        var sessionId = reader.GetGuid(reader.GetOrdinal("SessionId"));

        return new LoginResult(userId, email, role, sessionId);
    }

    public async Task<bool> LogoutAsync(int userId, Guid? sessionId, CancellationToken cancellationToken)
    {
        if (!IsConfigured)
        {
            return false;
        }

        var json = JsonSerializer.Serialize(new { UserId = userId, SessionId = sessionId });

        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync(cancellationToken);

        await using var cmd = new SqlCommand("sp_UserLogout", conn)
        {
            CommandType = System.Data.CommandType.StoredProcedure
        };
        cmd.Parameters.AddWithValue("@json", json);

        await cmd.ExecuteNonQueryAsync(cancellationToken);
        return true;
    }

    public async Task<SessionValidationResult?> ValidateSessionAsync(
        int userId,
        Guid sessionId,
        CancellationToken cancellationToken)
    {
        if (!IsConfigured)
        {
            return null;
        }

        var json = JsonSerializer.Serialize(new { UserId = userId, SessionId = sessionId });

        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync(cancellationToken);

        await using var cmd = new SqlCommand("sp_UserValidateSession", conn)
        {
            CommandType = System.Data.CommandType.StoredProcedure
        };
        cmd.Parameters.AddWithValue("@json", json);

        await using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
        {
            return new SessionValidationResult(false, null, null);
        }

        var isValid = !reader.IsDBNull(reader.GetOrdinal("IsValid")) && reader.GetBoolean(reader.GetOrdinal("IsValid"));
        if (!isValid)
        {
            return new SessionValidationResult(false, null, null);
        }

        var role = reader.IsDBNull(reader.GetOrdinal("Role")) ? null : reader.GetString(reader.GetOrdinal("Role"));
        var email = reader.IsDBNull(reader.GetOrdinal("Email")) ? null : reader.GetString(reader.GetOrdinal("Email"));
        return new SessionValidationResult(true, role, email);
    }

    public async Task<IReadOnlyList<OrderHeader>> GetOrderHistoryAsync(int userId, CancellationToken cancellationToken)
    {
        if (!IsConfigured)
        {
            return Array.Empty<OrderHeader>();
        }

        var json = JsonSerializer.Serialize(new { UserId = userId });

        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync(cancellationToken);

        await using var cmd = new SqlCommand("sp_GetOrderHistory", conn)
        {
            CommandType = System.Data.CommandType.StoredProcedure
        };
        cmd.Parameters.AddWithValue("@json", json);

        var results = new List<OrderHeader>();
        await using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            var orderId = reader.GetInt32(reader.GetOrdinal("OrderId"));
            var orderNumber = reader.GetString(reader.GetOrdinal("OrderNumber"));
            var status = reader.GetString(reader.GetOrdinal("Status"));
            var orderDate = DateOnly.FromDateTime(reader.GetDateTime(reader.GetOrdinal("OrderDate")));
            var createdAt = reader.GetDateTime(reader.GetOrdinal("CreatedAt"));

            results.Add(new OrderHeader(orderId, orderNumber, status, orderDate, createdAt));
        }

        return results;
    }

    public async Task<IReadOnlyList<OrderItemRow>> GetOrderItemsAsync(int orderId, CancellationToken cancellationToken)
    {
        if (!IsConfigured)
        {
            return Array.Empty<OrderItemRow>();
        }

        var json = JsonSerializer.Serialize(new { OrderId = orderId });

        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync(cancellationToken);

        await using var cmd = new SqlCommand("sp_GetOrderItems", conn)
        {
            CommandType = System.Data.CommandType.StoredProcedure
        };
        cmd.Parameters.AddWithValue("@json", json);

        var results = new List<OrderItemRow>();
        await using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            var orderItemId = reader.GetInt32(reader.GetOrdinal("OrderItemId"));
            var name = reader.GetString(reader.GetOrdinal("Name"));
            var productType = reader.GetString(reader.GetOrdinal("ProductType"));
            var category = reader.IsDBNull(reader.GetOrdinal("Category"))
                ? null
                : reader.GetString(reader.GetOrdinal("Category"));
            var quantity = reader.GetInt32(reader.GetOrdinal("Quantity"));
            var minPrice = reader.GetDecimal(reader.GetOrdinal("MinPrice"));
            var maxPrice = reader.GetDecimal(reader.GetOrdinal("MaxPrice"));

            results.Add(new OrderItemRow(orderItemId, orderId, name, productType, category, quantity, minPrice, maxPrice));
        }

        return results;
    }

    public async Task<CreateOrderResult?> CreateOrderAsync(int userId, string itemsJson, CancellationToken cancellationToken)
    {
        if (!IsConfigured)
        {
            return null;
        }

        using var itemsDoc = JsonDocument.Parse(string.IsNullOrWhiteSpace(itemsJson) ? "[]" : itemsJson);
        var json = JsonSerializer.Serialize(new { UserId = userId, Items = itemsDoc.RootElement });

        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync(cancellationToken);

        await using var cmd = new SqlCommand("sp_CreateOrder", conn)
        {
            CommandType = System.Data.CommandType.StoredProcedure
        };
        cmd.Parameters.AddWithValue("@json", json);

        await using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
        {
            return null;
        }

        var orderId = reader.GetInt32(reader.GetOrdinal("OrderId"));
        var orderNumber = reader.GetString(reader.GetOrdinal("OrderNumber"));

        return new CreateOrderResult(orderId, orderNumber);
    }

    public async Task<IReadOnlyList<string>> GetCategoriesAsync(CancellationToken cancellationToken)
    {
        if (!IsConfigured)
        {
            return Array.Empty<string>();
        }

        const string json = "{}";

        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync(cancellationToken);

        await using var cmd = new SqlCommand("sp_GetCategories", conn)
        {
            CommandType = System.Data.CommandType.StoredProcedure
        };
        cmd.Parameters.AddWithValue("@json", json);

        var results = new List<string>();
        await using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            results.Add(reader.GetString(reader.GetOrdinal("Name")));
        }

        return results;
    }

    public async Task<bool> AddCategoryAsync(string name, CancellationToken cancellationToken)
    {
        if (!IsConfigured)
        {
            return false;
        }

        var json = JsonSerializer.Serialize(new { Name = name });

        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync(cancellationToken);

        await using var cmd = new SqlCommand("sp_AddCategory", conn)
        {
            CommandType = System.Data.CommandType.StoredProcedure
        };
        cmd.Parameters.AddWithValue("@json", json);

        await cmd.ExecuteNonQueryAsync(cancellationToken);
        return true;
    }

    public async Task<bool> DeleteCategoryAsync(string name, CancellationToken cancellationToken)
    {
        if (!IsConfigured)
        {
            return false;
        }

        var json = JsonSerializer.Serialize(new { Name = name });

        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync(cancellationToken);

        await using var cmd = new SqlCommand("sp_DeleteCategory", conn)
        {
            CommandType = System.Data.CommandType.StoredProcedure
        };
        cmd.Parameters.AddWithValue("@json", json);

        await cmd.ExecuteNonQueryAsync(cancellationToken);
        return true;
    }

    public async Task<IReadOnlyList<CustomerRow>> GetCustomersAsync(CancellationToken cancellationToken)
    {
        if (!IsConfigured)
        {
            return Array.Empty<CustomerRow>();
        }

        const string json = "{}";

        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync(cancellationToken);

        await using var cmd = new SqlCommand("sp_GetCustomers", conn)
        {
            CommandType = System.Data.CommandType.StoredProcedure
        };
        cmd.Parameters.AddWithValue("@json", json);

        var results = new List<CustomerRow>();
        await using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            var userId = reader.GetInt32(reader.GetOrdinal("UserId"));
            var email = reader.GetString(reader.GetOrdinal("Email"));
            var companyName = reader.IsDBNull(reader.GetOrdinal("CompanyName"))
                ? null
                : reader.GetString(reader.GetOrdinal("CompanyName"));
            var password = "";
            var isActive = reader.GetBoolean(reader.GetOrdinal("IsActive"));
            var personInCharge = ReadNullableString(reader, "PersonInCharge");
            var contactNo = ReadNullableString(reader, "ContactNo");
            var address = ReadNullableString(reader, "Address");
            var companyRegNo = ReadNullableString(reader, "CompanyRegNo");
            var eInvoiceNo = ReadNullableString(reader, "EInvoiceNo");

            results.Add(new CustomerRow(
                userId,
                email,
                companyName,
                password,
                isActive,
                personInCharge,
                contactNo,
                address,
                companyRegNo,
                eInvoiceNo));
        }

        return results;
    }

    private static string? ReadNullableString(SqlDataReader reader, string columnName)
    {
        var ordinal = TryGetOrdinal(reader, columnName);
        if (ordinal < 0 || reader.IsDBNull(ordinal))
        {
            return null;
        }

        return reader.GetString(ordinal);
    }

    public async Task<IReadOnlyList<string>> GetCustomerCategoriesAsync(int userId, CancellationToken cancellationToken)
    {
        if (!IsConfigured)
        {
            return Array.Empty<string>();
        }

        var json = JsonSerializer.Serialize(new { UserId = userId });

        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync(cancellationToken);

        await using var cmd = new SqlCommand("sp_GetCustomerCategories", conn)
        {
            CommandType = System.Data.CommandType.StoredProcedure
        };
        cmd.Parameters.AddWithValue("@json", json);

        var results = new List<string>();
        await using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            results.Add(reader.GetString(reader.GetOrdinal("Name")));
        }

        return results;
    }

    /// <summary>
    /// Available catalog segments (Categories) from active Products, grouped by ProductType.
    /// When <paramref name="userId"/> is set, only segments assigned to that customer are returned.
    /// </summary>
    public async Task<IReadOnlyDictionary<string, IReadOnlyList<string>>> GetAvailableSegmentsAsync(
        int? userId,
        string? productType,
        CancellationToken cancellationToken)
    {
        var empty = new Dictionary<string, IReadOnlyList<string>>(StringComparer.OrdinalIgnoreCase)
        {
            ["Product"] = Array.Empty<string>(),
            ["Gift"] = Array.Empty<string>(),
        };

        if (!IsConfigured)
        {
            return empty;
        }

        var json = JsonSerializer.Serialize(new
        {
            UserId = userId,
            ProductType = string.IsNullOrWhiteSpace(productType) ? null : productType.Trim(),
        });

        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync(cancellationToken);

        await using var cmd = new SqlCommand("sp_GetAvailableSegments", conn)
        {
            CommandType = System.Data.CommandType.StoredProcedure
        };
        cmd.Parameters.AddWithValue("@json", json);

        var grouped = new Dictionary<string, List<string>>(StringComparer.OrdinalIgnoreCase)
        {
            ["Product"] = new List<string>(),
            ["Gift"] = new List<string>(),
        };

        await using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            var type = reader.GetString(reader.GetOrdinal("ProductType"));
            var name = reader.GetString(reader.GetOrdinal("Name"));
            if (!grouped.TryGetValue(type, out var list))
            {
                list = new List<string>();
                grouped[type] = list;
            }

            if (!list.Contains(name, StringComparer.OrdinalIgnoreCase))
            {
                list.Add(name);
            }
        }

        return grouped.ToDictionary(
            kvp => kvp.Key,
            kvp => (IReadOnlyList<string>)kvp.Value,
            StringComparer.OrdinalIgnoreCase);
    }

    public async Task<int?> CreateCustomerAsync(
        string companyName,
        string email,
        string password,
        bool isActive,
        string categoriesJson,
        string? personInCharge,
        string? contactNo,
        string? address,
        string? companyRegNo,
        string? eInvoiceNo,
        CancellationToken cancellationToken)
    {
        if (!IsConfigured)
        {
            return null;
        }

        using var categoriesDoc = JsonDocument.Parse(string.IsNullOrWhiteSpace(categoriesJson) ? "[]" : categoriesJson);
        var json = JsonSerializer.Serialize(new
        {
            CompanyName = companyName,
            Email = email,
            Password = password,
            IsActive = isActive,
            PersonInCharge = personInCharge,
            ContactNo = contactNo,
            Address = address,
            CompanyRegNo = companyRegNo,
            EInvoiceNo = eInvoiceNo,
            Categories = categoriesDoc.RootElement
        });

        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync(cancellationToken);

        await using var createCmd = new SqlCommand("sp_CreateCustomer", conn)
        {
            CommandType = System.Data.CommandType.StoredProcedure
        };
        createCmd.Parameters.AddWithValue("@json", json);

        var createdIdObj = await createCmd.ExecuteScalarAsync(cancellationToken);
        if (createdIdObj is null || createdIdObj is DBNull)
        {
            return null;
        }

        return Convert.ToInt32(createdIdObj);
    }

    public async Task<bool> UpdateCustomerAsync(
        int userId,
        string companyName,
        string email,
        string? password,
        bool? isActive,
        string categoriesJson,
        string? personInCharge,
        string? contactNo,
        string? address,
        string? companyRegNo,
        string? eInvoiceNo,
        CancellationToken cancellationToken)
    {
        if (!IsConfigured)
        {
            return false;
        }

        using var categoriesDoc = JsonDocument.Parse(string.IsNullOrWhiteSpace(categoriesJson) ? "[]" : categoriesJson);
        var json = JsonSerializer.Serialize(new
        {
            UserId = userId,
            CompanyName = companyName,
            Email = email,
            Password = password,
            IsActive = isActive,
            PersonInCharge = personInCharge,
            ContactNo = contactNo,
            Address = address,
            CompanyRegNo = companyRegNo,
            EInvoiceNo = eInvoiceNo,
            Categories = categoriesDoc.RootElement
        });

        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync(cancellationToken);

        await using var updateCmd = new SqlCommand("sp_UpdateCustomer", conn)
        {
            CommandType = System.Data.CommandType.StoredProcedure
        };
        updateCmd.Parameters.AddWithValue("@json", json);
        await updateCmd.ExecuteNonQueryAsync(cancellationToken);

        return true;
    }

    public async Task<bool> DeleteCustomerAsync(int userId, CancellationToken cancellationToken)
    {
        if (!IsConfigured)
        {
            return false;
        }

        var json = JsonSerializer.Serialize(new { UserId = userId });

        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync(cancellationToken);

        await using var cmd = new SqlCommand("sp_DeleteCustomer", conn)
        {
            CommandType = System.Data.CommandType.StoredProcedure
        };
        cmd.Parameters.AddWithValue("@json", json);

        await cmd.ExecuteNonQueryAsync(cancellationToken);
        return true;
    }

    public async Task<int?> CreateProductAsync(
        string productType,
        string name,
        string? description,
        decimal minPrice,
        decimal maxPrice,
        int quantity,
        bool qtyControl,
        string? category,
        bool isActive,
        IReadOnlyList<string>? images,
        CancellationToken cancellationToken)
    {
        if (!IsConfigured)
        {
            return null;
        }

        var json = JsonSerializer.Serialize(new
        {
            ProductType = productType,
            Name = name,
            Description = description,
            MinPrice = minPrice,
            MaxPrice = maxPrice,
            Quantity = quantity,
            QtyControl = qtyControl,
            Category = category,
            IsActive = isActive,
            Images = images ?? Array.Empty<string>()
        });

        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync(cancellationToken);

        await using var cmd = new SqlCommand("sp_CreateProduct", conn)
        {
            CommandType = System.Data.CommandType.StoredProcedure
        };
        cmd.Parameters.AddWithValue("@json", json);

        var createdIdObj = await cmd.ExecuteScalarAsync(cancellationToken);
        if (createdIdObj is null || createdIdObj is DBNull)
        {
            return null;
        }

        return Convert.ToInt32(createdIdObj);
    }

    public async Task<bool> UpdateProductAsync(
        int productId,
        string productType,
        string name,
        string? description,
        decimal minPrice,
        decimal maxPrice,
        int quantity,
        bool qtyControl,
        string? category,
        bool isActive,
        IReadOnlyList<string>? images,
        CancellationToken cancellationToken)
    {
        if (!IsConfigured)
        {
            return false;
        }

        var json = JsonSerializer.Serialize(new
        {
            ProductId = productId,
            ProductType = productType,
            Name = name,
            Description = description,
            MinPrice = minPrice,
            MaxPrice = maxPrice,
            Quantity = quantity,
            QtyControl = qtyControl,
            Category = category,
            IsActive = isActive,
            Images = images
        });

        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync(cancellationToken);

        await using var cmd = new SqlCommand("sp_UpdateProduct", conn)
        {
            CommandType = System.Data.CommandType.StoredProcedure
        };
        cmd.Parameters.AddWithValue("@json", json);

        await cmd.ExecuteNonQueryAsync(cancellationToken);
        return true;
    }

    public async Task<bool> DeleteProductAsync(int productId, CancellationToken cancellationToken)
    {
        if (!IsConfigured)
        {
            return false;
        }

        var json = JsonSerializer.Serialize(new { ProductId = productId });

        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync(cancellationToken);

        await using var cmd = new SqlCommand("sp_DeleteProduct", conn)
        {
            CommandType = System.Data.CommandType.StoredProcedure
        };
        cmd.Parameters.AddWithValue("@json", json);

        await cmd.ExecuteNonQueryAsync(cancellationToken);
        return true;
    }

    public async Task<IReadOnlyList<AdminOrderHeader>> GetAllOrdersAsync(CancellationToken cancellationToken)
    {
        if (!IsConfigured)
        {
            return Array.Empty<AdminOrderHeader>();
        }

        const string json = "{}";

        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync(cancellationToken);

        await using var cmd = new SqlCommand("sp_GetAllOrders", conn)
        {
            CommandType = System.Data.CommandType.StoredProcedure
        };
        cmd.Parameters.AddWithValue("@json", json);

        var results = new List<AdminOrderHeader>();
        await using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            var orderId = reader.GetInt32(reader.GetOrdinal("OrderId"));
            var orderNumber = reader.GetString(reader.GetOrdinal("OrderNumber"));
            var userId = reader.GetInt32(reader.GetOrdinal("UserId"));
            var email = reader.GetString(reader.GetOrdinal("Email"));
            var companyName = reader.IsDBNull(reader.GetOrdinal("CompanyName"))
                ? null
                : reader.GetString(reader.GetOrdinal("CompanyName"));
            var status = reader.GetString(reader.GetOrdinal("Status"));
            var orderDate = DateOnly.FromDateTime(reader.GetDateTime(reader.GetOrdinal("OrderDate")));
            var createdAt = reader.GetDateTime(reader.GetOrdinal("CreatedAt"));

            results.Add(new AdminOrderHeader(orderId, orderNumber, userId, email, companyName, status, orderDate, createdAt));
        }

        return results;
    }

    public async Task<bool> UpdateOrderStatusAsync(string orderNumber, string status, CancellationToken cancellationToken)
    {
        if (!IsConfigured)
        {
            return false;
        }

        var json = JsonSerializer.Serialize(new { OrderNumber = orderNumber, Status = status });

        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync(cancellationToken);

        await using var cmd = new SqlCommand("sp_UpdateOrderStatus", conn)
        {
            CommandType = System.Data.CommandType.StoredProcedure
        };
        cmd.Parameters.AddWithValue("@json", json);

        await cmd.ExecuteNonQueryAsync(cancellationToken);
        return true;
    }

    public async Task<bool> UpdateOrderItemQtyAsync(string orderNumber, string itemName, int qty, CancellationToken cancellationToken)
    {
        if (!IsConfigured)
        {
            return false;
        }

        var json = JsonSerializer.Serialize(new { OrderNumber = orderNumber, ItemName = itemName, Qty = qty });

        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync(cancellationToken);

        await using var cmd = new SqlCommand("sp_UpdateOrderItemQty", conn)
        {
            CommandType = System.Data.CommandType.StoredProcedure
        };
        cmd.Parameters.AddWithValue("@json", json);

        await cmd.ExecuteNonQueryAsync(cancellationToken);
        return true;
    }

    private async Task<IReadOnlyList<ProductCatalogRow>> GetProductCatalogAsync(
        string? category,
        string? productType,
        CancellationToken cancellationToken,
        int? maxImages = null,
        int? productId = null)
    {
        if (!IsConfigured)
        {
            return Array.Empty<ProductCatalogRow>();
        }

        var json = JsonSerializer.Serialize(new
        {
            Category = category,
            ProductType = productType,
            ProductId = productId,
            MaxImages = maxImages,
        });

        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync(cancellationToken);

        await using var cmd = new SqlCommand("sp_GetProductCatalog", conn)
        {
            CommandType = System.Data.CommandType.StoredProcedure
        };
        cmd.Parameters.AddWithValue("@json", json);

        var results = new List<ProductCatalogRow>();
        await using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            var productIdValue = reader.GetInt32(reader.GetOrdinal("ProductId"));
            var productTypeValue = reader.GetString(reader.GetOrdinal("ProductType"));
            var name = reader.GetString(reader.GetOrdinal("Name"));
            var description = reader.IsDBNull(reader.GetOrdinal("Description"))
                ? null
                : reader.GetString(reader.GetOrdinal("Description"));
            var minPrice = reader.GetDecimal(reader.GetOrdinal("MinPrice"));
            var maxPrice = reader.GetDecimal(reader.GetOrdinal("MaxPrice"));
            var quantity = reader.GetInt32(reader.GetOrdinal("Quantity"));
            var qtyControlOrdinal = TryGetOrdinal(reader, "QtyControl");
            var qtyControl = qtyControlOrdinal >= 0 && !reader.IsDBNull(qtyControlOrdinal) ? reader.GetBoolean(qtyControlOrdinal) : true;
            var categoryValue = reader.IsDBNull(reader.GetOrdinal("Category"))
                ? null
                : reader.GetString(reader.GetOrdinal("Category"));
            var isActiveOrdinal = TryGetOrdinal(reader, "IsActive");
            var isActive = isActiveOrdinal >= 0 && !reader.IsDBNull(isActiveOrdinal) ? reader.GetBoolean(isActiveOrdinal) : true;
            var images = ReadImages(reader);

            results.Add(new ProductCatalogRow(
                productIdValue,
                productTypeValue,
                name,
                description,
                minPrice,
                maxPrice,
                quantity,
                qtyControl,
                categoryValue,
                isActive,
                images));
        }

        return results;
    }

    private static IReadOnlyList<string> ReadImages(SqlDataReader reader)
    {
        var ordinal = TryGetOrdinal(reader, "ImagesJson");
        if (ordinal < 0 || reader.IsDBNull(ordinal))
        {
            return Array.Empty<string>();
        }

        var json = reader.GetString(ordinal);
        if (string.IsNullOrWhiteSpace(json))
        {
            return Array.Empty<string>();
        }

        using var doc = JsonDocument.Parse(json);
        if (doc.RootElement.ValueKind != JsonValueKind.Array)
        {
            return Array.Empty<string>();
        }

        var results = new List<string>();
        foreach (var el in doc.RootElement.EnumerateArray())
        {
            if (el.ValueKind == JsonValueKind.String)
            {
                var s = el.GetString();
                if (!string.IsNullOrWhiteSpace(s))
                {
                    results.Add(s);
                }
                continue;
            }

            if (el.ValueKind == JsonValueKind.Object && el.TryGetProperty("ImageData", out var v) && v.ValueKind == JsonValueKind.String)
            {
                var s = v.GetString();
                if (!string.IsNullOrWhiteSpace(s))
                {
                    results.Add(s);
                }
            }
        }

        return results;
    }

    /// <summary>
    /// Loads only the datasets needed for an admin tab.
    /// null/empty tab = full bootstrap (SSR / initial).
    /// </summary>
    public async Task<object> GetAdminTabDataForClientAsync(string? tab, CancellationToken cancellationToken)
    {
        var key = string.IsNullOrWhiteSpace(tab) ? "all" : tab.Trim().ToLowerInvariant();

        switch (key)
        {
            case "orders":
            {
                var orders = await GetOrdersWithItemsAsync(cancellationToken);
                return new { orders };
            }
            case "reports":
            {
                // Reports table uses orders; customer filter suggestions need customers.
                var ordersTask = GetOrdersWithItemsAsync(cancellationToken);
                var customersTask = GetCustomersWithCategoriesAsync(cancellationToken);
                await Task.WhenAll(ordersTask, customersTask);
                return new
                {
                    orders = await ordersTask,
                    customers = await customersTask
                };
            }
            case "inventory":
            {
                var categoriesTask = GetCategoriesAsync(cancellationToken);
                var productsTask = GetProductCatalogForClientAsync(null, null, cancellationToken, maxImages: 1);
                await Task.WhenAll(categoriesTask, productsTask);
                return new
                {
                    categories = await categoriesTask,
                    products = await productsTask
                };
            }
            case "crm":
            {
                var categoriesTask = GetCategoriesAsync(cancellationToken);
                var customersTask = GetCustomersWithCategoriesAsync(cancellationToken);
                await Task.WhenAll(categoriesTask, customersTask);
                return new
                {
                    categories = await categoriesTask,
                    customers = await customersTask
                };
            }
            default:
            {
                var categoriesTask = GetCategoriesAsync(cancellationToken);
                var productsTask = GetProductCatalogForClientAsync(null, null, cancellationToken, maxImages: 1);
                var customersTask = GetCustomersWithCategoriesAsync(cancellationToken);
                var ordersTask = GetOrdersWithItemsAsync(cancellationToken);
                await Task.WhenAll(categoriesTask, productsTask, customersTask, ordersTask);
                return new
                {
                    categories = await categoriesTask,
                    products = await productsTask,
                    customers = await customersTask,
                    orders = await ordersTask
                };
            }
        }
    }

    private async Task<IReadOnlyList<object>> GetCustomersWithCategoriesAsync(CancellationToken cancellationToken)
    {
        var customerRows = await GetCustomersAsync(cancellationToken);
        var categoriesByUser = await GetAllCustomerCategoriesMapAsync(cancellationToken);

        var customers = new List<object>(customerRows.Count);
        foreach (var c in customerRows)
        {
            categoriesByUser.TryGetValue(c.UserId, out var cats);
            customers.Add(new
            {
                id = c.UserId,
                company = c.CompanyName ?? string.Empty,
                email = c.Email,
                password = c.Password,
                isActive = c.IsActive,
                personInCharge = c.PersonInCharge ?? string.Empty,
                contactNo = c.ContactNo ?? string.Empty,
                address = c.Address ?? string.Empty,
                companyRegNo = c.CompanyRegNo ?? string.Empty,
                eInvoiceNo = c.EInvoiceNo ?? string.Empty,
                category = cats ?? Array.Empty<string>()
            });
        }

        return customers;
    }

    private async Task<IReadOnlyDictionary<int, IReadOnlyList<string>>> GetAllCustomerCategoriesMapAsync(
        CancellationToken cancellationToken)
    {
        var map = new Dictionary<int, List<string>>();
        if (!IsConfigured)
        {
            return map.ToDictionary(k => k.Key, k => (IReadOnlyList<string>)k.Value);
        }

        const string json = "{}";
        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync(cancellationToken);

        await using var cmd = new SqlCommand("sp_GetAllCustomerCategories", conn)
        {
            CommandType = System.Data.CommandType.StoredProcedure
        };
        cmd.Parameters.AddWithValue("@json", json);

        await using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            var userId = reader.GetInt32(reader.GetOrdinal("UserId"));
            var name = reader.GetString(reader.GetOrdinal("Name"));
            if (!map.TryGetValue(userId, out var list))
            {
                list = new List<string>();
                map[userId] = list;
            }
            list.Add(name);
        }

        return map.ToDictionary(k => k.Key, k => (IReadOnlyList<string>)k.Value);
    }

    private async Task<IReadOnlyList<object>> GetOrdersWithItemsAsync(CancellationToken cancellationToken)
    {
        var orderHeaders = await GetAllOrdersAsync(cancellationToken);
        var itemsByOrder = await GetAllOrderItemsMapAsync(cancellationToken);

        var orders = new List<object>(orderHeaders.Count);
        foreach (var order in orderHeaders)
        {
            itemsByOrder.TryGetValue(order.OrderId, out var items);
            orders.Add(new
            {
                id = order.OrderNumber,
                customer = order.CompanyName ?? order.Email,
                status = order.Status,
                date = order.OrderDate.ToString("yyyy-MM-dd"),
                items = (items ?? Array.Empty<object>())
            });
        }

        return orders;
    }

    private async Task<IReadOnlyDictionary<int, IReadOnlyList<object>>> GetAllOrderItemsMapAsync(
        CancellationToken cancellationToken)
    {
        var map = new Dictionary<int, List<object>>();
        if (!IsConfigured)
        {
            return map.ToDictionary(k => k.Key, k => (IReadOnlyList<object>)k.Value);
        }

        const string json = "{}";
        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync(cancellationToken);

        await using var cmd = new SqlCommand("sp_GetAllOrderItems", conn)
        {
            CommandType = System.Data.CommandType.StoredProcedure
        };
        cmd.Parameters.AddWithValue("@json", json);

        await using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            var orderId = reader.GetInt32(reader.GetOrdinal("OrderId"));
            var item = new
            {
                name = reader.GetString(reader.GetOrdinal("Name")),
                type = reader.GetString(reader.GetOrdinal("ProductType")),
                category = reader.IsDBNull(reader.GetOrdinal("Category"))
                    ? null
                    : reader.GetString(reader.GetOrdinal("Category")),
                qty = reader.GetInt32(reader.GetOrdinal("Quantity")),
                minPrice = reader.GetDecimal(reader.GetOrdinal("MinPrice")),
                maxPrice = reader.GetDecimal(reader.GetOrdinal("MaxPrice")),
            };

            if (!map.TryGetValue(orderId, out var list))
            {
                list = new List<object>();
                map[orderId] = list;
            }
            list.Add(item);
        }

        return map.ToDictionary(k => k.Key, k => (IReadOnlyList<object>)k.Value);
    }

    private static int TryGetOrdinal(SqlDataReader reader, string name)
    {
        for (var i = 0; i < reader.FieldCount; i++)
        {
            if (string.Equals(reader.GetName(i), name, StringComparison.OrdinalIgnoreCase))
            {
                return i;
            }
        }

        return -1;
    }

    private sealed record ProductCatalogRow(
        int ProductId,
        string ProductType,
        string Name,
        string? Description,
        decimal MinPrice,
        decimal MaxPrice,
        int Quantity,
        bool QtyControl,
        string? Category,
        bool IsActive,
        IReadOnlyList<string> Images);

    public sealed record OrderHeader(
        int OrderId,
        string OrderNumber,
        string Status,
        DateOnly OrderDate,
        DateTime CreatedAt);

    public sealed record AdminOrderHeader(
        int OrderId,
        string OrderNumber,
        int UserId,
        string Email,
        string? CompanyName,
        string Status,
        DateOnly OrderDate,
        DateTime CreatedAt);

    public sealed record OrderItemRow(
        int OrderItemId,
        int OrderId,
        string Name,
        string ProductType,
        string? Category,
        int Quantity,
        decimal MinPrice,
        decimal MaxPrice);

    public sealed record CreateOrderResult(
        int OrderId,
        string OrderNumber);

    public sealed record CustomerRow(
        int UserId,
        string Email,
        string? CompanyName,
        string Password,
        bool IsActive,
        string? PersonInCharge,
        string? ContactNo,
        string? Address,
        string? CompanyRegNo,
        string? EInvoiceNo);

    public sealed record LoginResult(
        int UserId,
        string Email,
        string Role,
        Guid SessionId);

    public sealed record SessionValidationResult(
        bool IsValid,
        string? Role,
        string? Email);
}
