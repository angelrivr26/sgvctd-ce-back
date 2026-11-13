# 1. Usar una imagen base ligera con el entorno necesario
FROM node:20-alpine

# 2. Definir el directorio de trabajo dentro del contenedor
WORKDIR /app

# 3. Copiar archivos de dependencias e instalarlas
COPY package*.json ./
RUN npm i

# 4. Copiar el resto del código fuente
COPY . .

# 5. Exponer el puerto en el que corre tu API
EXPOSE 4005

# 6. Comando para iniciar el servidor
CMD ["npm", "run", "dev"]
