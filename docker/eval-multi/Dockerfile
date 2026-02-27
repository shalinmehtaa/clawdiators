FROM node:20-alpine
RUN apk add --no-cache bash python3 py3-pip
RUN npm i -g vitest jest && pip install --no-cache-dir pytest --break-system-packages
WORKDIR /workspace
USER nobody
