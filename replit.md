# ComplyVerse — Audit Management Platform

## Overview
A focused audit management platform with three modules:
- **Audit Management** — Full-featured audit lifecycle: universe, plans, engagements, workpapers, findings, issue tracking, surveys, document repository, analytics, external auditor portal, audit charter, CCM, QAIP, reporting, test scripts, skill matrix, capacity planning
- **Administration** — Users, roles, permissions, audit logs, organization settings
- **ComplyChat** — AI-powered chatbot for querying GRC data via natural language

## Architecture

### Frontend (`/frontend`)
- Next.js 14 with TypeScript and Tailwind CSS
- Proxies `/api/*` requests to the backend at `http://127.0.0.1:8000/grc/*`
- Runs on port 5000 with `0.0.0.0` host binding for Replit compatibility
- Audit pages: `/audit`, `/audit/universe`, `/audit/plans`, `/audit/engagements`, `/audit/workpapers`, `/audit/findings`, `/audit/issues`, `/audit/surveys`, `/audit/documents`, `/audit/analytics`, `/audit/portal`, `/audit/charter`, `/audit/ccm`, `/audit/reporting`, `/audit/qaip`, `/audit/test-scripts`, `/audit/skill-matrix`, `/audit/capacity`, `/audit/notifications`
- Other pages: `/admin`, `/complychat`, `/login`

### Backend (`/backend`)
- FastAPI application served by Uvicorn on port 8000
- GRC module mounted at `/grc`
- Active backend modules: `audit_management`, `chatbot`
- Active routers: `auth_router`, `tenants_router`, `admin_router`

## Workflows
- **Start application** — `cd frontend && npm run dev` (port 5000, webview)
- **Backend API** — `cd backend && python3 main.py` (port 8000, console)

## Required Environment Variables
| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string (required for data persistence) |
| `AI_INTEGRATIONS_OPENAI_API_KEY` | Replit built-in OpenAI key (set automatically via blueprint) |
| `AI_INTEGRATIONS_OPENAI_BASE_URL` | Replit OpenAI base URL (set automatically via blueprint) |
| `SESSION_SECRET` | Secret key for session management |

## Key Files
- `frontend/next.config.js` — Next.js config with API proxy rules
- `frontend/src/lib/api.ts` — API client with `auditApi`, `adminApi`, `assetsApi`, `tenantAuthApi`
- `frontend/src/components/layout/Sidebar.tsx` — Navigation (Audit Management, ComplyChat, Administration)
- `backend/main.py` — FastAPI application entry point
- `backend/grc/main.py` — GRC module registration
- `backend/grc/models.py` — Database models and startup initialization
- `backend/grc/seed_frameworks.py` — Framework seeding (runs on startup)

## Notes
- App starts at `/audit` — the legacy `/dashboard` has been permanently removed
- The backend starts gracefully without a database (skips DB init if `DATABASE_URL` is not set)
- AI features use Replit's built-in OpenAI integration with fallback to `OPENAI_API_KEY`
- Startup seeding is minimal: only framework data is seeded (all other module seed files removed)

## Bug Fixes Applied
- **422 on engagement create**: AI scope generator returned `objectives` as a JSON array. Fixed with Pydantic `field_validator` coercing list→string in `EngagementCreate`/`EngagementUpdate`, and `_coerce_text_fields()` in AI endpoints. Frontend also guards with `toStr()`.
- **500 on finding create**: `suggest_finding_details()` returns `None` when AI unavailable. Fixed all 3 call sites in `findings.py` with `or {}` fallback.
- **Chatbot crash when AI unavailable**: `generate_sql_query()` can return `None`. Fixed with `or {}` fallback in `chatbot/router.py`.
- **422 error logging**: `RequestValidationError` handler in `backend/grc/main.py` logs the failing field, error type, and request body.

## Removed Modules
The following modules were removed (frontend pages, backend code, and seed files):
- ERM (risks, assessments, KRIs, incidents)
- Control Library (frameworks, controls, gap analysis, mappings)
- Governance (documents, workflows, committees, policy exceptions)
- Evidence Management
- Compliance (assessments, certifications)
- Framework Upload
- Vulnerability Management
- Workflow Engine
- Integrations
- Vendor Risk Management
- Assets, IS Projects, Critical Tasks, Dashboard
