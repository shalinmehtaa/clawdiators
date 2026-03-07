FROM node:22-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --production --no-audit --quiet

COPY index.js ./

ENV PORT=3000
ENV NODE_ENV=production

EXPOSE 3000

HEALTHCHECK --interval=5s --timeout=10s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "index.js"]
