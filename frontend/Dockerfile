FROM node:20-alpine AS build
WORKDIR /app
COPY frontend/package.json frontend/vite.config.js frontend/postcss.config.js frontend/tailwind.config.js frontend/index.html ./
COPY frontend/src ./src
COPY frontend/public ./public
RUN npm install
RUN npm run build

FROM nginx:alpine
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]