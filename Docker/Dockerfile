FROM python:3.11-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /srv/app

# Install runtime dependencies, primarily libpq for psycopg.
RUN apt-get update \
    && apt-get install --yes --no-install-recommends libpq5 \
    && rm -rf /var/lib/apt/lists/*

COPY ssw-flask/requirements.txt ./requirements.txt
RUN pip install --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt

COPY ssw-flask ./

EXPOSE 8000

CMD ["gunicorn", "app:create_app()", "--bind", "0.0.0.0:8000", "--worker-class", "sync", "--workers", "3"]
