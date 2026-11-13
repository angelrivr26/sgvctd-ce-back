FROM node:20-alpine

# Hora de Perú para los comprobantes SUNAT
RUN apk add --no-cache tzdata && \
    cp /usr/share/zoneinfo/America/Lima /etc/localtime

ENV NODE_ENV=production
WORKDIR /app

# Instalar dependencias saltando el script preinstall
COPY package*.json ./
RUN npm install --ignore-scripts

# Copiar código y usar usuario seguro
COPY --chown=node:node . .
RUN chown -R node:node /app
USER node

EXPOSE 4005

CMD ["node", "src/index.js"]
