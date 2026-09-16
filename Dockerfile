FROM node:24-bookworm-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY *.js ./
COPY *.png ./
RUN mkdir -p /app/data && chown -R node:node /app/data
USER node
CMD ["node", "index.js"]
