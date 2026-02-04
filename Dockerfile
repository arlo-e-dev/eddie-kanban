FROM node:20-slim

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy server code and data
COPY server.js ./
COPY board-data.json ./

# Copy frontend build
COPY public ./public

EXPOSE 8080

CMD ["node", "server.js"]
