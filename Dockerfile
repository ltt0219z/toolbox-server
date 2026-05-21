FROM node:18-alpine
RUN apk add --no-cache ca-certificates
ENV NODE_OPTIONS=--use-openssl-ca
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
EXPOSE 3000
CMD ["node", "app.js"]
