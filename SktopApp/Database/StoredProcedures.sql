USE [SKTOP]
GO

/****** Object:  StoredProcedure [dbo].[sp_AddCategory]    Script Date: 8/6/2026 4:37:58 PM ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE OR ALTER PROCEDURE [dbo].[sp_AddCategory]
    @json NVARCHAR(MAX)
AS
BEGIN
    SET NOCOUNT ON;

    IF @json IS NULL SET @json = N'{}';
    IF (ISJSON(@json) = 0)
    BEGIN
        RAISERROR('Invalid JSON.', 16, 1);
        RETURN;
    END

    DECLARE @Name NVARCHAR(100) = JSON_VALUE(@json, '$.Name');

    IF @Name IS NULL OR LTRIM(RTRIM(@Name)) = ''
    BEGIN
        RAISERROR('Category name is required.', 16, 1);
        RETURN;
    END

    IF NOT EXISTS (SELECT 1 FROM Categories WHERE Name = @Name)
    BEGIN
        INSERT INTO Categories (Name) VALUES (@Name);
    END
END;
GO
/****** Object:  StoredProcedure [dbo].[sp_AdminAccessToken_Validate]    Script Date: 8/6/2026 4:37:58 PM ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE OR ALTER PROCEDURE [dbo].[sp_AdminAccessToken_Validate]
    @json NVARCHAR(MAX)
AS
BEGIN
    SET NOCOUNT ON;

    IF @json IS NULL SET @json = N'{}';
    IF (ISJSON(@json) = 0)
    BEGIN
        RAISERROR('Invalid JSON.', 16, 1);
        RETURN;
    END

    DECLARE @Token UNIQUEIDENTIFIER = TRY_CONVERT(UNIQUEIDENTIFIER, JSON_VALUE(@json, '$.Token'));
    DECLARE @Consume BIT = TRY_CONVERT(BIT, JSON_VALUE(@json, '$.Consume'));

    IF @Consume IS NULL SET @Consume = 0;

    DECLARE @IsValid BIT = 0;

    IF @Token IS NOT NULL
    BEGIN
        SELECT TOP 1 @IsValid = 1
        FROM AdminAccessTokens
        WHERE Token = @Token
          AND IsRevoked = 0
          --AND UsedAt IS NULL
          AND (ExpiresAt IS NULL OR ExpiresAt > GETDATE());
    END

    IF @IsValid = 1 AND @Consume = 1
    BEGIN
        UPDATE AdminAccessTokens
        SET UsedAt = GETDATE()
        WHERE Token = @Token AND UsedAt IS NULL;
    END

    SELECT @IsValid AS IsValid;
END;
GO
/****** Object:  StoredProcedure [dbo].[sp_CreateCustomer]    Script Date: 8/6/2026 4:37:58 PM ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE OR ALTER PROCEDURE [dbo].[sp_CreateCustomer]
    @json NVARCHAR(MAX)
AS
BEGIN
    SET NOCOUNT ON;

    IF @json IS NULL SET @json = N'{}';
    IF (ISJSON(@json) = 0)
    BEGIN
        RAISERROR('Invalid JSON.', 16, 1);
        RETURN;
    END

    DECLARE @CompanyName NVARCHAR(255) = JSON_VALUE(@json, '$.CompanyName');
    DECLARE @Email NVARCHAR(255) = JSON_VALUE(@json, '$.Email');
    DECLARE @Password NVARCHAR(500) = JSON_VALUE(@json, '$.Password');
    DECLARE @IsActive BIT = TRY_CONVERT(BIT, JSON_VALUE(@json, '$.IsActive'));
    DECLARE @CategoriesJson NVARCHAR(MAX) = JSON_QUERY(@json, '$.Categories');

    INSERT INTO Users (Email, CompanyName, PasswordHash, Role, IsActive)
    VALUES (
        @Email,
        @CompanyName,
        ENCRYPTBYPASSPHRASE('SkTopApp', CAST(@Password AS NVARCHAR(MAX))),
        'Customer',
        COALESCE(@IsActive, 1)
    );

    DECLARE @UserId INT = SCOPE_IDENTITY();

    IF @CategoriesJson IS NULL OR LTRIM(RTRIM(@CategoriesJson)) = ''
    BEGIN
        SET @CategoriesJson = N'[]';
    END

    INSERT INTO UserCategories (UserId, CategoryId)
    SELECT
        @UserId,
        c.CategoryId
    FROM OPENJSON(@CategoriesJson) j
    INNER JOIN Categories c ON c.Name = j.value
    WHERE NOT EXISTS (
        SELECT 1 FROM UserCategories uc WHERE uc.UserId = @UserId AND uc.CategoryId = c.CategoryId
    );

    SELECT @UserId AS UserId;
END;
GO
/****** Object:  StoredProcedure [dbo].[sp_CreateOrder]    Script Date: 8/6/2026 4:37:58 PM ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE OR ALTER PROCEDURE [dbo].[sp_CreateOrder]
    @json NVARCHAR(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    IF @json IS NULL SET @json = N'{}';
    IF (ISJSON(@json) = 0)
    BEGIN
        RAISERROR('Invalid JSON.', 16, 1);
        RETURN;
    END

    DECLARE @UserId INT = TRY_CONVERT(INT, JSON_VALUE(@json, '$.UserId'));
    DECLARE @OrderNumber NVARCHAR(50) = JSON_VALUE(@json, '$.OrderNumber');
    DECLARE @Status NVARCHAR(50) = JSON_VALUE(@json, '$.Status');
    DECLARE @OrderDate DATE = TRY_CONVERT(DATE, JSON_VALUE(@json, '$.OrderDate'));
    DECLARE @ItemsJson NVARCHAR(MAX) = JSON_QUERY(@json, '$.Items');
    DECLARE @ShouldIncrementPrefix BIT = 0;

    IF @OrderNumber IS NULL OR LTRIM(RTRIM(@OrderNumber)) = ''
    BEGIN
        SET @ShouldIncrementPrefix = 1;
    END

    IF @Status IS NULL OR LTRIM(RTRIM(@Status)) = ''
    BEGIN
        SET @Status = 'Pending';
    END

    IF @OrderDate IS NULL
    BEGIN
        SET @OrderDate = CAST(GETDATE() AS DATE);
    END

    IF @ItemsJson IS NULL OR LTRIM(RTRIM(@ItemsJson)) = ''
    BEGIN
        SET @ItemsJson = N'[]';
    END

    BEGIN TRY
        BEGIN TRAN;

        IF @ShouldIncrementPrefix = 1
        BEGIN
            DECLARE @NextRunNo INT;
            DECLARE @PrefixValue NVARCHAR(50);
            DECLARE @LengthValue INT;
            
            SELECT TOP 1
                @NextRunNo = p.RunNo,
                @PrefixValue = p.[Prefix],
                @LengthValue = p.[Length]
            FROM [dbo].[Prefix] p WITH (UPDLOCK, HOLDLOCK)
            WHERE p.[Type] = 'Order';

            IF @NextRunNo IS NULL OR @PrefixValue IS NULL OR @LengthValue IS NULL
            BEGIN
                RAISERROR('Order prefix configuration not found.', 16, 1);
            END

            SET @OrderNumber = @PrefixValue + RIGHT(REPLICATE('0', @LengthValue - 1) + CAST(@NextRunNo AS VARCHAR(6)), @LengthValue);
        END

        IF EXISTS (
            SELECT 1
            FROM OPENJSON(@ItemsJson) j
            INNER JOIN Products p
                ON p.Name = JSON_VALUE(j.value, '$.name')
                AND p.ProductType = ISNULL(JSON_VALUE(j.value, '$.type'), 'Product')
                AND ISNULL(p.Category, '') = ISNULL(JSON_VALUE(j.value, '$.category'), '')
            WHERE p.QtyControl = 1
              AND p.Quantity = 0
        )
        BEGIN
            RAISERROR('Cannot create order. Item is out of stock.', 16, 1);
        END

        INSERT INTO Orders (OrderNumber, UserId, Status, OrderDate)
        VALUES (@OrderNumber, @UserId, @Status, @OrderDate);

        DECLARE @OrderId INT = SCOPE_IDENTITY();

        INSERT INTO OrderItems (OrderId, Name, ProductType, Category, Quantity, MinPrice, MaxPrice)
        SELECT
            @OrderId,
            JSON_VALUE(value, '$.name'),
            ISNULL(JSON_VALUE(value, '$.type'), 'Product'),
            JSON_VALUE(value, '$.category'),
            ISNULL(TRY_CONVERT(INT, JSON_VALUE(value, '$.qty')), 1),
            ISNULL(TRY_CONVERT(DECIMAL(18,2), JSON_VALUE(value, '$.minPrice')), 0.00),
            ISNULL(TRY_CONVERT(DECIMAL(18,2), JSON_VALUE(value, '$.maxPrice')), 0.00)
        FROM OPENJSON(@ItemsJson);

        ;WITH OrderedTotals AS (
            SELECT
                oi.Name,
                oi.ProductType,
                oi.Category,
                SUM(oi.Quantity) AS OrderedQty
            FROM OrderItems oi
            WHERE oi.OrderId = @OrderId
            GROUP BY oi.Name, oi.ProductType, oi.Category
        )
        UPDATE p
        SET p.Quantity = CASE
            WHEN p.QtyControl = 0 THEN p.Quantity
            WHEN p.Quantity = 0 THEN 0
            WHEN p.Quantity - ot.OrderedQty < 0 THEN 0
            ELSE p.Quantity - ot.OrderedQty
        END,
        p.UpdatedAt = GETDATE()
        FROM Products p
        INNER JOIN OrderedTotals ot
            ON ot.Name = p.Name
            AND ot.ProductType = p.ProductType
            AND ISNULL(ot.Category, '') = ISNULL(p.Category, '')
        WHERE p.QtyControl = 1;

        IF @ShouldIncrementPrefix = 1
        BEGIN
            UPDATE [dbo].[Prefix]
            SET RunNo = RunNo + 1,
                UpdatedAt = GETDATE()
            WHERE [Type] = 'Order';
        END

        COMMIT;

        SELECT @OrderId AS OrderId, @OrderNumber AS OrderNumber;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK;
        THROW;
    END CATCH
END
GO
/****** Object:  StoredProcedure [dbo].[sp_CreateProduct]    Script Date: 8/6/2026 4:37:58 PM ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE OR ALTER PROCEDURE [dbo].[sp_CreateProduct]
    @json NVARCHAR(MAX)
AS
BEGIN
    SET NOCOUNT ON;

    IF @json IS NULL SET @json = N'{}';
    IF (ISJSON(@json) = 0)
    BEGIN
        RAISERROR('Invalid JSON.', 16, 1);
        RETURN;
    END

    DECLARE @ProductType NVARCHAR(50) = JSON_VALUE(@json, '$.ProductType');
    DECLARE @Name NVARCHAR(255) = JSON_VALUE(@json, '$.Name');
    DECLARE @Description NVARCHAR(MAX) = JSON_VALUE(@json, '$.Description');
    DECLARE @MinPrice DECIMAL(18,2) = TRY_CONVERT(DECIMAL(18,2), JSON_VALUE(@json, '$.MinPrice'));
    DECLARE @MaxPrice DECIMAL(18,2) = TRY_CONVERT(DECIMAL(18,2), JSON_VALUE(@json, '$.MaxPrice'));
    DECLARE @Quantity INT = TRY_CONVERT(INT, JSON_VALUE(@json, '$.Quantity'));
    DECLARE @QtyControl BIT = COALESCE(TRY_CONVERT(BIT, JSON_VALUE(@json, '$.QtyControl')), 1);
    DECLARE @Category NVARCHAR(100) = JSON_VALUE(@json, '$.Category');
    DECLARE @IsActive BIT = COALESCE(TRY_CONVERT(BIT, JSON_VALUE(@json, '$.IsActive')), 1);
    DECLARE @ImagesJson NVARCHAR(MAX) = JSON_QUERY(@json, '$.Images');

    SET @Quantity = CASE WHEN @QtyControl = 1 THEN COALESCE(@Quantity, 0) ELSE 0 END;

    INSERT INTO Products (ProductType, Name, Description, MinPrice, MaxPrice, Quantity, QtyControl, Category, IsActive)
    VALUES (@ProductType, @Name, @Description, @MinPrice, @MaxPrice, @Quantity, @QtyControl, @Category, @IsActive);

    DECLARE @ProductId INT = SCOPE_IDENTITY();

    IF @ImagesJson IS NOT NULL
    BEGIN
        IF LTRIM(RTRIM(@ImagesJson)) = ''
        BEGIN
            SET @ImagesJson = N'[]';
        END

        INSERT INTO ProductPictures (ProductId, ImageData, SortOrder)
        SELECT
            @ProductId,
            j.ImageData,
            ROW_NUMBER() OVER (ORDER BY (SELECT 1)) - 1
        FROM OPENJSON(@ImagesJson) WITH (ImageData NVARCHAR(MAX) '$') j
        WHERE j.ImageData IS NOT NULL AND LTRIM(RTRIM(j.ImageData)) <> '';
    END

    SELECT @ProductId AS ProductId;
END
GO
/****** Object:  StoredProcedure [dbo].[sp_DeleteCategory]    Script Date: 8/6/2026 4:37:58 PM ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE OR ALTER PROCEDURE [dbo].[sp_DeleteCategory]
    @json NVARCHAR(MAX)
AS
BEGIN
    SET NOCOUNT ON;

    IF @json IS NULL SET @json = N'{}';
    IF (ISJSON(@json) = 0)
    BEGIN
        RAISERROR('Invalid JSON.', 16, 1);
        RETURN;
    END

    DECLARE @Name NVARCHAR(100) = JSON_VALUE(@json, '$.Name');
    DECLARE @CategoryId INT;
    SELECT @CategoryId = CategoryId FROM Categories WHERE Name = @Name;

    IF @CategoryId IS NULL
    BEGIN
        RETURN;
    END

    DELETE FROM UserCategories WHERE CategoryId = @CategoryId;
    DELETE FROM Categories WHERE CategoryId = @CategoryId;
END;
GO
/****** Object:  StoredProcedure [dbo].[sp_DeleteCustomer]    Script Date: 8/6/2026 4:37:58 PM ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE OR ALTER PROCEDURE [dbo].[sp_DeleteCustomer]
    @json NVARCHAR(MAX)
AS
BEGIN
    SET NOCOUNT ON;

    IF @json IS NULL SET @json = N'{}';
    IF (ISJSON(@json) = 0)
    BEGIN
        RAISERROR('Invalid JSON.', 16, 1);
        RETURN;
    END

    DECLARE @UserId INT = TRY_CONVERT(INT, JSON_VALUE(@json, '$.UserId'));
    IF @UserId IS NULL OR @UserId <= 0
    BEGIN
        RAISERROR('UserId is required.', 16, 1);
        RETURN;
    END

    IF EXISTS (
        SELECT 1
        FROM Orders o
        WHERE o.UserId = @UserId
    )
    BEGIN
        RAISERROR('Cannot delete customer. It exists in orders.', 16, 1);
        RETURN;
    END

    DELETE FROM Users WHERE UserId = @UserId AND Role = 'Customer';
END;
GO
/****** Object:  StoredProcedure [dbo].[sp_DeleteProduct]    Script Date: 8/6/2026 4:37:58 PM ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE OR ALTER PROCEDURE [dbo].[sp_DeleteProduct]
    @json NVARCHAR(MAX)
AS
BEGIN
    SET NOCOUNT ON;

    IF @json IS NULL SET @json = N'{}';
    IF (ISJSON(@json) = 0)
    BEGIN
        RAISERROR('Invalid JSON.', 16, 1);
        RETURN;
    END

    DECLARE @ProductId INT = TRY_CONVERT(INT, JSON_VALUE(@json, '$.ProductId'));
    IF @ProductId IS NULL OR @ProductId <= 0
    BEGIN
        RAISERROR('ProductId is required.', 16, 1);
        RETURN;
    END

    DECLARE @ProductName NVARCHAR(255);
    SELECT @ProductName = p.Name
    FROM Products p
    WHERE p.ProductId = @ProductId;

    IF @ProductName IS NULL OR LTRIM(RTRIM(@ProductName)) = ''
    BEGIN
        RAISERROR('Product not found.', 16, 1);
        RETURN;
    END

    IF EXISTS (
        SELECT 1
        FROM OrderItems oi
        INNER JOIN Orders o ON o.OrderId = oi.OrderId
        WHERE oi.Name = @ProductName
    )
    BEGIN
        RAISERROR('Cannot delete product. It exists in orders.', 16, 1);
        RETURN;
    END

    DELETE FROM Products WHERE ProductId = @ProductId;
END;
GO
/****** Object:  StoredProcedure [dbo].[sp_GetAllOrders]    Script Date: 8/6/2026 4:37:58 PM ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE OR ALTER PROCEDURE [dbo].[sp_GetAllOrders]
    @json NVARCHAR(MAX)
AS
BEGIN
    SET NOCOUNT ON;

    IF @json IS NULL SET @json = N'{}';
    IF (ISJSON(@json) = 0)
    BEGIN
        RAISERROR('Invalid JSON.', 16, 1);
        RETURN;
    END

    SELECT
        o.OrderId,
        o.OrderNumber,
        o.UserId,
        u.Email,
        u.CompanyName,
        o.Status,
        o.OrderDate,
        o.CreatedAt
    FROM Orders o
    INNER JOIN Users u ON u.UserId = o.UserId
    ORDER BY o.OrderDate DESC, o.CreatedAt DESC;
END;
GO
/****** Object:  StoredProcedure [dbo].[sp_GetCategories]    Script Date: 8/6/2026 4:37:58 PM ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE OR ALTER PROCEDURE [dbo].[sp_GetCategories]
    @json NVARCHAR(MAX)
AS
BEGIN
    SET NOCOUNT ON;

    IF @json IS NULL SET @json = N'{}';
    IF (ISJSON(@json) = 0)
    BEGIN
        RAISERROR('Invalid JSON.', 16, 1);
        RETURN;
    END

    SELECT CategoryId, Name
    FROM Categories
    ORDER BY Name;
END;
GO
/****** Object:  StoredProcedure [dbo].[sp_GetCustomerCategories]    Script Date: 8/6/2026 4:37:58 PM ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE OR ALTER PROCEDURE [dbo].[sp_GetCustomerCategories]
    @json NVARCHAR(MAX)
AS
BEGIN
    SET NOCOUNT ON;

    IF @json IS NULL SET @json = N'{}';
    IF (ISJSON(@json) = 0)
    BEGIN
        RAISERROR('Invalid JSON.', 16, 1);
        RETURN;
    END

    DECLARE @UserId INT = TRY_CONVERT(INT, JSON_VALUE(@json, '$.UserId'));

    SELECT c.Name
    FROM UserCategories uc
    INNER JOIN Categories c ON c.CategoryId = uc.CategoryId
    WHERE uc.UserId = @UserId
    ORDER BY c.Name;
END;
GO
/****** Object:  StoredProcedure [dbo].[sp_GetCustomers]    Script Date: 8/6/2026 4:37:58 PM ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE OR ALTER PROCEDURE [dbo].[sp_GetCustomers]
    @json NVARCHAR(MAX)
AS
BEGIN
    SET NOCOUNT ON;

    IF @json IS NULL SET @json = N'{}';
    IF (ISJSON(@json) = 0)
    BEGIN
        RAISERROR('Invalid JSON.', 16, 1);
        RETURN;
    END

    SELECT
        UserId,
        Email,
        CompanyName,
        IsActive,
        CreatedAt,
        UpdatedAt
    FROM Users
    WHERE Role = 'Customer'
    ORDER BY CompanyName, Email;
END;
GO
/****** Object:  StoredProcedure [dbo].[sp_GetOrderHistory]    Script Date: 8/6/2026 4:37:58 PM ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE OR ALTER PROCEDURE [dbo].[sp_GetOrderHistory]
    @json NVARCHAR(MAX)
AS
BEGIN
    SET NOCOUNT ON;

    IF @json IS NULL SET @json = N'{}';
    IF (ISJSON(@json) = 0)
    BEGIN
        RAISERROR('Invalid JSON.', 16, 1);
        RETURN;
    END

    DECLARE @UserId INT = TRY_CONVERT(INT, JSON_VALUE(@json, '$.UserId'));

    SELECT
        o.OrderId,
        o.OrderNumber,
        o.Status,
        o.OrderDate,
        o.CreatedAt
    FROM Orders o
    WHERE o.UserId = @UserId
    ORDER BY o.OrderDate DESC, o.CreatedAt DESC;
END;
GO
/****** Object:  StoredProcedure [dbo].[sp_GetOrderItems]    Script Date: 8/6/2026 4:37:58 PM ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE OR ALTER PROCEDURE [dbo].[sp_GetOrderItems]
    @json NVARCHAR(MAX)
AS
BEGIN
    SET NOCOUNT ON;

    IF @json IS NULL SET @json = N'{}';
    IF (ISJSON(@json) = 0)
    BEGIN
        RAISERROR('Invalid JSON.', 16, 1);
        RETURN;
    END

    DECLARE @OrderId INT = TRY_CONVERT(INT, JSON_VALUE(@json, '$.OrderId'));

    SELECT
        oi.OrderItemId,
        oi.OrderId,
        oi.Name,
        oi.ProductType,
        oi.Category,
        oi.Quantity,
        oi.MinPrice,
        oi.MaxPrice
    FROM OrderItems oi
    WHERE oi.OrderId = @OrderId
    ORDER BY oi.OrderItemId;
END;
GO
/****** Object:  StoredProcedure [dbo].[sp_GetProductCatalog]    Script Date: 8/6/2026 4:37:58 PM ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

-- SP: Get Product Catalog
CREATE OR ALTER PROCEDURE [dbo].[sp_GetProductCatalog]
    @json NVARCHAR(MAX)
AS
BEGIN
    SET NOCOUNT ON;

    IF @json IS NULL SET @json = N'{}';
    IF (ISJSON(@json) = 0)
    BEGIN
        RAISERROR('Invalid JSON.', 16, 1);
        RETURN;
    END

    DECLARE @Category NVARCHAR(100) = NULLIF(LTRIM(RTRIM(JSON_VALUE(@json, '$.Category'))), '');
    DECLARE @ProductType NVARCHAR(50) = NULLIF(LTRIM(RTRIM(JSON_VALUE(@json, '$.ProductType'))), '');
    DECLARE @ProductId INT = TRY_CONVERT(INT, JSON_VALUE(@json, '$.ProductId'));
    DECLARE @MaxImages INT = TRY_CONVERT(INT, JSON_VALUE(@json, '$.MaxImages'));

    SELECT 
        p.ProductId,
        p.ProductType,
        p.Name,
        p.Description,
        p.MinPrice,
        p.MaxPrice,
        p.Quantity,
		p.QtyControl,
        p.Category,
		p.IsActive,
        p.CreatedAt,
        ISNULL((
            SELECT x.ImageData
            FROM (
                SELECT
                    pp.ImageData,
                    ROW_NUMBER() OVER (ORDER BY pp.SortOrder, pp.ProductPictureId) AS rn
                FROM ProductPictures pp
                WHERE pp.ProductId = p.ProductId
            ) x
            WHERE (@MaxImages IS NULL OR x.rn <= @MaxImages)
            ORDER BY x.rn
            FOR JSON PATH
        ), N'[]') AS ImagesJson
    FROM Products p
    WHERE (@Category IS NULL OR p.Category = @Category)
      AND (@ProductType IS NULL OR p.ProductType = @ProductType)
      AND (@ProductId IS NULL OR p.ProductId = @ProductId)
    ORDER BY p.Name;
END;
GO
/****** Object:  StoredProcedure [dbo].[sp_GetAllOrderItems] ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE OR ALTER PROCEDURE [dbo].[sp_GetAllOrderItems]
    @json NVARCHAR(MAX)
AS
BEGIN
    SET NOCOUNT ON;

    IF @json IS NULL SET @json = N'{}';
    IF (ISJSON(@json) = 0)
    BEGIN
        RAISERROR('Invalid JSON.', 16, 1);
        RETURN;
    END

    SELECT
        oi.OrderItemId,
        oi.OrderId,
        oi.Name,
        oi.ProductType,
        oi.Category,
        oi.Quantity,
        oi.MinPrice,
        oi.MaxPrice
    FROM OrderItems oi
    ORDER BY oi.OrderId, oi.OrderItemId;
END;
GO
/****** Object:  StoredProcedure [dbo].[sp_GetAllCustomerCategories] ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE OR ALTER PROCEDURE [dbo].[sp_GetAllCustomerCategories]
    @json NVARCHAR(MAX)
AS
BEGIN
    SET NOCOUNT ON;

    IF @json IS NULL SET @json = N'{}';
    IF (ISJSON(@json) = 0)
    BEGIN
        RAISERROR('Invalid JSON.', 16, 1);
        RETURN;
    END

    SELECT
        uc.UserId,
        c.Name
    FROM UserCategories uc
    INNER JOIN Categories c ON c.CategoryId = uc.CategoryId
    ORDER BY uc.UserId, c.Name;
END;
GO
/****** Object:  StoredProcedure [dbo].[sp_GetAvailableSegments]    Script Date: 8/12/2026 2:45:00 PM ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

-- Distinct Categories from active Products, optionally by ProductType and customer permissions.
CREATE OR ALTER PROCEDURE [dbo].[sp_GetAvailableSegments]
    @json NVARCHAR(MAX)
AS
BEGIN
    SET NOCOUNT ON;

    IF @json IS NULL SET @json = N'{}';
    IF (ISJSON(@json) = 0)
    BEGIN
        RAISERROR('Invalid JSON.', 16, 1);
        RETURN;
    END

    DECLARE @ProductType NVARCHAR(50) = NULLIF(LTRIM(RTRIM(JSON_VALUE(@json, '$.ProductType'))), '');
    DECLARE @UserId INT = TRY_CONVERT(INT, JSON_VALUE(@json, '$.UserId'));

    SELECT DISTINCT
        p.ProductType,
        p.Category AS Name
    FROM Products p
    WHERE p.IsActive = 1
      AND p.Category IS NOT NULL
      AND LTRIM(RTRIM(p.Category)) <> ''
      AND (@ProductType IS NULL OR p.ProductType = @ProductType)
      AND (
            @UserId IS NULL
            OR EXISTS (
                SELECT 1
                FROM UserCategories uc
                INNER JOIN Categories c ON c.CategoryId = uc.CategoryId
                WHERE uc.UserId = @UserId
                  AND c.Name = p.Category
            )
          )
    ORDER BY p.ProductType, p.Category;
END;
GO
/****** Object:  StoredProcedure [dbo].[sp_SetCustomerCategories]    Script Date: 8/6/2026 4:37:58 PM ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE OR ALTER PROCEDURE [dbo].[sp_SetCustomerCategories]
    @json NVARCHAR(MAX)
AS
BEGIN
    SET NOCOUNT ON;

    IF @json IS NULL SET @json = N'{}';
    IF (ISJSON(@json) = 0)
    BEGIN
        RAISERROR('Invalid JSON.', 16, 1);
        RETURN;
    END

    DECLARE @UserId INT = TRY_CONVERT(INT, JSON_VALUE(@json, '$.UserId'));
    DECLARE @CategoriesJson NVARCHAR(MAX) = JSON_QUERY(@json, '$.Categories');

    IF @CategoriesJson IS NULL OR LTRIM(RTRIM(@CategoriesJson)) = ''
    BEGIN
        SET @CategoriesJson = N'[]';
    END

    DELETE FROM UserCategories WHERE UserId = @UserId;

    INSERT INTO UserCategories (UserId, CategoryId)
    SELECT
        @UserId,
        c.CategoryId
    FROM OPENJSON(@CategoriesJson) j
    INNER JOIN Categories c ON c.Name = j.value
    WHERE NOT EXISTS (
        SELECT 1 FROM UserCategories uc WHERE uc.UserId = @UserId AND uc.CategoryId = c.CategoryId
    );
END;
GO
/****** Object:  StoredProcedure [dbo].[sp_UpdateCustomer]    Script Date: 8/6/2026 4:37:58 PM ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE OR ALTER PROCEDURE [dbo].[sp_UpdateCustomer]
    @json NVARCHAR(MAX)
AS
BEGIN
    SET NOCOUNT ON;

    IF @json IS NULL SET @json = N'{}';
    IF (ISJSON(@json) = 0)
    BEGIN
        RAISERROR('Invalid JSON.', 16, 1);
        RETURN;
    END

    DECLARE @UserId INT = TRY_CONVERT(INT, JSON_VALUE(@json, '$.UserId'));
    DECLARE @CompanyName NVARCHAR(255) = JSON_VALUE(@json, '$.CompanyName');
    DECLARE @Email NVARCHAR(255) = JSON_VALUE(@json, '$.Email');
    DECLARE @Password NVARCHAR(500) = JSON_VALUE(@json, '$.Password');
    DECLARE @IsActive BIT = TRY_CONVERT(BIT, JSON_VALUE(@json, '$.IsActive'));
    DECLARE @CategoriesJson NVARCHAR(MAX) = JSON_QUERY(@json, '$.Categories');

    UPDATE Users
    SET
        CompanyName = @CompanyName,
        Email = @Email,
        PasswordHash = CASE
            WHEN NULLIF(@Password, '') IS NOT NULL THEN ENCRYPTBYPASSPHRASE('SkTopApp', CAST(@Password AS NVARCHAR(MAX)))
            ELSE PasswordHash
        END,
        IsActive = COALESCE(@IsActive, IsActive),
        UpdatedAt = GETDATE()
    WHERE UserId = @UserId AND Role = 'Customer';

    IF @CategoriesJson IS NOT NULL
    BEGIN
        IF LTRIM(RTRIM(@CategoriesJson)) = ''
        BEGIN
            SET @CategoriesJson = N'[]';
        END

        DELETE FROM UserCategories WHERE UserId = @UserId;

        INSERT INTO UserCategories (UserId, CategoryId)
        SELECT
            @UserId,
            c.CategoryId
        FROM OPENJSON(@CategoriesJson) j
        INNER JOIN Categories c ON c.Name = j.value
        WHERE NOT EXISTS (
            SELECT 1 FROM UserCategories uc WHERE uc.UserId = @UserId AND uc.CategoryId = c.CategoryId
        );
    END
END;
GO
/****** Object:  StoredProcedure [dbo].[sp_UpdateOrderItemQty]    Script Date: 8/6/2026 4:37:58 PM ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE OR ALTER PROCEDURE [dbo].[sp_UpdateOrderItemQty]
    @json NVARCHAR(MAX)
AS
BEGIN
    SET NOCOUNT ON;

    IF @json IS NULL SET @json = N'{}';
    IF (ISJSON(@json) = 0)
    BEGIN
        RAISERROR('Invalid JSON.', 16, 1);
        RETURN;
    END

    DECLARE @OrderNumber NVARCHAR(50) = JSON_VALUE(@json, '$.OrderNumber');
    DECLARE @ItemName NVARCHAR(255) = JSON_VALUE(@json, '$.ItemName');
    DECLARE @Qty INT = TRY_CONVERT(INT, JSON_VALUE(@json, '$.Qty'));

    DECLARE @OrderId INT;
    SELECT @OrderId = OrderId FROM Orders WHERE OrderNumber = @OrderNumber;
    IF @OrderId IS NULL
    BEGIN
        RETURN;
    END

    UPDATE OrderItems
    SET Quantity = @Qty
    WHERE OrderId = @OrderId AND Name = @ItemName;
END;
GO
/****** Object:  StoredProcedure [dbo].[sp_UpdateOrderStatus]    Script Date: 8/6/2026 4:37:58 PM ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE OR ALTER PROCEDURE [dbo].[sp_UpdateOrderStatus]
    @json NVARCHAR(MAX)
AS
BEGIN
    SET NOCOUNT ON;

    IF @json IS NULL SET @json = N'{}';
    IF (ISJSON(@json) = 0)
    BEGIN
        RAISERROR('Invalid JSON.', 16, 1);
        RETURN;
    END

    DECLARE @OrderNumber NVARCHAR(50) = JSON_VALUE(@json, '$.OrderNumber');
    DECLARE @Status NVARCHAR(50) = JSON_VALUE(@json, '$.Status');

    UPDATE Orders
    SET Status = @Status
    WHERE OrderNumber = @OrderNumber;
END;
GO
/****** Object:  StoredProcedure [dbo].[sp_UpdateProduct]    Script Date: 8/6/2026 4:37:58 PM ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE OR ALTER PROCEDURE [dbo].[sp_UpdateProduct]
    @json NVARCHAR(MAX)
AS
BEGIN
    SET NOCOUNT ON;

    IF @json IS NULL SET @json = N'{}';
    IF (ISJSON(@json) = 0)
    BEGIN
        RAISERROR('Invalid JSON.', 16, 1);
        RETURN;
    END

    DECLARE @ProductId INT = TRY_CONVERT(INT, JSON_VALUE(@json, '$.ProductId'));
    DECLARE @ProductType NVARCHAR(50) = JSON_VALUE(@json, '$.ProductType');
    DECLARE @Name NVARCHAR(255) = JSON_VALUE(@json, '$.Name');
    DECLARE @Description NVARCHAR(MAX) = JSON_VALUE(@json, '$.Description');
    DECLARE @MinPrice DECIMAL(18,2) = TRY_CONVERT(DECIMAL(18,2), JSON_VALUE(@json, '$.MinPrice'));
    DECLARE @MaxPrice DECIMAL(18,2) = TRY_CONVERT(DECIMAL(18,2), JSON_VALUE(@json, '$.MaxPrice'));
    DECLARE @Quantity INT = TRY_CONVERT(INT, JSON_VALUE(@json, '$.Quantity'));
    DECLARE @QtyControl BIT = TRY_CONVERT(BIT, JSON_VALUE(@json, '$.QtyControl'));
    DECLARE @Category NVARCHAR(100) = JSON_VALUE(@json, '$.Category');
    DECLARE @IsActive BIT = TRY_CONVERT(BIT, JSON_VALUE(@json, '$.IsActive'));
    DECLARE @ImagesJson NVARCHAR(MAX) = JSON_QUERY(@json, '$.Images');

    SET @Quantity = CASE WHEN COALESCE(@QtyControl, 1) = 1 THEN COALESCE(@Quantity, 0) ELSE 0 END;

    UPDATE Products
    SET
        ProductType = @ProductType,
        Name = @Name,
        Description = @Description,
        MinPrice = @MinPrice,
        MaxPrice = @MaxPrice,
        Quantity = @Quantity,
        QtyControl = COALESCE(@QtyControl, QtyControl),
        Category = @Category,
        IsActive = COALESCE(@IsActive, IsActive),
        UpdatedAt = GETDATE()
    WHERE ProductId = @ProductId;

    IF @ImagesJson IS NOT NULL
    BEGIN
        IF LTRIM(RTRIM(@ImagesJson)) = ''
        BEGIN
            SET @ImagesJson = N'[]';
        END

        DELETE FROM ProductPictures WHERE ProductId = @ProductId;

        INSERT INTO ProductPictures (ProductId, ImageData, SortOrder)
        SELECT
            @ProductId,
            j.ImageData,
            ROW_NUMBER() OVER (ORDER BY (SELECT 1)) - 1
        FROM OPENJSON(@ImagesJson) WITH (ImageData NVARCHAR(MAX) '$') j
        WHERE j.ImageData IS NOT NULL AND LTRIM(RTRIM(j.ImageData)) <> '';
    END
END
GO
/****** Object:  StoredProcedure [dbo].[sp_UserLogin]    Script Date: 8/6/2026 4:37:58 PM ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

-- ========================================================================================
-- STORED PROCEDURES
-- ========================================================================================

-- SP: User Login
-- Verifies credentials, updates LastLogin timestamp, and creates a session
CREATE OR ALTER PROCEDURE [dbo].[sp_UserLogin]
    @json NVARCHAR(MAX)
AS
BEGIN
    SET NOCOUNT ON;

    IF @json IS NULL SET @json = N'{}';
    IF (ISJSON(@json) = 0)
    BEGIN
        RAISERROR('Invalid JSON.', 16, 1);
        RETURN;
    END

    DECLARE @Email NVARCHAR(255) = JSON_VALUE(@json, '$.Email');
    DECLARE @Password NVARCHAR(MAX) = COALESCE(JSON_VALUE(@json, '$.Password'), JSON_VALUE(@json, '$.PasswordHash'));

    DECLARE @UserId INT;
    DECLARE @Role NVARCHAR(50);

    -- Find active user with matching email and password hash
    SELECT 
        @UserId = UserId,
        @Role = Role
    FROM Users
    WHERE Email = @Email 
      AND CAST(DECRYPTBYPASSPHRASE('SkTopApp', PasswordHash) AS NVARCHAR(MAX)) = @Password
      AND IsActive = 1;

    IF @UserId IS NOT NULL
    BEGIN
        -- Update login timestamp
        UPDATE Users 
        SET LastLogin = GETDATE() 
        WHERE UserId = @UserId;

        -- Create a new session (Optional if using session tracking)
        DECLARE @SessionId UNIQUEIDENTIFIER = NEWID();
        INSERT INTO UserSessions (SessionId, UserId, ExpiresAt)
        VALUES (@SessionId, @UserId, DATEADD(hour, 24, GETDATE()));

        -- Return user info and session
        SELECT 
            @UserId AS UserId,
            @Email AS Email,
            @Role AS Role,
            @SessionId AS SessionId,
            'Login Successful' AS Status;
    END
    ELSE
    BEGIN
        -- Invalid credentials
        SELECT NULL AS UserId, 'Invalid Email or Password' AS Status;
    END
END;
GO
/****** Object:  StoredProcedure [dbo].[sp_UserLogout]    Script Date: 8/6/2026 4:37:58 PM ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

-- SP: User Logout
-- Invalidates session and updates LastLogout timestamp
CREATE OR ALTER PROCEDURE [dbo].[sp_UserLogout]
    @json NVARCHAR(MAX)
AS
BEGIN
    SET NOCOUNT ON;

    IF @json IS NULL SET @json = N'{}';
    IF (ISJSON(@json) = 0)
    BEGIN
        RAISERROR('Invalid JSON.', 16, 1);
        RETURN;
    END

    DECLARE @UserId INT = TRY_CONVERT(INT, JSON_VALUE(@json, '$.UserId'));
    DECLARE @SessionId UNIQUEIDENTIFIER = TRY_CONVERT(UNIQUEIDENTIFIER, JSON_VALUE(@json, '$.SessionId'));

    -- Update logout timestamp
    UPDATE Users 
    SET LastLogout = GETDATE() 
    WHERE UserId = @UserId;

    -- Invalidate specific session if provided
    IF @SessionId IS NOT NULL
    BEGIN
        UPDATE UserSessions
        SET IsRevoked = 1
        WHERE SessionId = @SessionId AND UserId = @UserId;
    END
    ELSE
    BEGIN
        -- Invalidate all active sessions for user
        UPDATE UserSessions
        SET IsRevoked = 1
        WHERE UserId = @UserId AND IsRevoked = 0;
    END

    SELECT 'Logout Successful' AS Status;
END;
GO

/****** Object:  StoredProcedure [dbo].[sp_UserValidateSession] ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

-- SP: Validate active session and return authoritative Role from Users
CREATE OR ALTER PROCEDURE [dbo].[sp_UserValidateSession]
    @json NVARCHAR(MAX)
AS
BEGIN
    SET NOCOUNT ON;

    IF @json IS NULL SET @json = N'{}';
    IF (ISJSON(@json) = 0)
    BEGIN
        RAISERROR('Invalid JSON.', 16, 1);
        RETURN;
    END

    DECLARE @UserId INT = TRY_CONVERT(INT, JSON_VALUE(@json, '$.UserId'));
    DECLARE @SessionId UNIQUEIDENTIFIER = TRY_CONVERT(UNIQUEIDENTIFIER, JSON_VALUE(@json, '$.SessionId'));

    IF @UserId IS NULL OR @SessionId IS NULL
    BEGIN
        SELECT CAST(0 AS BIT) AS IsValid, CAST(NULL AS NVARCHAR(50)) AS Role, CAST(NULL AS NVARCHAR(255)) AS Email;
        RETURN;
    END

    IF EXISTS (
        SELECT 1
        FROM Users u
        INNER JOIN UserSessions s ON s.UserId = u.UserId
        WHERE u.UserId = @UserId
          AND u.IsActive = 1
          AND s.SessionId = @SessionId
          AND s.IsRevoked = 0
          AND s.ExpiresAt > GETDATE()
    )
    BEGIN
        SELECT TOP 1
            CAST(1 AS BIT) AS IsValid,
            u.Role,
            u.Email
        FROM Users u
        INNER JOIN UserSessions s ON s.UserId = u.UserId
        WHERE u.UserId = @UserId
          AND u.IsActive = 1
          AND s.SessionId = @SessionId
          AND s.IsRevoked = 0
          AND s.ExpiresAt > GETDATE();
    END
    ELSE
    BEGIN
        SELECT CAST(0 AS BIT) AS IsValid, CAST(NULL AS NVARCHAR(50)) AS Role, CAST(NULL AS NVARCHAR(255)) AS Email;
    END
END;
GO
