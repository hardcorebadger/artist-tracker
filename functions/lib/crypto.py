"""
AES-256-GCM secret encryption — Python counterpart of indiestack/lib/crypto.ts.

Same serialized format: ``base64(iv):base64(authTag):base64(ciphertext)`` with AES-256-GCM,
a 12-byte IV and 16-byte tag. The generation background job uses this to decrypt the
operator Spotify refresh token that indiestack stored. Key: ``SPOTIFY_TOKEN_ENC_KEY``
(base64-encoded 32-byte key), shared with indiestack.

Requires the ``cryptography`` package.
"""

import base64
import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

IV_LENGTH = 12
TAG_LENGTH = 16


def _get_key() -> bytes:
    raw = os.environ.get('SPOTIFY_TOKEN_ENC_KEY')
    if not raw:
        raise RuntimeError('SPOTIFY_TOKEN_ENC_KEY is not set')
    key = base64.b64decode(raw)
    if len(key) != 32:
        raise RuntimeError('SPOTIFY_TOKEN_ENC_KEY must decode to 32 bytes (base64-encoded AES-256 key)')
    return key


def encrypt_secret(plaintext: str) -> str:
    iv = os.urandom(IV_LENGTH)
    aes = AESGCM(_get_key())
    ct_and_tag = aes.encrypt(iv, plaintext.encode('utf-8'), None)
    ciphertext, tag = ct_and_tag[:-TAG_LENGTH], ct_and_tag[-TAG_LENGTH:]
    return ':'.join([
        base64.b64encode(iv).decode('ascii'),
        base64.b64encode(tag).decode('ascii'),
        base64.b64encode(ciphertext).decode('ascii'),
    ])


def decrypt_secret(payload: str) -> str:
    parts = payload.split(':')
    if len(parts) != 3:
        raise ValueError('Malformed encrypted secret')
    iv = base64.b64decode(parts[0])
    tag = base64.b64decode(parts[1])
    ciphertext = base64.b64decode(parts[2])
    aes = AESGCM(_get_key())
    plaintext = aes.decrypt(iv, ciphertext + tag, None)
    return plaintext.decode('utf-8')
