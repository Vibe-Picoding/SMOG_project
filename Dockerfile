FROM nginx:alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html /usr/share/nginx/html/index.html
COPY assets /usr/share/nginx/html/assets
COPY SMOG_woordenlijst_basis.pdf /usr/share/nginx/html/SMOG_woordenlijst_basis.pdf

EXPOSE 8080