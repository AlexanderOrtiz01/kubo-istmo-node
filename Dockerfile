# Istmo Express · API REST de rastreo (stack moderno: Node.js + Express + PostgreSQL)
# Kubo construye esta imagen en cada git push y la despliega sin root (Pod Security "restricted").
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY src ./src
COPY public ./public
# La conexión (DATABASE_URL) la inyecta Kubo desde el Secret de la base administrada: no va aquí
USER 1000
EXPOSE 3000
CMD ["node", "src/servidor.js"]
