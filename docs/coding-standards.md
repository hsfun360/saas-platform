# Coding Standards & Architecture - Login API

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
