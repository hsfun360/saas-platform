# Project Context & Engineering Standards - Login API

## 🎯 Project Overview
- **Tech Stack:** Node.js (TypeScript), Docker, PostgreSQL.
- **Core Functionality:** RESTful Authentication API, password hashing, JWT payload generation, and database validation.

## 🛠️ Development Workflows
- **Start dev server:** `npm run dev` or `nodemon`
- **Production build:** `npm run build`
- **Run test suite:** `npm run test`
- **Database migrations:** [e.g., db-migrate up / node-pg-migrate]
- **Build Container:** `docker build -t login-api .`
- **Run Container Locally:** `docker run -p 8080:8080 --env-file .env login-api`
- **Deploy to Cloud Run:** `gcloud run deploy login-api --source . --allow-unauthenticated`
