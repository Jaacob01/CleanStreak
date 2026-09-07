from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from fastapi import HTTPException, status
from app.models.models import User
from app.utils.security import hash_password, verify_password, create_access_token


async def register(db: AsyncSession, username: str, password: str) -> dict:
    result = await db.execute(select(User).where(User.username == username))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="用户名已存在")
    user = User(username=username, password_hash=hash_password(password), role="user")
    db.add(user)
    await db.flush()
    token = create_access_token(user.id)
    return {"id": user.id, "username": user.username, "role": user.role, "created_at": user.created_at, "token": token}


async def login(db: AsyncSession, username: str, password: str) -> dict:
    result = await db.execute(select(User).where(User.username == username))
    user = result.scalar_one_or_none()
    if not user or not verify_password(password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="用户名或密码错误")
    token = create_access_token(user.id)
    return {"id": user.id, "username": user.username, "role": user.role, "created_at": user.created_at, "token": token}


async def change_password(db: AsyncSession, user: User, old_password: str, new_password: str):
    if not verify_password(old_password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="原密码错误")
    user.password_hash = hash_password(new_password)
    await db.flush()
