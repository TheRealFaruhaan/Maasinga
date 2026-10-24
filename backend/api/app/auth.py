"""Login and permissions for the Maasinga API.

- Users live in the "auth" schema (auth.sql), which seed.py never drops.
- POST /auth/login checks the password and returns a signed token (JWT, HS256) that is valid for TOKEN_HOURS.
- Protected routes need the header "Authorization: Bearer <token>". Each request checks that the user still
  exists and reads the role from the database, so deleting or demoting a user takes effect at once.
- Roles: "policy" (sees the protected data) and "admin" (also manages users). Public routes need no login.
- Passwords are stored as scrypt hashes.
"""
import os
import time
from typing import Literal

import jwt
from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field

from app.passwords import check_password, hash_password

SECRET = os.environ.get("JWT_SECRET")
if not SECRET or len(SECRET) < 32 or SECRET.startswith("change-me"):
    raise RuntimeError("Set JWT_SECRET (32 or more random characters) in api/.env or the environment (see api/.env.example)")
TOKEN_HOURS = float(os.environ.get("TOKEN_HOURS", "12"))
RANK = {"policy": 1, "admin": 2}
Role = Literal["policy", "admin"]

bearer = HTTPBearer(auto_error=False, description="Token from POST /auth/login")
router = APIRouter(prefix="/auth", tags=["auth"])
_rows = None  # set by main.py: the rows(sql, *args) helper


def need(role: Role):
    """Dependency for a route that needs a login with at least this role."""
    def check(cred: HTTPAuthorizationCredentials | None = Depends(bearer)):
        if cred is None:
            raise HTTPException(401, "Login needed", headers={"WWW-Authenticate": "Bearer"})
        try:
            claims = jwt.decode(cred.credentials, SECRET, algorithms=["HS256"])
        except jwt.PyJWTError:
            raise HTTPException(401, "Token is not valid or has expired", headers={"WWW-Authenticate": "Bearer"})
        user = _rows("SELECT username, role FROM auth.users WHERE username = %s", claims.get("sub"))
        if not user:
            raise HTTPException(401, "User no longer exists", headers={"WWW-Authenticate": "Bearer"})
        if RANK[user[0]["role"]] < RANK[role]:
            raise HTTPException(403, f"Needs the {role} role")
        return user[0]
    return check


POLICY = Depends(need("policy"))
ADMIN = Depends(need("admin"))


class Login(BaseModel):
    username: str
    password: str


class NewUser(BaseModel):
    username: str = Field(min_length=3, max_length=64, pattern=r"^[A-Za-z0-9_.@-]+$")
    password: str = Field(min_length=8)
    role: Role = "policy"


@router.post("/login")
def login(body: Login):
    """Check a username and password. Returns a token to send as "Authorization: Bearer <token>"."""
    user = _rows("SELECT username, password_hash, role FROM auth.users WHERE username = %s", body.username)
    if not user or not check_password(body.password, user[0]["password_hash"]):
        time.sleep(0.5)  # slows down password guessing
        raise HTTPException(401, "Wrong username or password")
    exp = int(time.time() + TOKEN_HOURS * 3600)
    token = jwt.encode({"sub": user[0]["username"], "role": user[0]["role"], "exp": exp, "iat": int(time.time())}, SECRET, algorithm="HS256")
    return {"access_token": token, "token_type": "bearer", "expires_at": exp, "user": {"username": user[0]["username"], "role": user[0]["role"]}}


@router.get("/me")
def me(user=POLICY):
    """The logged-in user."""
    return user


@router.get("/users")
def list_users(_=ADMIN):
    """All users (admin only)."""
    return _rows("SELECT username, role, to_char(created_at, 'YYYY-MM-DD\"T\"HH24:MI') AS created FROM auth.users ORDER BY username")


@router.post("/users", status_code=201)
def add_user(body: NewUser, _=ADMIN):
    """Add a user, or set a new password and role for an existing one (admin only)."""
    _rows("INSERT INTO auth.users (username, password_hash, role) VALUES (%s, %s, %s) "
          "ON CONFLICT (username) DO UPDATE SET password_hash = excluded.password_hash, role = excluded.role RETURNING username",
          body.username, hash_password(body.password), body.role)
    return {"username": body.username, "role": body.role}


@router.delete("/users/{username}")
def delete_user(username: str, admin=ADMIN):
    """Delete a user (admin only). An admin cannot delete themself."""
    if username == admin["username"]:
        raise HTTPException(400, "You cannot delete yourself")
    if not _rows("DELETE FROM auth.users WHERE username = %s RETURNING username", username):
        raise HTTPException(404, f"No user called {username}")
    return {"deleted": username}
