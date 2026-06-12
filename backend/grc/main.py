import logging
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.responses import Response
from .models import init_grc_db
from .audit_logger import should_audit_request, parse_request_payload, write_audit_log
from .routers import auth_router, tenants_router
from .routers.admin_router import router as admin_router
from .modules.audit_management import audit_management_router
from .modules.chatbot import chatbot_router
from .middleware.subdomain import TenantMiddleware

logger = logging.getLogger(__name__)

app = FastAPI(
    title="Audit Management Platform API",
    description="Independent audit management platform with administration and ComplyChat",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_middleware(TenantMiddleware)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    body = None
    try:
        body = await request.body()
        body = body.decode("utf-8")
    except Exception:
        pass
    logger.error(
        "422 Validation error on %s %s — errors: %s — body: %s",
        request.method, request.url.path, exc.errors(), body
    )
    return JSONResponse(status_code=422, content={"detail": exc.errors()})


@app.middleware("http")
async def audit_log_middleware(request: Request, call_next):
    if not should_audit_request(request):
        return await call_next(request)

    import time
    started_at = time.time()

    request_payload = None
    if request.method.upper() not in {"GET", "DELETE", "HEAD", "OPTIONS"}:
        body = await request.body()
        received = False

        async def receive():
            nonlocal received
            if received:
                return {"type": "http.request", "body": b"", "more_body": False}
            received = True
            return {"type": "http.request", "body": body, "more_body": False}

        request._receive = receive
        request_payload = await parse_request_payload(request, body)

    try:
        response = await call_next(request)
        write_audit_log(request, response, started_at, request_payload)
        return response
    except Exception:
        write_audit_log(request, Response(status_code=500), started_at, request_payload)
        raise

app.include_router(auth_router)
app.include_router(admin_router)
app.include_router(tenants_router)
app.include_router(chatbot_router)
app.include_router(audit_management_router)


@app.on_event("startup")
def on_startup():
    init_grc_db()


@app.on_event("shutdown")
def on_shutdown():
    return


@app.get("/")
def root():
    return {
        "message": "Audit Management Platform API",
        "version": "1.0.0",
        "modules": [
            "audit-management",
            "administration",
            "complychat"
        ]
    }


@app.get("/health")
def health_check():
    return {"status": "healthy"}
