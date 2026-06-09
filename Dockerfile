# --- Stage 1: Build Stage (Installing Dependencies) ---
FROM node:20-slim AS builder

# Set the working directory inside the container
WORKDIR /app

# Copy package.json and package-lock.json to install dependencies
# This step is crucial for Docker layer caching
COPY package*.json ./

# Install production dependencies
# The --omit=dev flag prevents unnecessary development packages from being installed
RUN npm install --omit=dev

# --- Stage 2: Production Stage (Final, Lean Image) ---
FROM node:20-slim AS production

# Set the working directory
WORKDIR /app

# Copy installed node_modules from the builder stage
COPY --from=builder /app/node_modules ./node_modules

# Copy the rest of the application source code
# This copies server.js, and the src/ directory
COPY . .

# Cloud Run always expects containers to listen on the PORT environment variable,
# which defaults to 8080. Ensure your server.js uses process.env.PORT.
EXPOSE 8080

# The command to run your application when the container starts
CMD ["node", "server.js"]