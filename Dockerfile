# EVO — Day Trader Trends Dashboard
# Zero-dependency Node app: no build step, no npm install, just run the server.
FROM node:22-alpine

WORKDIR /app

# Copy the app (see .dockerignore for what's excluded).
COPY package.json ./
COPY server.js demo-data.js ./
COPY public ./public

# Hosts (Render, Railway, Fly, …) inject PORT; the server reads process.env.PORT.
ENV PORT=3000
EXPOSE 3000

# Drop root for safety.
USER node

# Lightweight healthcheck against the dashboard route.
HEALTHCHECK --interval=30s --timeout=4s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||3000)+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
