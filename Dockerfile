# syntax=docker/dockerfile:1

# ---- builder --------------------------------------------------------------
# Toutes les dépendances (dev incluses, nest build en a besoin) + la
# compilation TypeScript. Cette image n'est jamais exécutée en production.
FROM node:22-slim AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# ---- runtime ---------------------------------------------------------------
# Image propre : uniquement dist/ et les dépendances de production.
#
# argon2 est un module natif compilé. On le réinstalle ICI plutôt que de
# copier node_modules du builder — un binaire natif n'est garanti correct
# que dans l'image qui l'a vu s'installer, jamais supposé compatible entre
# deux étages même construits à partir de la même base.
FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
# `prepare` installe les hooks git via husky, une dev-dependency absente
# ici — on ne touche que la copie dans l'image, jamais le package.json du
# dépôt.
#
# --omit=optional en plus de --omit=dev : typeorm déclare `typescript`
# comme peer dependency optionnelle, qu'npm installe quand même avec
# seulement --omit=dev. On ne l'utilise jamais ici (le CLI de migration
# tourne contre dist/ compilé, pas contre une source .ts).
RUN npm pkg delete scripts.prepare && npm ci --omit=dev --omit=optional

COPY --from=builder /app/dist ./dist

# Les migrations ne tournent jamais ici — elles s'appliquent à part, avec
# `npm run migration:run:prod` contre le dist/ compilé.
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
