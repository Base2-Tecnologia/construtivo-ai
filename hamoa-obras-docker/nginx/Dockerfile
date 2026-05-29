FROM nginx:1.25-alpine

# O contexto do build é hamoa-obras-docker/ (um nível acima deste Dockerfile).
# Isso permite copiar tanto os arquivos estáticos quanto as configs de nginx/.

# Arquivos estáticos do frontend (SPA + Portal)
COPY app /usr/share/nginx/html

# Configuração global do Nginx
COPY nginx/nginx.conf /etc/nginx/nginx.conf

# Template do virtual host — a imagem oficial do Nginx processa automaticamente
# /etc/nginx/templates/*.template via envsubst antes de iniciar.
# As variáveis ${API_HOST} e ${API_PORT} são injetadas pelo ECS Task Definition.
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template

EXPOSE 80
