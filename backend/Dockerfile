FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

RUN npx prisma generate

EXPOSE 8787

CMD ["sh", "-c", "npx prisma db push && npm run prisma:seed && npm start"]
