FROM node:20-bullseye

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

RUN mkdir -p /app/data /app/logs

EXPOSE 4000

CMD ["node", "server.js"]