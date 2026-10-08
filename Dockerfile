FROM python:3.12-slim
WORKDIR /app
COPY server.py /app/server.py
COPY web /app/web
RUN useradd --uid 10001 --create-home reading
USER 10001
EXPOSE 8766
CMD ["python", "server.py", "--host", "0.0.0.0", "--port", "8766"]
