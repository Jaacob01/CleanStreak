"""对称加密工具：AI api_key 等敏感字段落库前加密

密钥来自 AI_SECRET_KEY，未配置时从 SECRET_KEY 派生，保证开箱可用。
"""
import base64
import hashlib

from cryptography.fernet import Fernet, InvalidToken

from app.config import settings


def _fernet() -> Fernet:
    secret = settings.AI_SECRET_KEY or f"{settings.SECRET_KEY}:ai-api-key"
    digest = hashlib.sha256(secret.encode("utf-8")).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def encrypt(plaintext: str) -> str:
    return _fernet().encrypt(plaintext.encode("utf-8")).decode("utf-8")


def decrypt(ciphertext: str) -> str:
    try:
        return _fernet().decrypt(ciphertext.encode("utf-8")).decode("utf-8")
    except InvalidToken:
        # 密钥变更后旧数据不可解，视为未配置
        return ""
