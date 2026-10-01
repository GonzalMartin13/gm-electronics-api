FROM node:24-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-fund
COPY src ./src
COPY scripts/migrate.js scripts/load-seed.js ./scripts/
COPY database ./database
COPY data ./data
COPY scripts/prepare-images.js ./scripts/
RUN node scripts/prepare-images.js
USER node
EXPOSE 3000
CMD ["node", "src/server.js"]
