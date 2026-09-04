#!/usr/bin/env python3
"""后端代码同步到远程服务器（rsync + SSH/密码）"""

import json
import os
import subprocess
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent
CONFIG_PATH = SCRIPT_DIR / "config.json"
LOCAL_SRC = str(PROJECT_ROOT / "fastapi_server") + "/"

# 颜色
G, Y, R, N = "\033[0;32m", "\033[1;33m", "\033[0;31m", "\033[0m"
def info(t):  print(f"{G}[同步]{N} {t}")
def warn(t):  print(f"{Y}[警告]{N} {t}")
def error(t): print(f"{R}[错误]{N} {t}", file=sys.stderr); sys.exit(1)


def load_config():
    if not CONFIG_PATH.exists():
        error(f"配置文件不存在: {CONFIG_PATH}")
    with open(CONFIG_PATH) as f:
        cfg = json.load(f)
    servers = cfg.get("servers", [])
    if not servers:
        error("config.json 中没有配置服务器")
    return servers


def pick_server(servers, name=None):
    if name:
        for s in servers:
            if s.get("name") == name:
                return s
        error(f"未找到名为 '{name}' 的服务器")

    if len(servers) == 1:
        s = servers[0]
        info(f"仅一台服务器，自动选择: {s['name']}")
        return s

    print("\n可用服务器:")
    for i, s in enumerate(servers):
        print(f"  [{i + 1}] {s['name']} ({s['user']}@{s['host']}:{s.get('port', 22)})")
    while True:
        try:
            idx = int(input("\n选择序号: ")) - 1
            if 0 <= idx < len(servers):
                return servers[idx]
        except (ValueError, EOFError):
            pass
        print("无效输入，请重试")


def run_remote(srv, cmd):
    """通过 SSH 执行远程命令"""
    auth = srv.get("auth", {})
    port = str(srv.get("port", 22))
    user_host = f"{srv['user']}@{srv['host']}"
    ssh_opts = ["-o", "StrictHostKeyChecking=no", "-o", "ConnectTimeout=10", "-p", port]

    if auth.get("type") == "key":
        key = os.path.expanduser(auth.get("key_path", "~/.ssh/id_rsa"))
        if not os.path.isfile(key):
            error(f"SSH 密钥不存在: {key}")
        full_cmd = ["ssh"] + ssh_opts + ["-i", key, user_host, cmd]
    elif auth.get("type") == "password":
        password = auth.get("password", "")
        if not password:
            error("密码认证需要在 config.json 中配置 auth.password")
        if subprocess.run(["which", "sshpass"], capture_output=True).returncode != 0:
            error("密码认证需要 sshpass: brew install sshpass")
        full_cmd = ["sshpass", "-p", password, "ssh"] + ssh_opts + [user_host, cmd]
    else:
        error(f"不支持的认证类型: {auth.get('type')}（支持 key / password）")

    return subprocess.run(full_cmd, capture_output=True, text=True)


def rsync(srv, dry_run=False):
    auth = srv.get("auth", {})
    port = str(srv.get("port", 22))
    user_host = f"{srv['user']}@{srv['host']}"
    remote_dir = srv["remote_dir"]
    excludes = srv.get("exclude", [])
    ssh_opts = f"ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 -p {port}"

    # 构建 rsync 命令
    cmd = [
        "rsync", "-avz", "--delete",
        "--compress-level=9", "--checksum",
        "--progress", "--stats",
    ]

    # 排除
    for pat in excludes:
        cmd += ["--exclude", pat]

    # SSH 认证方式
    if auth.get("type") == "key":
        key = os.path.expanduser(auth.get("key_path", "~/.ssh/id_rsa"))
        if not os.path.isfile(key):
            error(f"SSH 密钥不存在: {key}")
        cmd += ["-e", f"{ssh_opts} -i {key}"]
    elif auth.get("type") == "password":
        password = auth.get("password", "")
        if not password:
            error("密码认证需要配置 auth.password")
        if subprocess.run(["which", "sshpass"], capture_output=True).returncode != 0:
            error("密码认证需要 sshpass: brew install sshpass")
        cmd += ["-e", f"sshpass -p {password} {ssh_opts}"]

    if dry_run:
        cmd.append("--dry-run")

    cmd += [LOCAL_SRC, f"{user_host}:{remote_dir}/"]
    return subprocess.run(cmd)


def main():
    dry_run = "--dry-run" in sys.argv or "-n" in sys.argv
    target = next((a for a in sys.argv[1:] if not a.startswith("-")), None)

    servers = load_config()
    srv = pick_server(servers, target)

    host = srv["host"]
    if host == "your-server-ip":
        error("请先在 config.json 中配置实际服务器 IP")

    info(f"目标: {srv['name']} ({srv['user']}@{host}:{srv.get('port', 22)})")
    info(f"远程目录: {srv['remote_dir']}")
    if dry_run:
        info("预览模式 (--dry-run)")

    # 检查/创建远程目录
    info("检查远程目录...")
    ret = run_remote(srv, f"mkdir -p '{srv['remote_dir']}'")
    if ret.returncode != 0:
        error(f"无法连接服务器: {ret.stderr.strip()}")

    # rsync 同步
    info("开始同步...")
    ret = rsync(srv, dry_run)
    if ret.returncode != 0:
        error("同步失败")

    if dry_run:
        info("预览完成，未实际传输")
    else:
        info("同步完成 ✅")
        info(f"远程路径: {srv['user']}@{host}:{srv['remote_dir']}")


if __name__ == "__main__":
    main()
