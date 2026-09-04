#!/usr/bin/env bash
# ─── CleanStreak 后端代码同步脚本 ───
# 用法:
#   ./deploy/sync.sh              # 同步到第一个服务器
#   ./deploy/sync.sh production   # 同步到指定服务器
#   ./deploy/sync.sh --dry-run    # 预览变更（不实际传输）
#
# 依赖: jq, rsync, sshpass(仅密码认证时需要)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CONFIG="$SCRIPT_DIR/config.json"
LOCAL_SRC="$PROJECT_ROOT/fastapi_server/"

# 颜色
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'

info()  { echo -e "${GREEN}[同步]${NC} $*"; }
warn()  { echo -e "${YELLOW}[警告]${NC} $*"; }
error() { echo -e "${RED}[错误]${NC} $*" >&2; exit 1; }

# 依赖检查
command -v jq     >/dev/null 2>&1 || error "缺少 jq，请先安装: brew install jq"
command -v rsync  >/dev/null 2>&1 || error "缺少 rsync"

# 解析参数
DRY_RUN=""
TARGET_NAME=""
for arg in "$@"; do
  case "$arg" in
    --dry-run|-n) DRY_RUN="--dry-run" ;;
    *)            TARGET_NAME="$arg" ;;
  esac
done

# 读取配置
[ -f "$CONFIG" ] || error "配置文件不存在: $CONFIG"

SERVER_COUNT=$(jq '.servers | length' "$CONFIG")
[ "$SERVER_COUNT" -gt 0 ] || error "config.json 中没有配置服务器"

# 选择服务器
if [ -n "$TARGET_NAME" ]; then
  IDX=$(jq -r --arg n "$TARGET_NAME" '.servers | to_entries[] | select(.value.name == $n) | .key' "$CONFIG")
  [ -n "$IDX" ] || error "未找到名为 '$TARGET_NAME' 的服务器"
else
  IDX=0
fi

# 读取配置项
HOST=$(jq -r ".servers[$IDX].host"              "$CONFIG")
PORT=$(jq -r ".servers[$IDX].port // 22"        "$CONFIG")
USER=$(jq -r ".servers[$IDX].user"              "$CONFIG")
AUTH_TYPE=$(jq -r ".servers[$IDX].auth.type"    "$CONFIG")
KEY_PATH=$(jq -r ".servers[$IDX].auth.key_path // \"\"" "$CONFIG")
PASSWORD=$(jq -r ".servers[$IDX].auth.password // \"\"" "$CONFIG")
REMOTE_DIR=$(jq -r ".servers[$IDX].remote_dir"  "$CONFIG")
SERVER_NAME=$(jq -r ".servers[$IDX].name"       "$CONFIG")

# 排除列表
EXCLUDES=$(jq -r ".servers[$IDX].exclude[]? // empty" "$CONFIG" 2>/dev/null || true)

[ "$HOST" != "your-server-ip" ] || error "请先在 config.json 中配置实际服务器 IP"

info "目标: $SERVER_NAME ($USER@$HOST:$PORT)"
info "远程目录: $REMOTE_DIR"
[ -z "$DRY_RUN" ] || info "预览模式 (--dry-run)"

# 构建 SSH 命令
SSH_OPTS="-o StrictHostKeyChecking=no -o ConnectTimeout=10 -p $PORT"

if [ "$AUTH_TYPE" = "key" ]; then
  KEY_EXPANDED="${KEY_PATH/#\~/$HOME}"
  [ -f "$KEY_EXPANDED" ] || error "SSH 密钥不存在: $KEY_EXPANDED"
  SSH_CMD="ssh $SSH_OPTS -i $KEY_EXPANDED"
  RSH_FLAG="-e \"ssh $SSH_OPTS -i $KEY_EXPANDED\""
elif [ "$AUTH_TYPE" = "password" ]; then
  [ -n "$PASSWORD" ] || error "密码认证需要在 config.json 中配置 auth.password"
  command -v sshpass >/dev/null 2>&1 || error "密码认证需要 sshpass: brew install sshpass"
  SSH_CMD="sshpass -p '$PASSWORD' ssh $SSH_OPTS"
  RSH_FLAG="-e \"sshpass -p '$PASSWORD' ssh $SSH_OPTS\""
else
  error "不支持的认证类型: $AUTH_TYPE（支持 key / password）"
fi

# 远程目录不存在则自动创建
info "检查远程目录..."
eval $SSH_CMD "$USER@$HOST" "mkdir -p '$REMOTE_DIR'" 2>/dev/null \
  || error "无法连接服务器或创建目录"

# 构建 rsync 排除参数
EXCLUDE_ARGS=""
while IFS= read -r pattern; do
  [ -z "$pattern" ] || EXCLUDE_ARGS="$EXCLUDE_ARGS --exclude='$pattern'"
done <<< "$EXCLUDES"

# rsync 同步（增量、压缩、最快参数）
info "开始同步..."
RSYNC_CMD="rsync -avz --delete --compress-level=9 --checksum \
  --info=progress2 --stats \
  $EXCLUDE_ARGS \
  $DRY_RUN \
  $RSH_FLAG \
  '$LOCAL_SRC' \
  '$USER@$HOST:$REMOTE_DIR/'"

if [ -n "$DRY_RUN" ]; then
  eval $RSYNC_CMD
  info "预览完成，未实际传输"
else
  eval $RSYNC_CMD
  info "同步完成 ✅"
  info "远程路径: $USER@$HOST:$REMOTE_DIR"
fi
