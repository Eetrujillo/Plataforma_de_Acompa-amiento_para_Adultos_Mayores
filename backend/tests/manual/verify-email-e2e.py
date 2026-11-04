#!/usr/bin/env python3
"""End-to-end check of the verification-email flow and the error contract.

Manual check, not part of `npm test`: it needs the running stack (backend on
3501, Mongo in the compose network, Mailpit on 8026) and it writes to the real
database, because the defect it was written for lives in the Prisma/Mongo
filter semantics that a fake repository cannot reproduce.

    python3 backend/tests/manual/verify-email-e2e.py

Prints one line per scenario, deletes every account it created and exits
non-zero when a scenario fails.
"""
import json
import re
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime

API = "http://localhost:3501/api"
MAIL = "http://localhost:8026/api/v1"
RUN = str(int(time.time()))
results = []


def http(method, url, body=None, headers=None, raw=None):
    data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("content-type", "application/json")
    for key, value in (headers or {}).items():
        req.add_header(key, value)
    try:
        with urllib.request.urlopen(req) as res:
            payload = res.read().decode()
            try:
                parsed = json.loads(payload) if payload else {}
            except json.JSONDecodeError:
                parsed = {"raw": payload[:120]}
            return res.status, parsed, dict(res.headers)
    except urllib.error.HTTPError as err:
        payload = err.read().decode()
        try:
            parsed = json.loads(payload)
        except json.JSONDecodeError:
            parsed = {"raw": payload[:120]}
        return err.code, parsed, dict(err.headers)


def check(name, condition, detail=""):
    results.append((name, bool(condition), detail))


def messages_for(address):
    status, body, _ = http("GET", f"{MAIL}/messages")
    found = []
    for summary in body.get("messages", []):
        if address in [t["Address"] for t in summary.get("To", [])]:
            found.append(summary)
    return found


def token_from(address, index=-1):
    found = messages_for(address)
    if not found:
        return None, None
    message_id = found[index]["ID"]
    _, detail, _ = http("GET", f"{MAIL}/message/{message_id}")
    text = detail.get("Text") or detail.get("HTML") or ""
    links = re.findall(r"https?://\S+verify-email\S*", text)
    if not links:
        return None, None
    token = urllib.parse.parse_qs(urllib.parse.urlparse(links[0]).query).get("token", [""])[0]
    return links[0], token


def register(email, password="secreto123", accepted=True):
    body = {"email": email, "password": password, "fullName": "E2E Check"}
    if accepted is not None:
        body["acceptedTerms"] = accepted
    return http("POST", f"{API}/auth/register", body)


def prisma_eval(script):
    """Runs a throwaway Node script with the backend's own Prisma client.

    It goes through the container, not through a local mongosh: the backend may be
    pointed at the local Mongo or at the deployed one, and the check has to follow
    whatever the backend actually uses.
    """
    out = subprocess.run(
        ["docker", "exec", "mearn-backend", "node", "-e", script],
        capture_output=True, text=True,
    )
    return (out.stdout or out.stderr).strip()


def cleanup(emails):
    return prisma_eval(
        "const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();"
        "(async()=>{const us=await p.user.findMany({where:{email:{in:%s}},select:{id:true}});"
        "const ids=us.map(u=>u.id);"
        "const t=await p.emailVerificationToken.deleteMany({where:{userId:{in:ids}}});"
        "const u=await p.user.deleteMany({where:{id:{in:ids}}});"
        "console.log(JSON.stringify({users:u.count,tokens:t.count,left:await p.user.count()}));"
        "await p.$disconnect();})();" % json.dumps(emails)
    )


created = []

# --- A/B: registro y correo -------------------------------------------------
email_a = f"chk-a-{RUN}@example.com"
created.append(email_a)
http("DELETE", f"{MAIL}/messages")
status, body, headers = register(email_a)
check("registro responde 201 y verificationSent", status == 201 and body.get("verificationSent") is True, f"HTTP {status}")
check("respuesta de registro trae X-Request-Id", bool(headers.get("X-Request-Id")), headers.get("X-Request-Id", "-"))

time.sleep(1.5)
link, token_a = token_from(email_a)
check("el correo llega y trae el enlace de verificación", bool(link), (link or "")[:60])
check("el enlace apunta al frontend real (3202)", bool(link) and "localhost:3202/verify-email" in link, (link or "")[:60])

# --- C: login antes de verificar -------------------------------------------
status, body, _ = http("POST", f"{API}/auth/login", {"email": email_a, "password": "secreto123"})
check("login antes de verificar responde 403 EMAIL_NOT_VERIFIED",
      status == 403 and body.get("error", {}).get("code") == "EMAIL_NOT_VERIFIED", f"HTTP {status}")

# --- D/E/F: verificación, un solo uso, login -------------------------------
status, body, _ = http("POST", f"{API}/auth/verify-email", {"token": token_a})
check("verificación responde 200 con JWT", status == 200 and body.get("token") and body["user"]["emailVerified"] is True, f"HTTP {status}")

status, body, _ = http("POST", f"{API}/auth/verify-email", {"token": token_a})
check("reutilizar el token responde 400", status == 400 and body.get("error", {}).get("code") == "VALIDATION_ERROR", f"HTTP {status}")

status, body, _ = http("POST", f"{API}/auth/login", {"email": email_a, "password": "secreto123"})
check("login después de verificar responde 200 con JWT", status == 200 and bool(body.get("token")), f"HTTP {status}")

# --- G: reenvío invalida el enlace anterior (defecto encontrado) -----------
email_b = f"chk-b-{RUN}@example.com"
created.append(email_b)
register(email_b)
time.sleep(1.5)
_, token_old = token_from(email_b)
status, body, _ = http("POST", f"{API}/auth/resend-verification", {"email": email_b})
check("reenvío responde 202", status == 202 and body.get("accepted") is True, f"HTTP {status}")
time.sleep(1.5)
_, token_new = token_from(email_b, index=0)
status_old, _, _ = http("POST", f"{API}/auth/verify-email", {"token": token_old})
check("el enlace ANTERIOR al reenvío queda inutilizado", status_old == 400, f"HTTP {status_old}")
status_new, body_new, _ = http("POST", f"{API}/auth/verify-email", {"token": token_new})
check("el enlace NUEVO del reenvío funciona", status_new == 200, f"HTTP {status_new}")

# --- H: token vencido ------------------------------------------------------
email_c = f"chk-c-{RUN}@example.com"
created.append(email_c)
register(email_c)
time.sleep(1.5)
_, token_c = token_from(email_c)
prisma_eval(
    "const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();"
    "(async()=>{const u=await p.user.findUnique({where:{email:'%s'},select:{id:true}});"
    "const r=await p.emailVerificationToken.updateMany("
    "{where:{userId:u.id},data:{expiresAt:new Date(Date.now()-60000)}});"
    "console.log('tokens vencidos a la fuerza (solo la cuenta de prueba):',r.count);"
    "await p.$disconnect();})();" % email_c
)
status, body, _ = http("POST", f"{API}/auth/verify-email", {"token": token_c})
check("token vencido responde 400", status == 400, f"HTTP {status}")

# --- I: contrato de errores ------------------------------------------------
status, body, headers = http("POST", f"{API}/auth/register", raw=b"{", headers={"content-type": "application/json"})
check("JSON inválido responde 400 INVALID_JSON sin internals",
      status == 400 and body.get("error", {}).get("code") == "INVALID_JSON"
      and "at " not in json.dumps(body) and "node_modules" not in json.dumps(body),
      f"HTTP {status} {body.get('error', {}).get('code')}")
check("el 400 trae X-Request-Id en el header", bool(headers.get("X-Request-Id")), headers.get("X-Request-Id", "-"))

status, body, _ = http("POST", f"{API}/auth/register", raw=b'{"x":"' + b"a" * 110000 + b'"}', headers={"content-type": "application/json"})
check("cuerpo mayor a 100kb responde 413 PAYLOAD_TOO_LARGE",
      status == 413 and body.get("error", {}).get("code") == "PAYLOAD_TOO_LARGE", f"HTTP {status}")

status, body, _ = http("GET", f"{API}/no-existe")
check("ruta desconocida responde 404 NOT_FOUND", status == 404 and body.get("error", {}).get("code") == "NOT_FOUND", f"HTTP {status}")

status, _, headers = http("GET", f"{API}/health", headers={"X-Request-Id": "trace-e2e-123456"})
check("X-Request-Id válido del cliente se respeta", headers.get("X-Request-Id") == "trace-e2e-123456", headers.get("X-Request-Id", "-"))

status, _, headers = http("GET", f"{API}/health", headers={"X-Request-Id": "con espacios y raro"})
echoed = headers.get("X-Request-Id", "")
check("X-Request-Id hostil se reemplaza por uno generado",
      echoed != "con espacios y raro" and re.match(r"^[A-Za-z0-9._-]{8,64}$", echoed or "") is not None, echoed)

# --- reporte ---------------------------------------------------------------
print(f"\n{'resultado':<8} escenario")
failures = 0
for name, ok, detail in results:
    if not ok:
        failures += 1
    print(f"{'OK' if ok else 'FALLA':<8} {name}  [{detail}]")

print(f"\n{len(results) - failures}/{len(results)} escenarios OK, {failures} falla(s)")
print("limpieza:", cleanup(created))
raise SystemExit(1 if failures else 0)
