FROM apify/actor-node:22
COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY . ./
CMD ["npm", "start"]
