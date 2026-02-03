from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import dataset, benchmark, results

app = FastAPI(title="Hot Dog or Not - LLM Vision Benchmark")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001", "http://localhost:3002", "http://localhost:3005", "http://hotdog.local"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(dataset.router)
app.include_router(benchmark.router)
app.include_router(results.router)


@app.get("/api/models")
def get_models():
    from config import MODELS
    from models import ModelInfo

    return [ModelInfo(**m) for m in MODELS]


@app.get("/")
def root():
    return {"message": "Hot Dog or Not API", "docs": "/docs"}
