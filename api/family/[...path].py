"""Vercel ASGI endpoint. Paths remain /api/family/* ."""
from fastapi import FastAPI
from backend.family_serverless import FamilyAPI

app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
app.mount('/', FamilyAPI())
