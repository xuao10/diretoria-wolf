FROM nginx:alpine
# Copy static files to nginx html directory
COPY . /usr/share/nginx/html

# Gzip compression for faster loading
RUN echo "gzip on; gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript; gzip_min_length 1000;" > /etc/nginx/conf.d/gzip.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
