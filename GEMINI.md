# Project Context & Engineering Standards - Login API

## 🎯 Project Overview
* **Tech Stack:** Node.js (TypeScript), Docker, PostgreSQL. 
* **IDE Setup:** VS Code is the designated development environment.
* **Core Functionality:** RESTful Authentication API, password hashing, JWT payload generation, and database validation.

## 🛠️ Development Workflows
* **Start dev server:** `npm run dev` or `nodemon`
* **Production build:** `npm run build`
* **Run test suite:** `npm run test`
* **Database migrations:** Manage schema changes using agnostic migration tools (e.g., db-migrate up / node-pg-migrate).
* **Build Container:** `docker build -t login-api .`
* **Run Container Locally:** `docker run -p 8080:8080 --env-file .env login-api`
* **Deploy to Cloud Run:** `gcloud run deploy login-api --source . --allow-unauthenticated`

## 📐 Coding Guidelines & Architecture
* **Security:** Implement bcrypt or argon2 for password hashing. Ensure all incoming payloads are validated using a schema validation layer (e.g., Zod).
* **Querying & Architecture (High Performance):** Heavy ORMs (like TypeORM or Prisma) are strictly prohibited to reduce processing overhead and maximize query speed. Use raw parameterized SQL or a lightweight query builder. Strictly use the Repository pattern or a Data Access Layer to keep all database logic and SQL statements isolated from the controllers.
* **Port Binding:** To comply with Cloud Run constraints, the server must securely bind to `process.env.PORT`.
* **Error Handling:** Use centralized async middleware to catch all errors. All responses must return unified JSON payloads in the format: `{ error: string, details?: any }`.
* **Naming Conventions:** Apply CamelCase for routes and parameters, and use PascalCase for controllers and classes.

## 🛑 Project Constraints & Anti-Patterns
* **Do NOT:** Log JWT tokens to the console or save plain-text passwords.
* **Do NOT:** Write inline raw database queries directly into Express routes.
* **Do NOT:** Store files, state, or sessions on the local container filesystem, as the Cloud Run environment is ephemeral and stateless.
* **Type Safety:** The use of the `any` type is strictly forbidden. Since we are bypassing ORMs, all raw database responses must be explicitly parsed and mapped to precise TypeScript interfaces (e.g., using Zod or a type-safe query builder like Kysely) to guarantee runtime safety.