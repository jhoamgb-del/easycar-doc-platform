# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

EasyCar Document Platform is a single-page web application (SPA) that enables EasyCar dealership staff to fill in and print sales documents in bulk. The application runs entirely in the browser with optional Supabase backend integration for persistence.

**Key characteristics:**
- 629-line monolithic `index.html` file containing all HTML, CSS, and JavaScript
- 10 document types (GPS Disclosure, Credit Application, Maintenance Package, etc.)
- Form-driven UI that populates multiple document templates from a single form
- Print-optimized layout for letter-size pages
- Built with Vite for development and static deployment

## Quick Start Commands

```bash
# Install dependencies
npm install

# Start dev server (accessible at http://127.0.0.1:5173)
npm run dev

# Build for production (outputs to /dist)
npm run build

# Preview production build locally
npm run preview
```

## Architecture & Data Flow

### Single-File Application Structure
The entire application lives in `index.html` with three main sections:

1. **Header** - EasyCar branding and navigation
2. **Input Panel** - Form with customer, vehicle, and transaction details
3. **Documents Section** - Print-ready document templates

### Form Data Model
Form inputs are organized in a 3-column grid layout with these main sections:
- **Customer Info**: first_name, last_name, second_last_name, co_buyer_name, address, city, state, zip_code, email, phone, driver_license
- **Vehicle Info**: vin, vehicle_year, vehicle_make, vehicle_model, stock_number
- **Transaction Details**: contract_number, transaction_date, sales_rep_name
- **Document-Specific Fields**: payment schedules, signature states, etc.

Form values are automatically read from input elements using their `id` attribute as the source. When users fill the form, JavaScript automatically populates all documents in real-time.

### Document System
Documents are HTML templates embedded in the page with:
- Data placeholders using `{field_name}` syntax (e.g., `{first_name}`, `{vehicle_make}`)
- Conditional sections: `{if_field_name}...{/if_field_name}` for showing/hiding content
- Table templates with repeating rows: `{table_name:field1, field2, field3}`

The rendering engine:
1. Reads all form inputs into a JavaScript object
2. Iterates through document templates
3. Replaces placeholders with corresponding form values
4. Processes conditionals based on field presence/value
5. Renders tables from schedule/list data

### Print Workflow
- Documents use CSS `@media print` rules for page-break handling
- Each document is set to `page-break-after: always` except the last one
- Print layout uses 0.32in margins and exact color preservation
- Responsive design collapses 3-column grid to 1 column on mobile

## Supabase Integration

### Optional Backend Storage
If `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` environment variables are set, the application can save data to Supabase.

### Database Schema (supabase/schema.sql)
Three main tables with Row Level Security (RLS) enabled:

```sql
customers
  - id (UUID, primary key)
  - first_name, last_name, second_last_name, co_buyer_name
  - address, city, state, zip_code
  - email, phone, driver_license
  - created_at
  - Index: idx_customers_phone

vehicles
  - id (UUID, primary key)
  - customer_id (foreign key)
  - vin, vehicle_year, vehicle_make, vehicle_model, stock_number
  - created_at
  - Index: idx_vehicles_vin

document_sessions
  - id (UUID, primary key)
  - customer_id, vehicle_id (foreign keys)
  - contract_number, transaction_date, sales_rep_name
  - form_data (JSONB - stores entire form state)
  - created_at
  - Index: idx_document_sessions_created_at
```

All tables have policies allowing anonymous and authenticated users to INSERT data (for client-side form submission).

### Supabase Setup Steps
1. Create a Supabase project
2. Apply `supabase/schema.sql` to create tables
3. Set environment variables in Vercel dashboard:
   - `VITE_SUPABASE_URL`: Your Supabase project URL
   - `VITE_SUPABASE_ANON_KEY`: Your anon public key
4. The application uses `window.supabase` client initialized with these variables

## Deployment

### Vercel Configuration (vercel.json)
- Framework: Vite
- Build command: `npm run build`
- Output directory: `dist`
- SPA rewrites: All routes redirect to `/index.html` for client-side routing

### Environment Variables
Required for Supabase integration (optional):
```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key
```

### Version Management
- Current version: 1.0.0
- Package is private (not published to npm)

## Development Patterns

### Adding a New Document
1. Add HTML template to the documents section with class `doc`
2. Use `{field_name}` for placeholders
3. Use `{if_field_name}...{/if_field_name}` for conditionals
4. Test with the dev server: placeholder values should update in real-time as form fields change

### Adding New Form Fields
1. Add `<input>` or `<select>` element in the form grid with a unique `id`
2. The JavaScript automatically reads the field based on `id` name
3. Reference it in documents using `{id_name}` or `{if_id_name}` conditionals

### Testing Changes
The dev server auto-reloads on file changes. Test print output using browser print preview or Ctrl+P/Cmd+P. The CSS `@media print` rules handle page breaks and color preservation.

## Important Notes

### Current Limitations
- All code is in a single 629-line HTML file (no separate JS or CSS files)
- No build-time bundling of JavaScript (Vite serves assets directly in dev)
- Supabase integration is basic (insert-only, no read/update/delete policies)
- No authentication or access control (all saves are public)
- Admin history and sales search features are noted as future work in README.md

### Browser Compatibility
Standard modern browser requirements. Uses:
- ES6+ JavaScript features
- CSS Grid and Flexbox
- localStorage (for form state persistence)
- Fetch API (for Supabase requests)

### File Structure
```
/
├── index.html           # Main application (monolithic)
├── public/index.html    # Copy for static serving
├── supabase/schema.sql  # Database schema
├── vercel.json          # Deployment config
├── package.json         # Dependencies (only Vite)
└── dist/                # Built output (after npm run build)
```

## Git Workflow

The repository uses conventional commits. Recent changes have focused on:
- Document layout and print optimization
- Auto-fill improvements for dates and vehicle info
- New document additions (Conditional Delivery, Communication Authorization, Credit Application)
- Supabase integration preparation

When making changes:
1. Keep commits focused on single features (e.g., "Add credit application document" rather than mixing docs with styling changes)
2. Test print layout changes across all documents (documents may break if CSS is modified)
3. When adding Supabase features, consider backwards compatibility with offline mode

## Future Enhancements (From README)

These features are planned but not yet implemented:
- Admin dashboard with sales history
- Search/lookup functionality for existing sales
- Controlled access (authentication)
- Advanced reporting

For now, focus on expanding the document library and improving form usability.
