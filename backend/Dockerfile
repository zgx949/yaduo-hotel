FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
COPY sdk ./sdk
RUN npm ci

COPY . .

RUN npx prisma generate

EXPOSE 8787

CMD ["sh", "-c", "npx prisma migrate deploy && npm start"]
