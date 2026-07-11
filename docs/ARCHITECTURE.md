# Architecture Overview

Open Gauge is designed around a modern monolith paradigm with separated frontend and backend applications for scalability and maintainability.

## Backend (FastAPI)
- Uses FastAPI with Python for high performance and standard OpenAPI schema generation.
- SQLAlchemy for ORM.
- PostgreSQL as the strict single source of truth for all structured data.
- Alembic to manage database migrations cleanly.

## Frontend (Next.js)
- Next.js using the App Router for server-rendered interactions where possible, and client-side logic only where needed.
- Tailwind CSS and shadcn/ui for consistent, accessible, and fast UI development.

## Infrastructure
- **PostgreSQL**: Relational data, user configurations, and calibration history.
- **MinIO**: S3-compatible object storage for file uploads, calibration certificates, and external documents.
- Everything runs inside a simple Docker Compose stack for easy self-hosting out of the box.