# Validation Checklist (AcerMepApp Mirroring + SKTOP Blueprint)

Reference project: `C:\Users\gbidev\source\repos\AcerMepApp`  
SKTOP blueprint source: `SKTOP\Documents\sktop_webprofile.html`

## A. Folder Hierarchy Parity (Top-Level)

- [ ] `Controllers/` exists
- [ ] `Models/` exists
- [ ] `Views/` exists (`Views/Shared/` included)
- [ ] `wwwroot/` exists (`css/`, `js/`, `images/`)
- [ ] `Properties/` exists
- [ ] `documents/` exists
- [ ] `.config/` exists (dotnet tool manifest parity)
- [ ] `package.json` and `tailwind.config.js` exist (build-manifest parity)

## B. Template Parity (SKTOP Blueprint)

- [ ] `Views/Home/Index.cshtml` contains:
  - [ ] `<!DOCTYPE html>` and `<html lang="en">`
  - [ ] `<meta charset="UTF-8">` and viewport meta in the same order as `sktop_webprofile.html`
  - [ ] Head load order: Tailwind CDN script → Alpine defer script → Font Awesome CSS link
  - [ ] Body uses the same `class="bg-gray-50 font-sans antialiased text-slate-900 flex flex-col min-h-screen"`
  - [ ] Alpine `x-data="{ ... }"` state shape and event-binding style (`@click`, `@submit.prevent`, `x-show`, `x-cloak`)

## C. CSS Parity (SKTOP Blueprint)

- [ ] `wwwroot/css/sktop.css` includes the same selector names and specificity as the inline `<style>` in `sktop_webprofile.html`:
  - [ ] `[x-cloak]`
  - [ ] `.bg-sktop-silver`
  - [ ] `.hero-overlay`
  - [ ] `::-webkit-scrollbar` and `::-webkit-scrollbar-thumb`
  - [ ] `.whatsapp-float` and `.whatsapp-float:hover`

## D. JavaScript Pattern Parity

- [ ] `Views/Home/Index.cshtml` uses Alpine directives for state + event handling (same architectural pattern as `sktop_webprofile.html`)
- [ ] `wwwroot/js/site.js` wraps logic in an IIFE and binds global events using `addEventListener` (same event-binding strategy family as the reference)

## E. File Counterpart Mapping (Best-Effort)

This solution focuses on mirroring the *organizational conventions* (MVC + wwwroot + Tailwind manifest) found in AcerMepApp while implementing the *UI template blueprint* from SKTOP.

| SktopApp file | Closest AcerMepApp counterpart |
|---|---|
| `Program.cs` | `AcerMepApp/Program.cs` |
| `SktopApp.csproj` | `AcerMepApp/AcerMepApp.csproj` |
| `Controllers/HomeController.cs` | `AcerMepApp/Controllers/HomeController.cs` |
| `Controllers/AccountController.cs` | `AcerMepApp/Controllers/AccountController.cs` |
| `.config/dotnet-tools.json` | `AcerMepApp/.config/dotnet-tools.json` |
| `Services/SelectionDropdownService.cs` | `AcerMepApp/Services/SelectionDropdownService.cs` |
| `Services/ReferenceDataService.cs` | `AcerMepApp/Services/ReferenceDataService.cs` |
| `Services/UrlIdProtector.cs` | `AcerMepApp/Services/UrlIdProtector.cs` |
| `Views/Shared/_Layout.cshtml` | `AcerMepApp/Views/Shared/_Layout.cshtml` |
| `Views/Home/Index.cshtml` | `AcerMepApp/Views/Home/Index.cshtml` (intentionally diverges to match SKTOP blueprint) |
| `wwwroot/css/site.css` | `AcerMepApp/wwwroot/css/site.css` |
| `package.json` | `AcerMepApp/package.json` |
| `tailwind.config.js` | `AcerMepApp/tailwind.config.js` |
