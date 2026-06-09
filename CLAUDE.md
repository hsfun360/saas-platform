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

## 📐 Coding Guidelines & Architecture
- **Security:** Use bcrypt/argon2 for password hashing. Validate all incoming payloads using a schema validation layer (e.g., Zod).
- **Querying & Architecture:** Strictly use the Repository pattern or a Data Access Layer. Keep all database logic and raw SQL completely isolated from controllers. 
- **Port Binding:** The server must listen on `process.env.PORT` to comply with Cloud Run requirements.
- **Error Handling:** Centralized async middleware to catch errors. Return unified JSON payloads: `{ error: string, details?: any }`.
- **Naming Conventions:** CamelCase for routes and parameters, PascalCase for controllers/classes.

## 🛑 Project Constraints & Anti-Patterns
- **Do NOT:** Save plain-text passwords or log JWT tokens to the console.
- **Do NOT:** Write inline raw PostgreSQL queries directly into Express routes.
- **Do NOT:** Store state, sessions, or files on the local container filesystem (Cloud Run is stateless and ephemeral).
- **Type Safety:** The `any` type is strictly forbidden. All raw PostgreSQL responses must be parsed and mapped to precise TypeScript interfaces (consider using Zod or a type-safe query builder like Kysely).