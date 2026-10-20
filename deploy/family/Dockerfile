FROM python:3.12-slim
WORKDIR /app
COPY backend/requirements-family.txt /app/requirements.txt
RUN pip install --no-cache-dir -r requirements.txt && useradd --uid 10001 --create-home bluey && mkdir /data && chown bluey:bluey /data
COPY backend /app/backend
USER bluey
ENV BLUEY_FAMILY_DB=/data/family.sqlite PORT=8767
EXPOSE 8767
CMD ["python", "-m", "backend.family_service"]
