import os
from dotenv import load_dotenv

# Load environment variables from .env file FIRST
load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from grc.main import app as grc_app
from grc.models import init_grc_db

app = FastAPI(title="Audit Management Platform API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/grc", grc_app)

static_dir = os.path.join(os.path.dirname(__file__), "static")
if os.path.exists(static_dir):
    app.mount("/static", StaticFiles(directory=static_dir), name="static")

uploads_dir = os.path.join(os.path.dirname(__file__), "uploads")
os.makedirs(uploads_dir, exist_ok=True)


@app.on_event("startup")
def on_startup():
    try:
        init_grc_db()
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning(
            f"Database initialization skipped — {e}. "
            "Set DATABASE_URL to enable full functionality."
        )


@app.on_event("shutdown")
def on_shutdown():
    return


@app.get("/")
def root():
    return {
        "message": "Audit Management Platform API",
        "version": "1.0.0",
        "docs": "/grc/docs",
        "health": "/grc/health"
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
