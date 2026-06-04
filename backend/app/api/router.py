from fastapi import APIRouter

from app.api.routers import auth, incidents, planning, resources, users

api_router = APIRouter()
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(users.router, prefix="/users", tags=["users"])
api_router.include_router(resources.router, prefix="/resources", tags=["resources"])
api_router.include_router(planning.router, tags=["planning"])
api_router.include_router(incidents.router, prefix="/incidents", tags=["incidents"])
