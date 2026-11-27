FROM --platform=linux/amd64 python:3.12-slim
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1
RUN useradd --create-home --uid 10001 app
WORKDIR /app
COPY server.py .
USER app
EXPOSE 8080
CMD ["python","server.py"]
