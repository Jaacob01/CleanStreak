import redis.asyncio as redis
from app.config import settings

redis_pool: redis.Redis | None = None


async def init_redis():
    global redis_pool
    redis_pool = redis.from_url(settings.redis_url, decode_responses=True)


async def close_redis():
    global redis_pool
    if redis_pool:
        await redis_pool.close()


async def get_redis() -> redis.Redis | None:
    return redis_pool


async def invalidate_user_cache(user_id: int):
    """清除用户所有统计缓存"""
    if not redis_pool:
        return
    cursor = 0
    while True:
        cursor, keys = await redis_pool.scan(cursor, match=f"stats:{user_id}:*", count=100)
        if keys:
            await redis_pool.delete(*keys)
        if cursor == 0:
            break
