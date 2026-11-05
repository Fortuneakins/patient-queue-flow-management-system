FROM python:3.13.15-slim-trixie

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1
WORKDIR /app

COPY analytics_service/requirements-production.txt ./requirements-production.txt
COPY analytics_service/requirements.txt ./requirements.txt
RUN python -m pip install --upgrade pip \
    && python -m pip install -r requirements-production.txt

COPY analytics_service ./analytics_service

RUN useradd --system --create-home --uid 10001 analytics \
    && chown -R analytics:analytics /app
USER analytics

ENV NODE_ENV=production ANALYTICS_PORT=5001 ANALYTICS_BIND_HOST=0.0.0.0
EXPOSE 5001
CMD ["gunicorn", "--bind", "0.0.0.0:5001", "--workers", "2", "--threads", "4", "--timeout", "15", "--access-logfile", "-", "--error-logfile", "-", "analytics_service.app:app"]
