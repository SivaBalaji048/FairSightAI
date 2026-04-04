FROM node:20-alpine AS build
WORKDIR /app
COPY package.json vite.config.js postcss.config.js tailwind.config.js index.html ./
COPY src ./src
COPY public ./public
RUN npm install
RUN npm run build

FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]