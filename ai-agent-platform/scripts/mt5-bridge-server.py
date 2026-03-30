#!/usr/bin/env python3
"""
MT5 Bridge Server — Jembatan antara Starclaw AI Agent dan MetaTrader 5.

Jalankan script ini di mesin Windows yang sudah terpasang MetaTrader 5.

Requirements:
    pip install MetaTrader5 flask flask-cors

Jalankan:
    python mt5-bridge-server.py

Konfigurasi di .env Starclaw:
    MT5_BRIDGE_URL=http://<ip-windows>:5000
    MT5_BRIDGE_TOKEN=rahasia-token-anda  (opsional)
"""

import os
import json
import logging
from datetime import datetime, timedelta
from functools import wraps

try:
    import MetaTrader5 as mt5
    MT5_AVAILABLE = True
except ImportError:
    MT5_AVAILABLE = False
    print("[ERROR] MetaTrader5 tidak terinstall. Jalankan: pip install MetaTrader5")

try:
    from flask import Flask, request, jsonify
    from flask_cors import CORS
except ImportError:
    print("[ERROR] Flask tidak terinstall. Jalankan: pip install flask flask-cors")
    exit(1)

# ============================================================
# Setup
# ============================================================
app = Flask(__name__)
CORS(app)

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

BRIDGE_TOKEN = os.environ.get("MT5_BRIDGE_TOKEN", "")
MT5_ACCOUNT  = int(os.environ.get("MT5_ACCOUNT", "0") or "0")
MT5_PASSWORD = os.environ.get("MT5_PASSWORD", "")
MT5_SERVER   = os.environ.get("MT5_SERVER", "")

# ============================================================
# Auth middleware
# ============================================================
def require_auth(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if BRIDGE_TOKEN:
            auth = request.headers.get("Authorization", "")
            if auth != f"Bearer {BRIDGE_TOKEN}":
                return jsonify({"error": "Unauthorized"}), 401
        return f(*args, **kwargs)
    return decorated

# ============================================================
# MT5 connection helper
# ============================================================
def ensure_connected():
    if not MT5_AVAILABLE:
        return False, "MetaTrader5 library tidak tersedia"
    if not mt5.initialize():
        return False, f"Gagal konek ke MT5: {mt5.last_error()}"
    if MT5_ACCOUNT and MT5_PASSWORD and MT5_SERVER:
        if not mt5.login(MT5_ACCOUNT, password=MT5_PASSWORD, server=MT5_SERVER):
            return False, f"Gagal login MT5: {mt5.last_error()}"
    return True, "OK"

# ============================================================
# Routes
# ============================================================

@app.route("/status")
@require_auth
def status():
    ok, msg = ensure_connected()
    if not ok:
        return jsonify({"connected": False, "error": msg})
    info = mt5.terminal_info()
    version = mt5.version()
    return jsonify({
        "connected": True,
        "version": str(version),
        "build": info.build if info else None,
        "connected_to": info.server if info else None,
        "mt5_available": MT5_AVAILABLE,
    })


@app.route("/account")
@require_auth
def account_info():
    ok, msg = ensure_connected()
    if not ok:
        return jsonify({"error": msg}), 500
    info = mt5.account_info()
    if not info:
        return jsonify({"error": f"Gagal ambil info akun: {mt5.last_error()}"}), 500
    return jsonify({
        "login": info.login,
        "name": info.name,
        "server": info.server,
        "currency": info.currency,
        "balance": info.balance,
        "equity": info.equity,
        "margin": info.margin,
        "freeMargin": info.margin_free,
        "marginLevel": round(info.margin_level, 2) if info.margin_level else None,
        "profit": round(info.profit, 2),
        "leverage": info.leverage,
    })


@app.route("/symbol/<symbol>")
@require_auth
def symbol_info(symbol):
    ok, msg = ensure_connected()
    if not ok:
        return jsonify({"error": msg}), 500
    info = mt5.symbol_info(symbol)
    if not info:
        return jsonify({"error": f"Simbol '{symbol}' tidak ditemukan"}), 404
    tick = mt5.symbol_info_tick(symbol)
    return jsonify({
        "symbol": symbol,
        "bid": tick.bid if tick else None,
        "ask": tick.ask if tick else None,
        "spread": info.spread,
        "digits": info.digits,
        "point": info.point,
        "contractSize": info.trade_contract_size,
        "minLot": info.volume_min,
        "maxLot": info.volume_max,
        "lotStep": info.volume_step,
        "tradeMode": info.trade_mode,
    })


@app.route("/positions")
@require_auth
def positions():
    ok, msg = ensure_connected()
    if not ok:
        return jsonify({"error": msg}), 500
    symbol = request.args.get("symbol")
    if symbol:
        pos = mt5.positions_get(symbol=symbol)
    else:
        pos = mt5.positions_get()
    if pos is None:
        return jsonify([])
    result = []
    for p in pos:
        result.append({
            "ticket": p.ticket,
            "symbol": p.symbol,
            "type": "buy" if p.type == 0 else "sell",
            "volume": p.volume,
            "openPrice": p.price_open,
            "currentPrice": p.price_current,
            "sl": p.sl,
            "tp": p.tp,
            "profit": round(p.profit, 2),
            "swap": round(p.swap, 2),
            "comment": p.comment,
            "magic": p.magic,
            "openTime": datetime.fromtimestamp(p.time).isoformat(),
        })
    return jsonify(result)


@app.route("/history")
@require_auth
def history():
    ok, msg = ensure_connected()
    if not ok:
        return jsonify({"error": msg}), 500
    days = int(request.args.get("days", 7))
    date_from = datetime.now() - timedelta(days=days)
    deals = mt5.history_deals_get(date_from, datetime.now())
    if deals is None:
        return jsonify([])
    result = []
    for d in list(deals)[-100:]:  # Batasi 100 deal terakhir
        result.append({
            "ticket": d.ticket,
            "order": d.order,
            "symbol": d.symbol,
            "type": d.type,
            "volume": d.volume,
            "price": d.price,
            "profit": round(d.profit, 2),
            "commission": round(d.commission, 2),
            "swap": round(d.swap, 2),
            "comment": d.comment,
            "time": datetime.fromtimestamp(d.time).isoformat(),
        })
    return jsonify(result)


@app.route("/order", methods=["POST"])
@require_auth
def place_order():
    ok, msg = ensure_connected()
    if not ok:
        return jsonify({"error": msg}), 500

    data = request.get_json()
    symbol  = data.get("symbol")
    otype   = data.get("type", "buy").lower()
    volume  = float(data.get("volume", 0.01))
    sl_pips = float(data.get("sl_pips", 0))
    tp_pips = float(data.get("tp_pips", 0))
    comment = data.get("comment", "Starclaw")
    magic   = int(data.get("magic", 99999))

    if not symbol:
        return jsonify({"error": "symbol wajib"}), 400

    tick = mt5.symbol_info_tick(symbol)
    sym_info = mt5.symbol_info(symbol)
    if not tick or not sym_info:
        return jsonify({"error": f"Simbol '{symbol}' tidak valid atau tidak ditemukan"}), 400

    point = sym_info.point
    digits = sym_info.digits

    if otype == "buy":
        order_type = mt5.ORDER_TYPE_BUY
        price = tick.ask
        sl = round(price - sl_pips * point * 10, digits) if sl_pips else 0.0
        tp = round(price + tp_pips * point * 10, digits) if tp_pips else 0.0
    else:
        order_type = mt5.ORDER_TYPE_SELL
        price = tick.bid
        sl = round(price + sl_pips * point * 10, digits) if sl_pips else 0.0
        tp = round(price - tp_pips * point * 10, digits) if tp_pips else 0.0

    request_obj = {
        "action": mt5.TRADE_ACTION_DEAL,
        "symbol": symbol,
        "volume": volume,
        "type": order_type,
        "price": price,
        "sl": sl,
        "tp": tp,
        "magic": magic,
        "comment": comment,
        "type_time": mt5.ORDER_TIME_GTC,
        "type_filling": mt5.ORDER_FILLING_IOC,
    }

    result = mt5.order_send(request_obj)
    if not result or result.retcode != mt5.TRADE_RETCODE_DONE:
        retcode = result.retcode if result else -1
        msg_err = result.comment if result else "No result"
        return jsonify({"success": False, "retcode": retcode, "error": msg_err}), 400

    logger.info(f"Order {otype.upper()} {volume} {symbol} @ {price} | ticket: {result.order}")
    return jsonify({
        "success": True,
        "ticket": result.order,
        "type": otype,
        "symbol": symbol,
        "volume": volume,
        "price": price,
        "sl": sl,
        "tp": tp,
        "comment": comment,
    })


@app.route("/close", methods=["POST"])
@require_auth
def close_position():
    ok, msg = ensure_connected()
    if not ok:
        return jsonify({"error": msg}), 500

    data = request.get_json()
    ticket = int(data.get("ticket", 0))
    if not ticket:
        return jsonify({"error": "ticket wajib"}), 400

    pos = mt5.positions_get(ticket=ticket)
    if not pos:
        return jsonify({"error": f"Posisi tiket {ticket} tidak ditemukan"}), 404

    p = pos[0]
    tick = mt5.symbol_info_tick(p.symbol)
    close_type = mt5.ORDER_TYPE_SELL if p.type == 0 else mt5.ORDER_TYPE_BUY
    close_price = tick.bid if p.type == 0 else tick.ask

    request_obj = {
        "action": mt5.TRADE_ACTION_DEAL,
        "position": ticket,
        "symbol": p.symbol,
        "volume": p.volume,
        "type": close_type,
        "price": close_price,
        "magic": p.magic,
        "comment": "Starclaw close",
        "type_time": mt5.ORDER_TIME_GTC,
        "type_filling": mt5.ORDER_FILLING_IOC,
    }

    result = mt5.order_send(request_obj)
    if not result or result.retcode != mt5.TRADE_RETCODE_DONE:
        return jsonify({"success": False, "error": result.comment if result else "Failed"}), 400

    return jsonify({"success": True, "ticket": ticket, "closed": True})


@app.route("/close-all", methods=["POST"])
@require_auth
def close_all():
    ok, msg = ensure_connected()
    if not ok:
        return jsonify({"error": msg}), 500

    symbol = request.args.get("symbol")
    if symbol:
        positions = mt5.positions_get(symbol=symbol)
    else:
        positions = mt5.positions_get()

    if not positions:
        return jsonify({"message": "Tidak ada posisi aktif", "closed": 0})

    closed = 0
    errors = []
    for p in positions:
        tick = mt5.symbol_info_tick(p.symbol)
        close_type = mt5.ORDER_TYPE_SELL if p.type == 0 else mt5.ORDER_TYPE_BUY
        close_price = tick.bid if p.type == 0 else tick.ask
        req = {
            "action": mt5.TRADE_ACTION_DEAL,
            "position": p.ticket,
            "symbol": p.symbol,
            "volume": p.volume,
            "type": close_type,
            "price": close_price,
            "comment": "Starclaw close-all",
            "type_time": mt5.ORDER_TIME_GTC,
            "type_filling": mt5.ORDER_FILLING_IOC,
        }
        result = mt5.order_send(req)
        if result and result.retcode == mt5.TRADE_RETCODE_DONE:
            closed += 1
        else:
            errors.append({"ticket": p.ticket, "error": result.comment if result else "Failed"})

    return jsonify({"success": True, "closed": closed, "errors": errors})


# ============================================================
# Main
# ============================================================
if __name__ == "__main__":
    port = int(os.environ.get("MT5_BRIDGE_PORT", 5000))
    host = os.environ.get("MT5_BRIDGE_HOST", "0.0.0.0")

    print(f"""
╔══════════════════════════════════════════════════════════╗
║          MT5 Bridge Server — Starclaw AI Agent           ║
╠══════════════════════════════════════════════════════════╣
║  URL   : http://{host}:{port}                             
║  Auth  : {"Aktif (token dikonfigurasi)" if BRIDGE_TOKEN else "Tidak aktif (set MT5_BRIDGE_TOKEN untuk keamanan)"}
║  MT5   : {"Library tersedia" if MT5_AVAILABLE else "❌ Library tidak ditemukan — pip install MetaTrader5"}
╠══════════════════════════════════════════════════════════╣
║  Set di .env Starclaw:                                   ║
║    MT5_BRIDGE_URL=http://<ip-ini>:{port}                 
║    MT5_BRIDGE_TOKEN={BRIDGE_TOKEN or "(kosong)"}
╚══════════════════════════════════════════════════════════╝
""")

    app.run(host=host, port=port, debug=False)
