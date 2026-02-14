FROM node:20-alpine

RUN apk add --no-cache openssl

WORKDIR /app

# Install deps first (cached layer)
COPY package.json package-lock.json* ./
RUN npm install

# Copy source
COPY . .

# Generate Prisma client
RUN npx prisma generate

EXPOSE 3000

CMD ["npm", "run", "dev"]
