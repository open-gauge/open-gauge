from fastapi import FastAPI
from fastapi.responses import JSONResponse

app = FastAPI(
    title="MAR API",
    description="Measurement Asset Registry API",
    version="0.1.0",
)

@app.get("/health", tags=["Health"])
def health_check():
    """
    Health check endpoint to verify the API is running.
    """
    return JSONResponse(content={"status": "ok", "service": "MAR API"})
