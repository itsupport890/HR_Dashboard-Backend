# Production Dockerfile for HR Dashboard Backend
FROM node:18-alpine

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies (use package-lock for reproducible installs)
COPY package*.json ./
COPY serviceAccountKey.json ./
RUN npm ci --only=production

# Copy source
COPY . .

# Do NOT embed service account credentials in the image.
# Provide credentials at runtime instead, for example:
#  - Mount the JSON file and set `GOOGLE_APPLICATION_CREDENTIALS=/secrets/serviceAccountKey.json`
#  - Or set `FIREBASE_SERVICE_ACCOUNT` from CI/CD secrets (never commit it)

ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

CMD ["npm", "start"]
