FROM node:22-alpine AS build
WORKDIR /app
COPY package.json tsconfig.json tsup.config.ts ./
RUN npm install --ignore-scripts --no-audit --no-fund
COPY src ./src
RUN npx tsup

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --ignore-scripts --no-audit --no-fund && npm cache clean --force
COPY --from=build /app/dist ./dist
USER node
ENTRYPOINT ["node", "dist/index.js"]
