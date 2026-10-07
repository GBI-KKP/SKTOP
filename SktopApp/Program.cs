namespace SktopApp;

public class Program
{
    public static void Main(string[] args)
    {
        var builder = WebApplication.CreateBuilder(args);

        builder.Services.AddControllersWithViews();
        builder.Services.AddMemoryCache();
        builder.Services.AddHttpClient();
        builder.Services.AddDataProtection();
        builder.Services.AddSingleton<SktopApp.Services.SelectionDropdownService>();
        builder.Services.AddSingleton<SktopApp.Services.ReferenceDataService>();
        builder.Services.AddSingleton<SktopApp.Services.UrlIdProtector>();

        builder.Services.AddAuthentication(Microsoft.AspNetCore.Authentication.Cookies.CookieAuthenticationDefaults.AuthenticationScheme)
            .AddCookie(options =>
            {
                options.LoginPath = "/Account/Login";
                options.LogoutPath = "/Account/Logout";
                options.AccessDeniedPath = "/Account/AccessDenied";
                options.ExpireTimeSpan = TimeSpan.FromHours(8);
                options.SlidingExpiration = true;
            });

        builder.Services.AddAuthorization(options =>
        {
            options.AddPolicy("AdminOnly", policy => policy.RequireRole("Admin"));
            options.AddPolicy("CustomerOnly", policy => policy.RequireRole("Customer"));
        });

        var app = builder.Build();

        var pathBase = Environment.GetEnvironmentVariable("ASPNETCORE_PATHBASE")
                    ?? builder.Configuration["PathBase"];

        if (!string.IsNullOrEmpty(pathBase))
        {
            pathBase = pathBase.Trim();
            if (!pathBase.StartsWith("/"))
            {
                pathBase = "/" + pathBase;
            }
            if (pathBase.EndsWith("/") && pathBase.Length > 1)
            {
                pathBase = pathBase.TrimEnd('/');
            }

            app.UsePathBase(pathBase);
        }

        if (!app.Environment.IsDevelopment())
        {
            app.UseExceptionHandler("/Home/Error");
            app.UseHsts();
        }

        app.UseHttpsRedirection();
        app.UseStaticFiles();

        app.UseRouting();
        app.UseAuthentication();
        app.UseMiddleware<SktopApp.Middleware.SessionRoleValidationMiddleware>();
        app.UseAuthorization();

        app.MapControllerRoute(
            name: "default",
            pattern: "{controller=Home}/{action=Index}/{id?}");

        app.Run();
    }
}
