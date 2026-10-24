"""Manage Maasinga logins from the command line.

Usage:
  python users.py add <username> [--role policy|admin]   asks for the password (or set PASSWORD in the environment)
  python users.py list
  python users.py remove <username>

With Docker:  docker compose exec api python users.py add alice --role admin
"""
import argparse
import getpass
import os
import sys
from pathlib import Path

import psycopg
from dotenv import load_dotenv

HERE = Path(__file__).resolve().parent
load_dotenv(HERE / ".env")
from app.passwords import hash_password  # noqa: E402

DB = os.environ.get("DATABASE_URL")
if not DB:
    sys.exit("Set DATABASE_URL in api/.env or the environment (see api/.env.example)")

p = argparse.ArgumentParser(description="Manage Maasinga logins")
sub = p.add_subparsers(dest="cmd", required=True)
a = sub.add_parser("add", help="add a user, or change the password and role of one")
a.add_argument("username")
a.add_argument("--role", choices=["policy", "admin"], default="policy")
sub.add_parser("list", help="list users")
r = sub.add_parser("remove", help="delete a user")
r.add_argument("username")
args = p.parse_args()

with psycopg.connect(DB) as con, con.cursor() as cur:
    cur.execute((HERE / "auth.sql").read_text())
    if args.cmd == "add":
        pw = os.environ.get("PASSWORD") or getpass.getpass(f"Password for {args.username}: ")
        if len(pw) < 8:
            sys.exit("The password needs 8 or more characters")
        cur.execute("INSERT INTO auth.users (username, password_hash, role) VALUES (%s, %s, %s) "
                    "ON CONFLICT (username) DO UPDATE SET password_hash = excluded.password_hash, role = excluded.role",
                    (args.username, hash_password(pw), args.role))
        print(f"saved {args.username} ({args.role})")
    elif args.cmd == "list":
        cur.execute("SELECT username, role, created_at FROM auth.users ORDER BY username")
        for u, role, t in cur.fetchall():
            print(f"{u}\t{role}\t{t:%Y-%m-%d}")
    else:
        cur.execute("DELETE FROM auth.users WHERE username = %s", (args.username,))
        print(f"removed {args.username}" if cur.rowcount else f"no user called {args.username}")
