# SktopApp

This project is a standalone ASP.NET Core MVC web application that uses the UI structure and client-side interaction style from `SKTOP\Documents\sktop_webprofile.html` as the primary HTML/CSS/JS blueprint, while adopting the high-level project organization patterns observed in the reference solution under `C:\Users\gbidev\source\repos\AcerMepApp` (Controllers/Models/Views/wwwroot + Tailwind build manifest).

## Mirrored Structure (High-Level)

- `Controllers/` MVC controllers (server routes)
- `Models/` view-models and shared models
- `Views/` Razor templates (`Views/Home/Index.cshtml` contains the SKTOP single-page UI)
- `wwwroot/` static assets (CSS/JS/images)
- `documents/` project notes, local run instructions, and validation checklist
- `package.json`, `tailwind.config.js` Tailwind CLI manifest matching the reference toolchain pattern
- `ClientApp/react-app/` React (Vite) app built into `wwwroot/js/` (same pattern as AcerMepApp)

## How To Run Locally

### 1) Run the web application

From `SktopApp/`:

- `dotnet run --project SktopApp.csproj`

Then open:

- `http://localhost:5180/`

### 2) Build the frontend assets (Tailwind + React)

From `SktopApp/`:

- `npm install`
- `npm run build`

## Where The SKTOP Blueprint Lives

- Main template: `Views/Home/Index.cshtml`
- Custom SKTOP CSS: `wwwroot/css/sktop.css`
- Custom JS module (IIFE pattern): `wwwroot/js/site.js`
